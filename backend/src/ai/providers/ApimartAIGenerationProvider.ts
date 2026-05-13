import type { AIGenerationProvider } from "./AIGenerationProvider.js";
import type {
  AIGeneratedImage,
  AIGenerationRequest,
  AIGenerationResponse,
  AIGenerationStatus,
  AIProviderId,
  AIProviderRuntimeConfig,
  AIServiceError,
  JsonValue,
  Size,
} from "../types.js";

const now = () => new Date().toISOString();

const APIMART_DEFAULT_BASE_URL = "https://api.apimart.ai";
const APIMART_DEFAULT_MODEL = "doubao-seedance-4-0";
const APIMART_DEFAULT_RESOLUTION = "2K";
const APIMART_RESULT_LANGUAGE = "en";

const ratioOptions = [
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
  { label: "21:9", ratio: 21 / 9 },
  { label: "9:21", ratio: 9 / 21 },
] as const;

interface ApimartResponseErrorPayload {
  code?: number;
  message?: string;
  type?: string;
}

interface ApimartCreateGenerationResponse {
  code?: number;
  data?: Array<{
    status?: string;
    task_id?: string;
  }>;
  error?: ApimartResponseErrorPayload;
}

interface ApimartTaskImageResult {
  url?: string[];
  expires_at?: number;
}

interface ApimartTaskStatusResponse {
  code?: number;
  data?: {
    id?: string;
    status?: string;
    progress?: number;
    result?: {
      images?: ApimartTaskImageResult[];
    };
    created?: number;
    completed?: number;
    error?: ApimartResponseErrorPayload;
  };
  error?: ApimartResponseErrorPayload;
}

interface StoredGenerationContext {
  blockId: string;
  createdAt: string;
  outputSize: Size;
  model: string;
  size: string;
  resolution: string;
  warnings: string[];
}

class ApimartHttpError extends Error {
  readonly status: number;

  readonly details?: Record<string, JsonValue>;

  constructor(
    message: string,
    status: number,
    details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = "ApimartHttpError";
    this.status = status;
    this.details = details;
  }
}

const normalizeBaseUrl = (baseUrl?: string) => {
  const normalized = (baseUrl ?? APIMART_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return normalized.endsWith("/v1")
    ? normalized.slice(0, normalized.length - 3)
    : normalized;
};

const inferApimartSize = (outputSize: Size) => {
  if (outputSize.width <= 0 || outputSize.height <= 0) {
    return "1:1";
  }

  const targetRatio = outputSize.width / outputSize.height;
  let bestMatch: (typeof ratioOptions)[number] = ratioOptions[0];
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of ratioOptions) {
    const delta = Math.abs(Math.log(targetRatio) - Math.log(option.ratio));

    if (delta < bestDelta) {
      bestDelta = delta;
      bestMatch = option;
    }
  }

  return bestMatch.label;
};

const guessMimeType = (url: string) => {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes(".jpg") || normalizedUrl.includes(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedUrl.includes(".webp")) {
    return "image/webp";
  }

  if (normalizedUrl.includes(".gif")) {
    return "image/gif";
  }

  if (normalizedUrl.includes(".svg")) {
    return "image/svg+xml";
  }

  return "image/png";
};

const unixToIsoString = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : undefined;

const mapSubmittedStatus = (): AIGenerationStatus => "queued";

const mapTaskStatus = (status?: string): AIGenerationStatus => {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
};

const createTaskError = (
  providerId: AIProviderId,
  payload?: ApimartResponseErrorPayload,
): AIServiceError | undefined => {
  if (!payload?.message) {
    return undefined;
  }

  return {
    code: "PROVIDER_ERROR",
    message: payload.message,
    providerId,
    retryable: false,
    details: {
      providerErrorCode: payload.code ?? null,
      providerErrorType: payload.type ?? null,
    },
  };
};

const buildCompletedImages = (
  generationId: string,
  context: StoredGenerationContext,
  images: ApimartTaskImageResult[] | undefined,
): AIGeneratedImage[] => {
  if (!images?.length) {
    return [];
  }

  return images.flatMap((imageGroup, groupIndex) =>
    (imageGroup.url ?? []).map((url, urlIndex) => ({
      assetId: `apimart_asset_${generationId}_${groupIndex}_${urlIndex}`,
      url,
      previewUrl: url,
      mimeType: guessMimeType(url),
      width: context.outputSize.width,
      height: context.outputSize.height,
      providerMetadata: {
        model: context.model,
        size: context.size,
        resolution: context.resolution,
        expiresAt: imageGroup.expires_at ?? null,
      },
    })),
  );
};

