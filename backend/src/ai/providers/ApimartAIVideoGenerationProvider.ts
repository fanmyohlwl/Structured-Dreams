import type { AIVideoGenerationProvider } from "./AIVideoGenerationProvider.js";
import type {
  AIGenerationStatus,
  AIProviderId,
  AIProviderRuntimeConfig,
  AIServiceError,
  JsonValue,
  Size,
} from "../types.js";
import type {
  AIGeneratedVideo,
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
} from "../videoTypes.js";

const now = () => new Date().toISOString();

const APIMART_DEFAULT_BASE_URL = "https://api.apimart.ai";
const APIMART_DEFAULT_MODEL = "doubao-seedance-2.0-fast";
const APIMART_DEFAULT_RESOLUTION = "720p";
const APIMART_RESULT_LANGUAGE = "en";

const ratioOptions = [
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "21:9", ratio: 21 / 9 },
] as const;

interface ApimartResponseErrorPayload {
  code?: number;
  message?: string;
  type?: string;
}

interface ApimartCreateVideoGenerationResponse {
  code?: number;
  data?: Array<{
    status?: string;
    task_id?: string;
  }>;
  error?: ApimartResponseErrorPayload;
}

type ApimartTaskVideoResult =
  | string
  | {
      url?: string | string[];
      video_url?: string;
      download_url?: string;
      expires_at?: number;
      mime_type?: string;
      width?: number;
      height?: number;
      duration?: number;
      duration_ms?: number;
      thumbnail_url?: string;
      poster_url?: string;
      preview_image_url?: string;
      preview_url?: string;
    };

interface ApimartTaskStatusResponse {
  code?: number;
  data?: {
    id?: string;
    status?: string;
    progress?: number;
    result?: {
      videos?: ApimartTaskVideoResult[];
      thumbnail_url?: string;
    };
    created?: number;
    completed?: number;
    error?: ApimartResponseErrorPayload;
  };
  error?: ApimartResponseErrorPayload;
}

interface StoredVideoGenerationContext {
  blockId: string;
  createdAt: string;
  outputSize: Size;
  model: string;
  aspectRatio: string;
  durationSeconds: number;
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

const inferApimartAspectRatio = (outputSize: Size) => {
  if (outputSize.width <= 0 || outputSize.height <= 0) {
    return "16:9";
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

const normalizeDurationSeconds = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 5;
  }

  return Math.min(15, Math.max(4, Math.round(value)));
};

const usesSizeParameter = (model: string) =>
  /doubao-seedance-2\.0/i.test(model);

const guessVideoMimeType = (url: string, fallback = "video/mp4") => {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes(".webm")) {
    return "video/webm";
  }

  if (normalizedUrl.includes(".mov") || normalizedUrl.includes(".qt")) {
    return "video/quicktime";
  }

  if (normalizedUrl.includes(".ogv") || normalizedUrl.includes(".ogg")) {
    return "video/ogg";
  }

  if (normalizedUrl.includes(".mp4")) {
    return "video/mp4";
  }

  return fallback;
};

