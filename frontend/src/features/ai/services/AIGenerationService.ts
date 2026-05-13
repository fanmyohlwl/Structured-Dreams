import { aiProviderSelectionConfig } from "../config/providerConfig";
import { BackendAIGenerationProvider } from "../providers/BackendAIGenerationProvider";
import { MockAIGenerationProvider } from "../mocks/MockAIGenerationProvider";
import type { AIGenerationProvider } from "../providers/AIGenerationProvider";
import type {
  AIGenerationLoadingState,
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderSelectionConfig,
  AIServiceError,
  AIServiceResult,
} from "../types";

type ProviderRegistry = Partial<Record<AIProviderId, AIGenerationProvider>>;

const createProviderNotFoundError = (providerId: AIProviderId): AIServiceError => ({
  code: "PROVIDER_NOT_FOUND",
  message: `AI provider is not registered: ${providerId}`,
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
    message: "Unknown AI provider error",
    providerId,
    retryable: false,
  };
};

export const createIdleAIGenerationLoadingState =
  (): AIGenerationLoadingState => ({
    isLoading: false,
    phase: "idle",
  });

export class AIGenerationService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly defaultProviderId: AIProviderId,
  ) {}

  getProvider(providerId: AIProviderId = this.defaultProviderId) {
    return this.providers[providerId];
  }

  async generateImage(
    request: AIGenerationRequest,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<AIGenerationResponse>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.generateImage(request);
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

  async getGenerationResult(
    generationId: string,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<AIGenerationResponse>> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      return {
        ok: false,
        error: createProviderNotFoundError(providerId),
      };
    }

    try {
      const response = await provider.getGenerationResult(generationId);
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

  async cancelGeneration(
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

    if (!provider.cancelGeneration) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message: `AI provider does not support cancellation: ${providerId}`,
          providerId,
          retryable: false,
        },
      };
    }

    try {
      await provider.cancelGeneration(generationId);
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

export const createAIGenerationService = (
  config: AIProviderSelectionConfig = aiProviderSelectionConfig,
) => {
  const providers: ProviderRegistry = {};

  if (config.providers.backend?.enabled) {
    providers.backend = new BackendAIGenerationProvider(config.providers.backend);
  }

  if (config.providers.mock?.enabled) {
    providers.mock = new MockAIGenerationProvider(config.providers.mock);
  }

  /*
  前端默认只需要注册一个后端网关 provider。

  如果未来需要保留本地 mock 或加入其他前端侧测试 provider，也可以继续在这里注册。

  真实的第三方模型厂商适配建议放在后端完成，例如：

	  backend -> APIMart
	  backend -> OpenAI
	  backend -> Replicate

  这样前端 provider 内部只处理：
  - 调用自有后端接口
  - 统一请求/响应解析

  敏感或厂商特定逻辑放到后端处理，例如：
  - API Key
  - HTTP 请求
  - 供应商特定的响应映射
  - 重试与限流
  - 错误归一化

  编辑器 UI 仍然只调用 AIGenerationService，不需要关心厂商细节。
  */

  return new AIGenerationService(providers, config.defaultProvider);
};

export const aiGenerationService = createAIGenerationService();
