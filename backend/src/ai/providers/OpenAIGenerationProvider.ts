import type { AIGenerationProvider } from "./AIGenerationProvider.js";
import type {
  AIGeneratedImage,
  AIGenerationImageFormat,
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderRuntimeConfig,
  JsonValue,
  Size,
} from "../types.js";

const now = () => new Date().toISOString();

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-image-1.5";

interface OpenAIImageData {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface OpenAIImageResponse {
  created?: number;
  data?: OpenAIImageData[];
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

class OpenAIImageHttpError extends Error {
  readonly status: number;

  readonly details?: Record<string, JsonValue>;

  constructor(
    message: string,
    status: number,
    details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = "OpenAIImageHttpError";
    this.status = status;
    this.details = details;
  }
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const inferOpenAIImageSize = (outputSize: Size) => {
  const ratio = outputSize.width / Math.max(outputSize.height, 1);

  if (ratio > 1.2) {
    return "1536x1024";
  }

  if (ratio < 0.85) {
    return "1024x1536";
  }

  return "1024x1024";
};

const normalizeFormat = (
  format: AIGenerationImageFormat | undefined,
): AIGenerationImageFormat => {
  if (format === "jpeg" || format === "webp") {
    return format;
  }

  return "png";
};

const dataUrlFromBase64 = (base64: string, mimeType: string) =>
  `data:${mimeType};base64,${base64}`;

const guessMimeType = (format: AIGenerationImageFormat) => {
  if (format === "jpeg") {
    return "image/jpeg";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "image/png";
};

const parseDataUrl = (url: string) => {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const body = match[2] ?? "";
  const buffer = url.includes(";base64,")
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body));

  return {
    buffer,
    mimeType,
  };
};

const fetchReferenceAsset = async (
  asset: NonNullable<AIGenerationRequest["referenceAssets"]>[number],
) => {
  if (asset.url.startsWith("data:")) {
    const parsed = parseDataUrl(asset.url);

    if (!parsed) {
      throw new Error("Reference image data URL could not be parsed.");
    }

    return {
      buffer: parsed.buffer,
      mimeType: asset.mimeType ?? parsed.mimeType,
    };
  }

  if (/^https?:\/\//i.test(asset.url)) {
    const response = await fetch(asset.url);

    if (!response.ok) {
      throw new Error(
        `Reference image fetch failed with status ${response.status}.`,
      );
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType:
        asset.mimeType ??
        response.headers.get("content-type") ??
        "image/png",
    };
  }

  throw new Error(
    "Reference image must be a data URL or externally fetchable URL for the OpenAI image provider.",
  );
};

const buildImages = ({
  generationId,
  providerId,
  outputSize,
  format,
  data,
  model,
}: {
  generationId: string;
  providerId: AIProviderId;
  outputSize: Size;
  format: AIGenerationImageFormat;
  data: OpenAIImageData[] | undefined;
  model: string;
}): AIGeneratedImage[] => {
  const mimeType = guessMimeType(format);

  return (data ?? []).flatMap((image, index) => {
    const url = image.b64_json
      ? dataUrlFromBase64(image.b64_json, mimeType)
      : image.url;

    if (!url) {
      return [];
    }

    return [
      {
        assetId: `${providerId}_asset_${generationId}_${index}`,
        url,
        previewUrl: url,
        mimeType,
        width: outputSize.width,
        height: outputSize.height,
        providerMetadata: {
          model,
          revisedPrompt: image.revised_prompt ?? null,
        },
      },
    ];
  });
};

export class OpenAIGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "openai";

  readonly displayName = "OpenAI Image Generation";

  readonly capabilities = {
    supportsReferenceImages: true,
    supportsTransparentBackground: true,
    supportsStreaming: false,
    supportsPolling: false,
    maxImageSize: {
      width: 1536,
      height: 1536,
    },
    supportedFormats: ["png", "jpeg", "webp"] as const,
    supportsVideo: false,
  };

  private readonly apiKey: string;

  private readonly model: string;

  private readonly baseUrl: string;

  private readonly completedGenerations = new Map<string, AIGenerationResponse>();

  constructor(private readonly config: AIProviderRuntimeConfig) {
    if (!config.apiKey) {
      throw new Error("Missing OpenAI API key.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? OPENAI_DEFAULT_MODEL;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    const generationId = createId("openai_generation");
    const timestamp = now();
    const format = normalizeFormat(request.format);
    const payload = request.referenceAssets?.length
      ? await this.requestImageEdit(request, format)
      : await this.requestImageGeneration(request, format);
    const images = buildImages({
      generationId,
      providerId: this.providerId,
      outputSize: request.outputSize,
      format,
      data: payload.data,
      model: this.model,
    });

    if (images.length === 0) {
      throw new Error("OpenAI image response did not include image data.");
    }

    const response: AIGenerationResponse = {
      generationId,
      providerId: this.providerId,
      blockId: request.blockId,
      status: "completed",
      createdAt: timestamp,
      updatedAt: now(),
      progress: 100,
      images,
      warnings: [
        ...((request.metadata?.promptBuilderWarnings as string[] | undefined) ?? []),
      ],
    };

    this.completedGenerations.set(generationId, response);
    return response;
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    const response = this.completedGenerations.get(generationId);

    if (!response) {
      throw new Error(`OpenAI generation not found: ${generationId}`);
    }

    return response;
  }

  private async requestImageGeneration(
    request: AIGenerationRequest,
    format: AIGenerationImageFormat,
  ) {
    return this.request("/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        n: 1,
        size: inferOpenAIImageSize(request.outputSize),
        output_format: format,
        ...(request.background === "transparent"
          ? { background: "transparent" }
          : request.background === "solid"
            ? { background: "opaque" }
            : undefined),
      }),
    });
  }

  private async requestImageEdit(
    request: AIGenerationRequest,
    format: AIGenerationImageFormat,
  ) {
    const formData = new FormData();
    formData.append("model", this.model);
    formData.append("prompt", request.prompt);
    formData.append("n", "1");
    formData.append("size", inferOpenAIImageSize(request.outputSize));
    formData.append("output_format", format);

    if (request.background === "transparent") {
      formData.append("background", "transparent");
    } else if (request.background === "solid") {
      formData.append("background", "opaque");
    }

    for (const [index, asset] of (request.referenceAssets ?? []).entries()) {
      const reference = await fetchReferenceAsset(asset);
      formData.append(
        "image[]",
        new Blob([reference.buffer], {
          type: reference.mimeType,
        }),
        `reference-${index}.${reference.mimeType.split("/")[1] ?? "png"}`,
      );
    }

    return this.request("/images/edits", {
      method: "POST",
      body: formData,
    });
  }

  private async request(path: string, init: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...this.config.extraHeaders,
        ...(init.headers ?? {}),
      },
    });
    const rawText = await response.text();
    let payload = {} as OpenAIImageResponse;

    if (rawText) {
      try {
        payload = JSON.parse(rawText) as OpenAIImageResponse;
      } catch {
        if (!response.ok) {
          throw new OpenAIImageHttpError(
            `OpenAI image request failed with status ${response.status}.`,
            response.status,
          );
        }
      }
    }

    if (!response.ok) {
      throw new OpenAIImageHttpError(
        payload.error?.message ??
          `OpenAI image request failed with status ${response.status}.`,
        response.status,
        {
          providerErrorType: payload.error?.type ?? null,
          providerErrorCode: payload.error?.code ?? null,
        },
      );
    }

    return payload;
  }
}