const guessImageMimeType = (url: string, fallback = "image/png") => {
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

  if (normalizedUrl.includes(".png")) {
    return "image/png";
  }

  return fallback;
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

const extractVideoUrl = (video: ApimartTaskVideoResult): string | undefined => {
  if (typeof video === "string") {
    return video;
  }

  if (typeof video.video_url === "string" && video.video_url) {
    return video.video_url;
  }

  if (typeof video.download_url === "string" && video.download_url) {
    return video.download_url;
  }

  if (Array.isArray(video.url)) {
    return video.url.find((value) => typeof value === "string" && value);
  }

  if (typeof video.url === "string" && video.url) {
    return video.url;
  }

  return undefined;
};

const extractPosterUrl = (
  video: ApimartTaskVideoResult,
  fallbackThumbnailUrl?: string,
): string | undefined => {
  if (typeof video === "string") {
    return fallbackThumbnailUrl;
  }

  return (
    video.thumbnail_url ??
    video.poster_url ??
    video.preview_image_url ??
    video.preview_url ??
    fallbackThumbnailUrl
  );
};

const inferDimensions = (
  context: StoredVideoGenerationContext,
  video: ApimartTaskVideoResult,
) => {
  if (
    typeof video !== "string" &&
    typeof video.width === "number" &&
    Number.isFinite(video.width) &&
    typeof video.height === "number" &&
    Number.isFinite(video.height)
  ) {
    return {
      width: video.width,
      height: video.height,
      inferred: false,
    };
  }

  return {
    width: context.outputSize.width,
    height: context.outputSize.height,
    inferred: true,
  };
};

const inferDurationMs = (
  context: StoredVideoGenerationContext,
  video: ApimartTaskVideoResult,
) => {
  if (
    typeof video !== "string" &&
    typeof video.duration_ms === "number" &&
    Number.isFinite(video.duration_ms)
  ) {
    return {
      durationMs: video.duration_ms,
      inferred: false,
    };
  }

  if (
    typeof video !== "string" &&
    typeof video.duration === "number" &&
    Number.isFinite(video.duration)
  ) {
    return {
      durationMs: Math.round(video.duration * 1000),
      inferred: false,
    };
  }

  return {
    durationMs: context.durationSeconds * 1000,
    inferred: true,
  };
};

const buildCompletedVideos = (
  generationId: string,
  context: StoredVideoGenerationContext,
  videos: ApimartTaskVideoResult[] | undefined,
  fallbackThumbnailUrl?: string,
): AIGeneratedVideo[] => {
  if (!videos?.length) {
    return [];
  }

  return videos.flatMap((video, index) => {
    const videoUrl = extractVideoUrl(video);

    if (!videoUrl) {
      return [];
    }

    const posterUrl = extractPosterUrl(video, fallbackThumbnailUrl);
    const dimensions = inferDimensions(context, video);
    const duration = inferDurationMs(context, video);
    const mimeType =
      typeof video !== "string" && typeof video.mime_type === "string"
        ? video.mime_type
        : guessVideoMimeType(videoUrl);
    const posterMimeType = posterUrl
      ? guessImageMimeType(posterUrl)
      : undefined;
    const providerMetadata: Record<string, JsonValue> = {
      model: context.model,
      aspectRatio: context.aspectRatio,
      resolution: context.resolution,
      dimensionsInferred: dimensions.inferred,
      durationInferred: duration.inferred,
      thumbnailSource:
        posterUrl && posterUrl === fallbackThumbnailUrl
          ? "task.thumbnail_url"
          : posterUrl
            ? "video.result"
            : null,
      resultShape:
        typeof video === "string"
          ? "string"
          : Array.isArray(video.url)
            ? "object:url[]"
            : typeof video.url === "string"
              ? "object:url"
              : video.video_url
                ? "object:video_url"
                : video.download_url
                  ? "object:download_url"
                  : "object:unknown",
    };

    if (typeof video !== "string" && typeof video.expires_at === "number") {
      providerMetadata.expiresAt = video.expires_at;
    }

    return [
      {
        assetId: `apimart_video_${generationId}_${index}`,
        url: videoUrl,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        durationMs: duration.durationMs,
        posterAssetId: posterUrl
          ? `apimart_video_poster_${generationId}_${index}`
          : undefined,
        posterUrl,
        posterMimeType,
        previewImageAssetId: posterUrl
          ? `apimart_video_preview_${generationId}_${index}`
          : undefined,
        previewImageUrl: posterUrl,
        previewImageMimeType: posterMimeType,
        providerMetadata,
      },
    ];
  });
};

export class ApimartAIVideoGenerationProvider
  implements AIVideoGenerationProvider
{
  readonly providerId: AIProviderId = "apimart";

  readonly displayName = "APIMart Video Generation";

  private readonly apiKey: string;

  private readonly model: string;

  private readonly resolution: string;

  private readonly baseUrl: string;

  private readonly generations = new Map<string, StoredVideoGenerationContext>();

  constructor(private readonly config: AIProviderRuntimeConfig) {
    if (!config.apiKey) {
      throw new Error("Missing APIMart video API key.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? APIMART_DEFAULT_MODEL;
    this.resolution = config.resolution ?? APIMART_DEFAULT_RESOLUTION;
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
            `APIMart video request failed with status ${response.status}.`,
            response.status,
            {
              httpStatus: response.status,
              responseBody: rawText.slice(0, 500),
            },
          );
        }

        throw new Error("APIMart video response was not valid JSON.");
      }
    }

    if (!response.ok) {
      const responseError = (payload as { error?: ApimartResponseErrorPayload })
        .error;
      throw new ApimartHttpError(
        responseError?.message ??
          `APIMart video request failed with status ${response.status}.`,
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

  async generateVideo(
    request: AIVideoGenerationRequest,
  ): Promise<AIVideoGenerationResponse> {
    const aspectRatio =
      request.aspectRatio ?? inferApimartAspectRatio(request.outputSize);
    const durationSeconds = normalizeDurationSeconds(request.durationSeconds);
    const warnings = [
      "APIMart generated video links can expire quickly. Completed results are persisted to backend assets immediately.",
    ];

    if (request.negativePrompt) {
      warnings.push(
        "negativePrompt is not mapped to the current APIMart video request.",
      );
    }

    const payload: Record<string, JsonValue> = {
      model: this.model,
      prompt: request.prompt,
      duration: durationSeconds,
      resolution: this.resolution,
    };

    if (usesSizeParameter(this.model)) {
      payload.size = aspectRatio;
    } else {
      payload.aspect_ratio = aspectRatio;
    }

    if (request.referenceAssets?.length) {
      payload.image_urls = request.referenceAssets.map((asset) => asset.url);
    }

    const submission = await this.request<ApimartCreateVideoGenerationResponse>(
      "/v1/videos/generations",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const task = submission.data?.[0];
    const generationId = task?.task_id;

    if (!generationId) {
      throw new Error(
        "APIMart video generation response did not include a task_id.",
      );
    }

    const timestamp = now();

    this.generations.set(generationId, {
      blockId: request.blockId,
      createdAt: timestamp,
      outputSize: request.outputSize,
      model: this.model,
      aspectRatio,
      durationSeconds,
      resolution: this.resolution,
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
      videos: [],
      warnings,
    };
  }

  async getVideoGenerationResult(
    generationId: string,
  ): Promise<AIVideoGenerationResponse> {
    const context = this.generations.get(generationId);

    if (!context) {
      throw new Error(`APIMart video generation not found: ${generationId}`);
    }

    const task = await this.request<ApimartTaskStatusResponse>(
      `/v1/tasks/${encodeURIComponent(generationId)}?language=${APIMART_RESULT_LANGUAGE}`,
    );

    const taskData = task.data;

    if (!taskData?.id) {
      throw new Error(
        `APIMart video task response was missing task data: ${generationId}`,
      );
    }

    const status = mapTaskStatus(taskData.status);
    const createdAt = unixToIsoString(taskData.created) ?? context.createdAt;
    const completedAt = unixToIsoString(taskData.completed);
    const completedVideos =
      status === "completed"
        ? buildCompletedVideos(
            generationId,
            context,
            taskData.result?.videos,
            taskData.result?.thumbnail_url,
          )
        : [];

    if (status === "completed" && completedVideos.length === 0) {
      throw new ApimartHttpError(
        `APIMart video task completed without a usable video URL: ${generationId}`,
        502,
        {
          stage: "result-mapping",
          taskStatus: taskData.status ?? null,
          hasVideosArray: Array.isArray(taskData.result?.videos),
          hasThumbnailUrl: Boolean(taskData.result?.thumbnail_url),
        },
      );
    }

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
      videos: completedVideos,
      warnings: context.warnings,
      error:
        status === "failed"
          ? createTaskError(this.providerId, taskData.error)
          : undefined,
    };
  }
}
