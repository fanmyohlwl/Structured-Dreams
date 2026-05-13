import type { BlockId } from "../../../entities/block/types";
import type { EntityId, JsonValue, Size } from "../../../shared/types/common";

export type AIProviderId =
  | "backend"
  | "mock"
  | "huggingface"
  | "openai"
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

export type AIGenerationLoadingPhase =
  | "idle"
  | "submitting"
  | "polling"
  | "cancelling";

export type AIServiceErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "GENERATION_NOT_FOUND"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

export interface AIGenerationReferenceAsset {
  assetId?: EntityId;
  url: string;
  mimeType?: string;
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

export interface AIGenerationLoadingState {
  isLoading: boolean;
  phase: AIGenerationLoadingPhase;
  providerId?: AIProviderId;
  activeBlockId?: BlockId;
  activeGenerationId?: string;
  progress?: number;
  message?: string;
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
  extraHeaders?: Record<string, string>;
}

export interface AIProviderSelectionConfig {
  defaultProvider: AIProviderId;
  providers: Partial<Record<AIProviderId, AIProviderRuntimeConfig>>;
}
