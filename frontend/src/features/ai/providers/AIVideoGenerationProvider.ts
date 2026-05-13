import type { AIProviderId } from "../types";
import type {
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
} from "../videoTypes";

export interface AIVideoGenerationProvider {
  readonly providerId: AIProviderId;
  readonly displayName: string;

  generateVideo(
    request: AIVideoGenerationRequest,
  ): Promise<AIVideoGenerationResponse>;

  getVideoGenerationResult(
    generationId: string,
  ): Promise<AIVideoGenerationResponse>;

  cancelVideoGeneration?(generationId: string): Promise<void>;
}
