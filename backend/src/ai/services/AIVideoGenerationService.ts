import { backendAIVideoProviderSelectionConfig } from "../config/providerConfig.js";
import { backendServerConfig } from "../config/providerConfig.js";
import type { AIVideoGenerationProvider } from "../providers/AIVideoGenerationProvider.js";
import { ApimartAIVideoGenerationProvider } from "../providers/ApimartAIVideoGenerationProvider.js";
import { MockAIVideoGenerationProvider } from "../providers/MockAIVideoGenerationProvider.js";
import type {
  AIProviderId,
  AIProviderSelectionConfig,
  AIServiceError,
  JsonValue,
} from "../types.js";
import type {
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
  AIVideoServiceResult,
} from "../videoTypes.js";
import { AssetService } from "../../assets/AssetService.js";

type ProviderRegistry = Partial<Record<AIProviderId, AIVideoGenerationProvider>>;
type ErrorWithStatus = Error & {
  status?: number;
  details?: Record<string, JsonValue>;
};

const createProviderNotFoundError = (providerId: AIProviderId): AIServiceError => ({
  code: "PROVIDER_NOT_FOUND",
  message: `AI video provider is not registered: ${providerId}`,
  providerId,
  retryable: false,
});

const hasStatus = (error: unknown): error is ErrorWithStatus =>
  error instanceof Error && typeof (error as ErrorWithStatus).status === "number";

const normalizeProviderError = (
  providerId: AIProviderId,
  error: unknown,
): AIServiceError => {
  if (error instanceof Error) {
    if (hasStatus(error)) {
      const status = error.status ?? 500;

      if (status === 400) {
        return {
          code: "INVALID_REQUEST",
          message: error.message,
          providerId,
          retryable: false,
          cause: error.name,
          details: error.details,
        };
      }

      if (status === 401) {
        return {
          code: "UNAUTHORIZED",
          message: error.message,
          providerId,
          retryable: false,
          cause: error.name,
          details: error.details,
        };
      }

      if (status === 402) {
        return {
          code: "PAYMENT_REQUIRED",
          message: error.message,
          providerId,
          retryable: false,
          cause: error.name,
          details: error.details,
        };
      }

      if (status === 403) {
        return {
          code: "PERMISSION_DENIED",
          message: error.message,
          providerId,
          retryable: false,
          cause: error.name,
          details: error.details,
        };
      }

      if (status === 429) {
        return {
          code: "RATE_LIMITED",
          message: error.message,
          providerId,
          retryable: true,
          cause: error.name,
          details: error.details,
        };
      }

      return {
        code: "PROVIDER_ERROR",
        message: error.message,
        providerId,
        retryable: status >= 500,
        cause: error.name,
        details: error.details,
      };
    }

    if (/not found/i.test(error.message)) {
      return {
        code: "GENERATION_NOT_FOUND",
        message: error.message,
        providerId,
        retryable: false,
        cause: error.name,
      };
    }

    if (/401|403|unauthorized|forbidden/i.test(error.message)) {
      return {
        code: "UNAUTHORIZED",
        message: error.message,
        providerId,
        retryable: false,
        cause: error.name,
      };
    }

    if (/429|rate/i.test(error.message)) {
      return {
        code: "RATE_LIMITED",
        message: error.message,
        providerId,
        retryable: true,
        cause: error.name,
      };
    }

    if (/network|fetch|socket|connect|timeout/i.test(error.message)) {
      return {
        code: "NETWORK_ERROR",
        message: error.message,
        providerId,
        retryable: true,
        cause: error.name,
      };
    }

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
  private readonly completedResponseCache = new Map<
    string,
    AIVideoGenerationResponse
  >();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly defaultProviderId: AIProviderId,
    private readonly assetService: AssetService,
  ) {}

  getProvider(providerId: AIProviderId = this.defaultProviderId) {
    return this.providers[providerId];
  }

  async generateVideo(
    request: AIVideoGenerationRequest,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIVideoServiceResult<AIVideoGenerationResponse>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.generateVideo(request);
      const persistedResponse = await this.persistCompletedResponse(response);
      return {
        ok: true,
        data: persistedResponse,
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
  ): Promise<AIVideoServiceResult<AIVideoGenerationResponse>> {
    const cachedResponse = this.completedResponseCache.get(generationId);

    if (cachedResponse) {
      return {
        ok: true,
        data: cachedResponse,
      };
    }

    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.getVideoGenerationResult(generationId);
      const persistedResponse = await this.persistCompletedResponse(response);
      return {
        ok: true,
        data: persistedResponse,
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
  ): Promise<AIVideoServiceResult<void>> {
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

  private async persistCompletedResponse(
    response: AIVideoGenerationResponse,
  ): Promise<AIVideoGenerationResponse> {
    if (response.status !== "completed" || response.videos.length === 0) {
      return response;
    }

    try {
      const persistedResponse =
        await this.assetService.persistAIVideoGenerationResponse(response);
      this.completedResponseCache.set(
        persistedResponse.generationId,
        persistedResponse,
      );
      return persistedResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "AI video persistence failed unexpectedly.";
      const persistenceError = new Error(
        `AI video persistence failed: ${message}`,
      ) as ErrorWithStatus;
      persistenceError.status = 500;
      persistenceError.details = {
        stage: "asset-persistence",
      };
      throw persistenceError;
    }
  }
}

export const createAIVideoGenerationService = (
  config: AIProviderSelectionConfig = backendAIVideoProviderSelectionConfig,
) => {
  const providers: ProviderRegistry = {};
  const assetService = new AssetService(backendServerConfig.dataDirectory);

  if (config.providers.mock?.enabled) {
    providers.mock = new MockAIVideoGenerationProvider(config.providers.mock);
  }

  if (config.providers.apimart?.enabled && config.providers.apimart.apiKey) {
    providers.apimart = new ApimartAIVideoGenerationProvider(
      config.providers.apimart,
    );
  }

  return new AIVideoGenerationService(
    providers,
    config.defaultProvider,
    assetService,
  );
};

export const aiVideoGenerationService = createAIVideoGenerationService();
