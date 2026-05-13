import type {
  AIGenerationReferenceAsset,
  AIGenerationStatus,
  AIProviderId,
  AIServiceError,
  AIServiceResult,
  BlockId,
  EntityId,
  JsonValue,
  Size,
} from "./types.js";

export interface AIVideoGenerationRequest {
  blockId: BlockId;
  prompt: string;
  negativePrompt?: string;
  outputSize: Size;
  durationSeconds?: number;
  aspectRatio?: string;
  referenceAssets?: AIGenerationReferenceAsset[];
  metadata?: Record<string, JsonValue>;
}

export interface AIGeneratedVideo {
  assetId: EntityId;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  posterAssetId?: EntityId;
  posterUrl?: string;
  posterMimeType?: string;
  previewImageAssetId?: EntityId;
  previewImageUrl?: string;
  previewImageMimeType?: string;
  providerMetadata?: Record<string, JsonValue>;
}

export interface AIVideoGenerationResponse {
  generationId: string;
  providerId: AIProviderId;
  blockId: BlockId;
  status: AIGenerationStatus;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  videos: AIGeneratedVideo[];
  warnings?: string[];
  error?: AIServiceError;
}

export type AIVideoServiceResult<T> = AIServiceResult<T>;

export interface BackendGenerateVideoPayload {
  request: AIVideoGenerationRequest;
  providerId?: AIProviderId;
}