export class ApimartAIGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "apimart";

  readonly displayName = "APIMart Image Generation";

  readonly capabilities = {
    supportsReferenceImages: true,
    supportsTransparentBackground: false,
    supportsStreaming: false,
    supportsPolling: true,
    maxImageSize: {
      width: 4096,
      height: 4096,
    },
    supportedFormats: ["png", "jpeg", "webp"] as const,
    supportsVideo: false,
  };

  private readonly apiKey: string;

  private readonly model: string;

  private readonly baseUrl: string;

  private readonly generations = new Map<string, StoredGenerationContext>();

  constructor(private readonly config: AIProviderRuntimeConfig) {
    if (!config.apiKey) {
      throw new Error("Missing APIMart API key.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? APIMART_DEFAULT_MODEL;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.config.extraHeaders,
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    });

    const rawText = await response.text();
    let payload = {} as T & { error?: ApimartResponseErrorPayload };

    if (rawText) {
      try {
        payload = JSON.parse(rawText) as T & { error?: ApimartResponseErrorPayload };
      } catch {
        if (!response.ok) {
          throw new ApimartHttpError(
            `APIMart request failed with status ${response.status}.`,
            response.status,
            {
              httpStatus: response.status,
              responseBody: rawText.slice(0, 500),
            },
          );
        }

        throw new Error("APIMart response was not valid JSON.");
      }
    }

    if (!response.ok) {
      const responseError = (payload as { error?: ApimartResponseErrorPayload }).error;
      throw new ApimartHttpError(
        responseError?.message ??
          `APIMart request failed with status ${response.status}.`,
        response.status,
        {
          httpStatus: response.status,
          providerErrorCode: responseError?.code ?? null,
          providerErrorType: responseError?.type ?? null,
        },
      );
    }

    return payload;
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    const size = inferApimartSize(request.outputSize);
    const resolution = APIMART_DEFAULT_RESOLUTION;
    const warnings = [
      "APIMart generated image URLs expire after 24 hours. Save them promptly.",
    ];

    if (request.negativePrompt) {
      warnings.push(
        "negativePrompt is not mapped to the current APIMart image request.",
      );
    }

    const payload = {
      model: this.model,
      prompt: request.prompt,
      size,
      resolution,
      n: 1,
      ...(request.referenceAssets?.length
        ? {
            image_urls: request.referenceAssets.map((asset) => asset.url),
          }
        : {}),
    };

    const submission = await this.request<ApimartCreateGenerationResponse>(
      "/v1/images/generations",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const task = submission.data?.[0];
    const generationId = task?.task_id;

    if (!generationId) {
      throw new Error("APIMart generation response did not include a task_id.");
    }

    const timestamp = now();

    this.generations.set(generationId, {
      blockId: request.blockId,
      createdAt: timestamp,
      outputSize: request.outputSize,
      model: this.model,
      size,
      resolution,
      warnings,
    });

    return {
      generationId,
      providerId: this.providerId,
      blockId: request.blockId,
      status: mapSubmittedStatus(),
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 0,
      images: [],
      warnings,
    };
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    const context = this.generations.get(generationId);

    if (!context) {
      throw new Error(`APIMart generation not found: ${generationId}`);
    }

    const task = await this.request<ApimartTaskStatusResponse>(
      `/v1/tasks/${encodeURIComponent(generationId)}?language=${APIMART_RESULT_LANGUAGE}`,
    );

    const taskData = task.data;

    if (!taskData?.id) {
      throw new Error(`APIMart task response was missing task data: ${generationId}`);
    }

    const status = mapTaskStatus(taskData.status);
    const createdAt = unixToIsoString(taskData.created) ?? context.createdAt;
    const completedAt = unixToIsoString(taskData.completed);

    return {
      generationId: taskData.id,
      providerId: this.providerId,
      blockId: context.blockId,
      status,
      createdAt,
      updatedAt:
        status === "completed" || status === "failed" || status === "cancelled"
          ? completedAt ?? now()
          : now(),
      progress:
        typeof taskData.progress === "number"
          ? taskData.progress
          : status === "queued"
            ? 0
            : status === "running"
              ? 50
              : status === "completed"
                ? 100
                : 0,
      images:
        status === "completed"
          ? buildCompletedImages(
              generationId,
              context,
              taskData.result?.images,
            )
          : [],
      warnings: context.warnings,
      error:
        status === "failed"
          ? createTaskError(this.providerId, taskData.error)
          : undefined,
    };
  }
}
