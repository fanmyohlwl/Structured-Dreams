import type { AIGenerationProvider } from "./AIGenerationProvider.js";
import type {
  AIGeneratedImage,
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderRuntimeConfig,
  JsonValue,
  Size,
} from "../types.js";

interface OpenRouterImageResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
            image_url?: {
              url?: string;
            };
          }>;
      images?: Array<{
        type?: string;
        image_url?: {
          url?: string;
        };
        imageUrl?: {
          url?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

class OpenRouterImageHttpError extends Error {
  readonly status: number;

  readonly details?: Record<string, JsonValue>;

  constructor(
    message: string,
    status: number,
    details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = "OpenRouterImageHttpError";
    this.status = status;
    this.details = details;
  }
}

const now = () => new Date().toISOString();

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-5.4-image-2";
const OPENROUTER_DEFAULT_IMAGE_SIZE = "1K";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, "");

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const inferAspectRatio = (outputSize: Size) => {
  const ratio = outputSize.width / Math.max(outputSize.height, 1);
  const options = [
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "3:4", value: 3 / 4 },
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
  ];

  return options.reduce((best, option) =>
    Math.abs(Math.log(option.value) - Math.log(ratio)) <
    Math.abs(Math.log(best.value) - Math.log(ratio))
      ? option
      : best,
  ).label;
};

const isUsableImageUrl = (url: string) =>
  url.startsWith("data:image/") || /^https?:\/\//i.test(url);

const shouldDebugImagePrompts = () =>
  process.env.AI_DEBUG_IMAGE_PROMPTS === "true";

const classifyReferenceUrl = (url: string) => {
  if (url.startsWith("data:")) {
    return "data-url";
  }

  if (/^https?:\/\//i.test(url)) {
    return "http-url";
  }

  if (url.startsWith("/api/assets/")) {
    return "internal-api-url";
  }

  return "other";
};

const getMimeTypeFromUrl = (url: string) => {
  const dataMatch = /^data:([^;,]+)/i.exec(url);

  if (dataMatch?.[1]) {
    return dataMatch[1];
  }

  const normalized = url.toLowerCase();

  if (normalized.includes(".jpg") || normalized.includes(".jpeg")) {
    return "image/jpeg";
  }

  if (normalized.includes(".webp")) {
    return "image/webp";
  }

  return "image/png";
};

const extractImageUrls = (payload: OpenRouterImageResponse) => {
  const message = payload.choices?.[0]?.message;
  const fromImages = (message?.images ?? [])
    .map((image) => image.image_url?.url ?? image.imageUrl?.url)
    .filter((url): url is string => Boolean(url));

  if (fromImages.length > 0) {
    return fromImages;
  }

  const content = message?.content;

  if (Array.isArray(content)) {
    const fromParts = content
      .map((part) => part.image_url?.url)
      .filter((url): url is string => Boolean(url));

    if (fromParts.length > 0) {
      return fromParts;
    }
  }

  if (typeof content === "string") {
    const urls = content.match(/data:image\/[^"'\s)]+|https?:\/\/[^\s"'`)]+/g);
    return urls ?? [];
  }

  return [];
};

const buildImages = ({
  generationId,
  outputSize,
  urls,
  model,
}: {
  generationId: string;
  outputSize: Size;
  urls: string[];
  model: string;
}): AIGeneratedImage[] =>
  urls.map((url, index) => ({
    assetId: `openrouter_asset_${generationId}_${index}`,
    url,
    previewUrl: url,
    mimeType: getMimeTypeFromUrl(url),
    width: outputSize.width,
    height: outputSize.height,
    providerMetadata: {
      model,
      provider: "openrouter",
    },
  }));

export class OpenRouterImageGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "openrouter";

  readonly displayName = "OpenRouter Image Generation";

  readonly capabilities = {
    supportsReferenceImages: true,
    supportsTransparentBackground: false,
    supportsStreaming: false,
    supportsPolling: false,
    maxImageSize: {
      width: 2048,
      height: 2048,
    },
    supportedFormats: ["png"] as const,
    supportsVideo: false,
  };

  private readonly apiKey: string;

  private readonly model: string;

  private readonly baseUrl: string;

  private readonly imageSize: string;

  private readonly completedGenerations = new Map<string, AIGenerationResponse>();

  constructor(private readonly config: AIProviderRuntimeConfig) {
    if (!config.apiKey) {
      throw new Error("Missing OpenRouter API key.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? OPENROUTER_DEFAULT_MODEL;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.imageSize = config.resolution ?? OPENROUTER_DEFAULT_IMAGE_SIZE;
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    const generationId = createId("openrouter_generation");
    const timestamp = now();
    const warnings: string[] = [];
    const referenceImageParts = (request.referenceAssets ?? []).flatMap((asset) => {
      if (!isUsableImageUrl(asset.url)) {
        const urlType = classifyReferenceUrl(asset.url);
        warnings.push(
          urlType === "internal-api-url"
            ? `Reference image ${asset.assetId ?? asset.url} is an internal-api-url reference and is not externally usable by OpenRouter unless converted to a data URL or public URL.`
            : `Reference image ${asset.assetId ?? asset.url} was skipped because OpenRouter requires a data URL or http(s) URL.`,
        );
        return [];
      }

      return [
        {
          type: "image_url" as const,
          image_url: {
            url: asset.url,
          },
        },
      ];
    });
    const payload = await this.requestImageGeneration({
      prompt: request.negativePrompt
        ? `${request.prompt}\n\nAvoid: ${request.negativePrompt}`
        : request.prompt,
      referenceImageParts,
      outputSize: request.outputSize,
    });
    const imageUrls = extractImageUrls(payload);
    const images = buildImages({
      generationId,
      outputSize: request.outputSize,
      urls: imageUrls,
      model: this.model,
    });

    if (images.length === 0) {
      throw new Error("OpenRouter image response did not include image data.");
    }

    const response: AIGenerationResponse = {
      generationId,
      providerId: this.providerId,
      blockId: request.blockId,
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 100,
      images,
      warnings: [
        ...warnings,
        ...((request.metadata?.promptBuilderWarnings as string[] | undefined) ?? []),
      ],
    };

    this.completedGenerations.set(generationId, response);
    return response;
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    const response = this.completedGenerations.get(generationId);

    if (!response) {
      throw new Error(`OpenRouter generation not found: ${generationId}`);
    }

    return response;
  }

  private async requestImageGeneration({
    prompt,
    referenceImageParts,
    outputSize,
  }: {
    prompt: string;
    referenceImageParts: Array<{
      type: "image_url";
      image_url: {
        url: string;
      };
    }>;
    outputSize: Size;
  }) {
    const imageConfig = {
      aspect_ratio: inferAspectRatio(outputSize),
      image_size: this.imageSize,
    };

    if (shouldDebugImagePrompts()) {
      console.info("[openrouter:image-request-debug]", {
        model: this.model,
        prompt,
        referenceImagePartsCount: referenceImageParts.length,
        image_config: imageConfig,
      });
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: this.model,
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              ...referenceImageParts,
            ],
          },
        ],
        image_config: imageConfig,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as OpenRouterImageResponse;

    if (!response.ok) {
      throw new OpenRouterImageHttpError(
        payload.error?.message ??
          `OpenRouter image request failed with status ${response.status}.`,
        response.status,
        {
          providerErrorCode: payload.error?.code ?? null,
          providerErrorType: payload.error?.type ?? null,
          requestId:
            response.headers.get("x-request-id") ??
            response.headers.get("openrouter-request-id") ??
            null,
        },
      );
    }

    return payload;
  }
}
