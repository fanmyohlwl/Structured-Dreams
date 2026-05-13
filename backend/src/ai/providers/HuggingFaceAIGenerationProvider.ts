import type { AIGenerationProvider } from "./AIGenerationProvider.js";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderRuntimeConfig,
} from "../types.js";

const now = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const bufferToDataUrl = (buffer: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

export class HuggingFaceAIGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "huggingface";

  readonly displayName = "Hugging Face Image Generation";

  readonly capabilities = {
    supportsReferenceImages: false,
    supportsTransparentBackground: false,
    supportsStreaming: false,
    supportsPolling: false,
    maxImageSize: {
      width: 2048,
      height: 2048,
    },
    supportedFormats: ["png", "jpeg", "webp"] as const,
    supportsVideo: false,
  };

  private readonly apiKey: string;

  private readonly model: string;

  private readonly baseUrl: string;

  private readonly generations = new Map<string, AIGenerationResponse>();

  constructor(private readonly config: AIProviderRuntimeConfig) {
    if (!config.apiKey) {
      throw new Error("Missing Hugging Face API key.");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? "black-forest-labs/FLUX.1-schnell";
    this.baseUrl =
      config.baseUrl?.replace(/\/+$/, "") ??
      "https://api-inference.huggingface.co/models";
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    const response = await fetch(
      `${this.baseUrl}/${encodeURIComponent(this.model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...this.config.extraHeaders,
        },
        body: JSON.stringify({
          inputs: request.prompt,
          parameters: {
            negative_prompt: request.negativePrompt,
            width: request.outputSize.width,
            height: request.outputSize.height,
          },
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Hugging Face request failed (${response.status}): ${message}`,
      );
    }

    const mimeType = response.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const imageUrl = bufferToDataUrl(imageBuffer, mimeType);
    const timestamp = now();
    const generationId = createId("hf_generation");

    const generationResponse: AIGenerationResponse = {
      generationId,
      providerId: this.providerId,
      blockId: request.blockId,
      status: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 100,
      images: [
        {
          assetId: createId("hf_asset"),
          url: imageUrl,
          previewUrl: imageUrl,
          mimeType,
          width: request.outputSize.width,
          height: request.outputSize.height,
          providerMetadata: {
            model: this.model,
          },
        },
      ],
    };

    this.generations.set(generationId, generationResponse);

    return generationResponse;
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    const generation = this.generations.get(generationId);

    if (!generation) {
      throw new Error(`Hugging Face generation not found: ${generationId}`);
    }

    return generation;
  }
}
