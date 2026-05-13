import { backendAiProviderSelectionConfig } from "../config/providerConfig.js";
import { backendServerConfig } from "../config/providerConfig.js";
import { ApimartAIGenerationProvider } from "../providers/ApimartAIGenerationProvider.js";
import { MockAIGenerationProvider } from "../providers/MockAIGenerationProvider.js";
import { OpenAIGenerationProvider } from "../providers/OpenAIGenerationProvider.js";
import { OpenRouterImageGenerationProvider } from "../providers/OpenRouterImageGenerationProvider.js";
import type { AIGenerationProvider } from "../providers/AIGenerationProvider.js";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderSelectionConfig,
  AIServiceError,
  AIServiceResult,
  JsonValue,
} from "../types.js";
import { AssetService } from "../../assets/AssetService.js";
import { PromptBuilder } from "../prompting/PromptBuilder.js";
import type {
  ImageIntent,
  LayoutContextSummary,
  VisualStyleProfile,
} from "../../orchestration/types.js";

type ProviderRegistry = Partial<Record<AIProviderId, AIGenerationProvider>>;
type ErrorWithStatus = Error & {
  status?: number;
  details?: Record<string, JsonValue>;
};

const shouldDebugImagePrompts = () =>
  process.env.AI_DEBUG_IMAGE_PROMPTS === "true";

const classifyReferenceUrl = (url: string) => {
  if (url.startsWith("data:")) {
    return "data-url";
  }

  if (/^https?:\/\//i.test(url)) {
    return "http-url";
  }

  if (url.startsWith("/api/assets/")) {
    return "internal-api-url";
  }

  return "other";
};

const summarizeReferenceAsset = (
  asset: NonNullable<AIGenerationRequest["referenceAssets"]>[number],
) => ({
  assetId: asset.assetId,
  mimeType: asset.mimeType,
  urlType: classifyReferenceUrl(asset.url),
});

const summarizeLayoutContext = (layoutContext?: LayoutContextSummary) => ({
  targetSlotId: layoutContext?.targetSlot?.id,
  targetSlotRole: layoutContext?.targetSlot?.role,
  targetSlotFrame: layoutContext?.targetSlot?.frame,
  neighborCount: layoutContext?.neighbors.length ?? 0,
  occupiedPatternCount:
    layoutContext?.occupiedRegions.filter((region) => region.sourceType === "pattern")
      .length ?? 0,
  avoidRegionCount: layoutContext?.avoidRegions.length ?? 0,
});

const createProviderNotFoundError = (providerId: AIProviderId): AIServiceError => ({
  code: "PROVIDER_NOT_FOUND",
  message: `AI provider is not registered: ${providerId}`,
  providerId,
  retryable: false,
});

const hasStatus = (error: unknown): error is ErrorWithStatus =>
  error instanceof Error && typeof (error as ErrorWithStatus).status === "number";

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseImageIntent = (value: unknown): ImageIntent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.targetSlotId !== "string" ||
    typeof value.subject !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    targetSlotId: value.targetSlotId,
    targetBlockId:
      typeof value.targetBlockId === "string" ? value.targetBlockId : undefined,
    subject: value.subject,
    mood: typeof value.mood === "string" ? value.mood : "brand aligned",
    composition:
      typeof value.composition === "string"
        ? value.composition
        : "Use the existing slot frame.",
    colorIntent:
      typeof value.colorIntent === "string"
        ? value.colorIntent
        : "Use brand-supportive colors.",
    styleHint:
      typeof value.styleHint === "string"
        ? value.styleHint
        : "Polished campaign visual",
    abstractionLevel:
      value.abstractionLevel === "literal" ||
      value.abstractionLevel === "stylized" ||
      value.abstractionLevel === "abstract"
        ? value.abstractionLevel
        : "stylized",
    priority: typeof value.priority === "number" ? value.priority : 1,
    avoid: Array.isArray(value.avoid)
      ? value.avoid.filter((item): item is string => typeof item === "string")
      : undefined,
    referenceIds: Array.isArray(value.referenceIds)
      ? value.referenceIds.filter((item): item is string => typeof item === "string")
      : undefined,
  };
};

