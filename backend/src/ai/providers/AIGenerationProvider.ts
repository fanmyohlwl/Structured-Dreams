import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  ProviderCapabilities,
} from "../types.js";

export interface AIGenerationProvider {
  readonly providerId: AIProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  generateImage(request: AIGenerationRequest): Promise<AIGenerationResponse>;

  getGenerationResult(generationId: string): Promise<AIGenerationResponse>;

  cancelGeneration?(generationId: string): Promise<void>;
}
