export type BlockId = string;

export type EntityId = string;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Size {
  width: number;
  height: number;
}

export type AIProviderId =
  | "mock"
  | "apimart"
  | "huggingface"
  | "openai"
  | "openrouter"
  | "replicate"
  | "stability"
  | (string & {});

export type AIGenerationStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AIGenerationImageFormat = "png" | "jpeg" | "webp";

export type AIGenerationBackground = "transparent" | "solid";

export interface ProviderCapabilities {
  supportsReferenceImages: boolean;
  supportsTransparentBackground: boolean;
  supportsStreaming: boolean;
  supportsPolling: boolean;
  maxImageSize: Size;
  supportedFormats: readonly AIGenerationImageFormat[];
  supportsVideo: boolean;
}

export type AIServiceErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "PAYMENT_REQUIRED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "GENERATION_NOT_FOUND"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

export interface AIGenerationReferenceAsset {
  assetId?: EntityId;
  url: string;
  mimeType?: string;
  role?: "live-capture" | "previous-ai-result" | "semantic-reference" | string;
}

export interface AIGenerationRequest {
  blockId: BlockId;
  prompt: string;
  negativePrompt?: string;
  outputSize: Size;
  format?: AIGenerationImageFormat;
  background?: AIGenerationBackground;
  stylePreset?: string;
  referenceAssets?: AIGenerationReferenceAsset[];
  metadata?: Record<string, JsonValue>;
}

export interface AIGeneratedImage {
  assetId: EntityId;
  url: string;
  previewUrl?: string;
  mimeType: string;
  width: number;
  height: number;
  providerMetadata?: Record<string, JsonValue>;
}

export interface AIServiceError {
  code: AIServiceErrorCode;
  message: string;
  providerId?: AIProviderId;
  retryable: boolean;
  details?: Record<string, JsonValue>;
  cause?: string;
}

export interface AIGenerationResponse {
  generationId: string;
  providerId: AIProviderId;
  blockId: BlockId;
  status: AIGenerationStatus;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  images: AIGeneratedImage[];
  warnings?: string[];
  error?: AIServiceError;
}

export type AIServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AIServiceError;
    };

export interface AIProviderRuntimeConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  resolution?: string;
  extraHeaders?: Record<string, string>;
}

export interface AIProviderSelectionConfig {
  defaultProvider: AIProviderId;
  providers: Partial<Record<AIProviderId, AIProviderRuntimeConfig>>;
}

export interface BackendGenerateImagePayload {
  request: AIGenerationRequest;
  providerId?: AIProviderId;
}