const isSemanticReferenceItem = (
  value: unknown,
): value is {
  id: string;
  type: "url" | "image" | "note";
  title: string;
  description: string;
  url?: string;
  assetId?: string;
  src?: string;
  mimeType?: string;
  fileName?: string;
  createdAt: string;
} =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.type === "url" || value.type === "image" || value.type === "note") &&
  typeof value.title === "string" &&
  typeof value.description === "string" &&
  typeof value.createdAt === "string";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isVisualStyleProfile = (value: unknown): value is VisualStyleProfile =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.assetId === "string" &&
  typeof value.title === "string" &&
  typeof value.createdAt === "string" &&
  typeof value.summary === "string" &&
  typeof value.composition === "string" &&
  typeof value.typography === "string" &&
  typeof value.color === "string" &&
  typeof value.imageTreatment === "string" &&
  isStringArray(value.spatialRules) &&
  isStringArray(value.layoutRules) &&
  isStringArray(value.avoid) &&
  typeof value.confidence === "number";

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
    message: "Unknown AI provider error",
    providerId,
    retryable: false,
  };
};

export class AIGenerationService {
  private readonly completedResponseCache = new Map<string, AIGenerationResponse>();

  private readonly promptBuilder = new PromptBuilder();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly defaultProviderId: AIProviderId,
    private readonly assetService: AssetService,
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
      const preparedRequest = this.prepareRequestForProvider(request, provider);
      const response = await provider.generateImage(preparedRequest);
      const promptBuilderWarnings = Array.isArray(
        preparedRequest.metadata?.promptBuilderWarnings,
      )
        ? preparedRequest.metadata.promptBuilderWarnings.filter(
            (warning): warning is string => typeof warning === "string",
          )
        : [];
      const responseWithPromptWarnings =
        promptBuilderWarnings.length > 0
          ? {
              ...response,
              warnings: [
                ...(response.warnings ?? []),
                ...promptBuilderWarnings,
              ].filter((warning, index, allWarnings) =>
                allWarnings.indexOf(warning) === index,
              ),
            }
          : response;
      const persistedResponse = await this.persistCompletedResponse(
        responseWithPromptWarnings,
      );
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

