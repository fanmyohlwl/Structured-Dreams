import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
} from "../types";

export interface AIGenerationProvider {
  readonly providerId: AIProviderId;
  readonly displayName: string;

  generateImage(request: AIGenerationRequest): Promise<AIGenerationResponse>;

  getGenerationResult(generationId: string): Promise<AIGenerationResponse>;

  cancelGeneration?(generationId: string): Promise<void>;
}
