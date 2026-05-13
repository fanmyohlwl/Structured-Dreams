import { aiProviderSelectionConfig } from "../config/providerConfig";
import { BackendAIVideoGenerationProvider } from "../providers/BackendAIVideoGenerationProvider";
import type { AIVideoGenerationProvider } from "../providers/AIVideoGenerationProvider";
import type {
  AIProviderId,
  AIProviderSelectionConfig,
  AIServiceError,
  AIServiceResult,
} from "../types";
import type {
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
} from "../videoTypes";

type ProviderRegistry = Partial<Record<AIProviderId, AIVideoGenerationProvider>>;

const createProviderNotFoundError = (providerId: AIProviderId): AIServiceError => ({
  code: "PROVIDER_NOT_FOUND",
  message: `AI video provider is not registered: ${providerId}`,
  providerId,
  retryable: false,
});

const normalizeProviderError = (
  providerId: AIProviderId,
  error: unknown,
): AIServiceError => {
  if (error instanceof Error) {
    return {
      code: "PROVIDER_ERROR",
      message: error.message,
      providerId,
      retryable: true,
      cause: error.name,
    };
  }

  return {
    code: "UNKNOWN",
    message: "Unknown AI video provider error",
    providerId,
    retryable: false,
  };
};

export class AIVideoGenerationService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly defaultProviderId: AIProviderId,
  ) {}

  getProvider(providerId: AIProviderId = this.defaultProviderId) {
    return this.providers[providerId];
  }

  async generateVideo(
    request: AIVideoGenerationRequest,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<AIVideoGenerationResponse>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.generateVideo(request);
      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeProviderError(providerId, error),
      };
    }
  }

  async getVideoGenerationResult(
    generationId: string,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<AIVideoGenerationResponse>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.getVideoGenerationResult(generationId);
      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeProviderError(providerId, error),
      };
    }
  }

  async cancelVideoGeneration(
    generationId: string,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<void>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    if (!provider.cancelVideoGeneration) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message: `AI video provider does not support cancellation: ${providerId}`,
          providerId,
          retryable: false,
        },
      };
    }

    try {
      await provider.cancelVideoGeneration(generationId);
      return {
        ok: true,
        data: undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeProviderError(providerId, error),
      };
    }
  }
}

export const createAIVideoGenerationService = (
  config: AIProviderSelectionConfig = aiProviderSelectionConfig,
) => {
  const providers: ProviderRegistry = {};

  if (config.providers.backend?.enabled) {
    providers.backend = new BackendAIVideoGenerationProvider(
      config.providers.backend,
    );
  }

  return new AIVideoGenerationService(providers, config.defaultProvider);
};

export const aiVideoGenerationService = createAIVideoGenerationService();