  async getGenerationResult(
    generationId: string,
    providerId: AIProviderId = this.defaultProviderId,
  ): Promise<AIServiceResult<AIGenerationResponse>> {
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
      const response = await provider.getGenerationResult(generationId);
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

  private async persistCompletedResponse(
    response: AIGenerationResponse,
  ): Promise<AIGenerationResponse> {
    if (response.status !== "completed" || response.images.length === 0) {
      return response;
    }

    try {
      const persistedResponse =
        await this.assetService.persistAIGenerationResponse(response);
      this.completedResponseCache.set(
        persistedResponse.generationId,
        persistedResponse,
      );
      return persistedResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "AI image persistence failed unexpectedly.";
      const persistenceError = new Error(
        `AI image persistence failed: ${message}`,
      ) as ErrorWithStatus;
      persistenceError.status = 500;
      persistenceError.details = {
        stage: "asset-persistence",
      };
      throw persistenceError;
    }
  }

  private prepareRequestForProvider(
    request: AIGenerationRequest,
    provider: AIGenerationProvider,
  ): AIGenerationRequest {
    const imageIntent = parseImageIntent(request.metadata?.imageIntent);

    if (!imageIntent) {
      return request;
    }

    const semanticBrief = isRecord(request.metadata?.semanticBrief)
      ? request.metadata?.semanticBrief
      : undefined;
    const references = Array.isArray(request.metadata?.references)
      ? request.metadata.references.filter(isSemanticReferenceItem)
      : [];
    const visualStyleProfiles: VisualStyleProfile[] = Array.isArray(
      request.metadata?.visualStyleProfiles,
    )
      ? (request.metadata.visualStyleProfiles as unknown[]).filter(
          isVisualStyleProfile,
        )
      : [];
    const fuseCapturedPortrait = request.metadata?.fuseCapturedPortrait === true;
    const transientReferenceAssets = (request.referenceAssets ?? []).filter(
      (asset) => asset.role !== "live-capture" || fuseCapturedPortrait,
    );
    const liveContextGuidance =
      typeof request.metadata?.liveContextGuidance === "string"
        ? request.metadata.liveContextGuidance
        : undefined;
    const layoutContext = isRecord(request.metadata?.layoutContext)
      ? (request.metadata.layoutContext as unknown as LayoutContextSummary)
      : undefined;
    const promptBuilderOutput = this.promptBuilder.buildImagePrompt({
      imageIntent,
      semanticBrief,
      references,
      providerCapabilities: provider.capabilities,
      outputConstraints: {
        outputSize: request.outputSize,
        format: request.format,
        background: request.background,
      },
      liveContextGuidance,
      transientReferenceAssets,
      fuseCapturedPortrait,
      visualStyleProfiles,
      layoutContext,
    });
    const requestReferenceWarnings =
      !provider.capabilities.supportsReferenceImages && transientReferenceAssets.length > 0
        ? [
            "Provider used live moment as text guidance only because it does not support reference images.",
          ]
        : [];
    const promptBuilderWarnings = [
      ...promptBuilderOutput.warnings,
      ...requestReferenceWarnings,
    ].filter((warning, index, allWarnings) => allWarnings.indexOf(warning) === index);
    const referenceAssets = provider.capabilities.supportsReferenceImages
      ? [...transientReferenceAssets, ...promptBuilderOutput.referenceAssets]
      : [];

    if (shouldDebugImagePrompts()) {
      console.info("[ai:image-prompt-debug]", {
        providerId: provider.providerId,
        blockId: request.blockId,
        finalPrompt: promptBuilderOutput.finalPrompt,
        negativeText: promptBuilderOutput.negativeText,
        selectedReferenceAssetIds: promptBuilderOutput.selectedReferenceAssetIds,
        referenceAssetCount: promptBuilderOutput.referenceAssets.length,
        referenceAssets: referenceAssets.map(summarizeReferenceAsset),
        frameSource:
          typeof request.metadata?.frameSource === "string"
            ? request.metadata.frameSource
            : undefined,
        layoutContext: summarizeLayoutContext(layoutContext),
        warnings: promptBuilderWarnings,
      });
    }

    return {
      ...request,
      prompt: promptBuilderOutput.finalPrompt,
      negativePrompt: promptBuilderOutput.negativeText ?? request.negativePrompt,
      referenceAssets,
      metadata: {
        ...(request.metadata ?? {}),
        compiledPrompt: promptBuilderOutput.finalPrompt,
        selectedReferenceAssetIds: promptBuilderOutput.selectedReferenceAssetIds,
        mediaGenerationSpec:
          promptBuilderOutput.mediaGenerationSpec as unknown as JsonValue,
        promptBuilderWarnings,
      },
    };
  }
}

export const createAIGenerationService = (
  config: AIProviderSelectionConfig = backendAiProviderSelectionConfig,
) => {
  const providers: ProviderRegistry = {};
  const assetService = new AssetService(backendServerConfig.dataDirectory);

  if (config.providers.mock?.enabled) {
    providers.mock = new MockAIGenerationProvider(config.providers.mock);
  }

  if (config.providers.apimart?.enabled) {
    providers.apimart = new ApimartAIGenerationProvider(
      config.providers.apimart,
    );
  }

  if (config.providers.openai?.enabled) {
    providers.openai = new OpenAIGenerationProvider(
      config.providers.openai,
    );
  }

  if (config.providers.openrouter?.enabled) {
    providers.openrouter = new OpenRouterImageGenerationProvider(
      config.providers.openrouter,
    );
  }

  return new AIGenerationService(
    providers,
    config.defaultProvider,
    assetService,
  );
};

export const aiGenerationService = createAIGenerationService();
