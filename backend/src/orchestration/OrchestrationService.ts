import { backendOrchestratorProviderSelectionConfig } from "../ai/config/providerConfig.js";
import { MockCanvasOrchestratorProvider } from "./providers/MockCanvasOrchestratorProvider.js";
import { OpenAIOrchestratorProvider } from "./providers/OpenAIOrchestratorProvider.js";
import { OpenRouterOrchestratorProvider } from "./providers/OpenRouterOrchestratorProvider.js";
import type { CanvasOrchestratorProvider } from "./providers/CanvasOrchestratorProvider.js";
import type {
  BuildAgentProfileRequest,
  BuildAgentProfileResponse,
  OrchestratorProviderId,
  OrchestratorRequest,
  OrchestratorResponse,
  VisualStyleAnalysisProviderRequest,
  VisualStyleAnalysisResponse,
} from "./types.js";

type OrchestrationErrorDetails = Record<string, unknown>;
type ErrorWithDetails = Error & {
  details?: OrchestrationErrorDetails;
};

type ProviderRegistry = Partial<Record<OrchestratorProviderId, CanvasOrchestratorProvider>>;

const createProviderNotFoundError = (providerId: OrchestratorProviderId) => ({
  code: "PROVIDER_NOT_FOUND",
  message: `Orchestration provider is not registered: ${providerId}`,
});

export class OrchestrationServiceError extends Error {
  readonly code:
    | "PROVIDER_NOT_FOUND"
    | "INVALID_REQUEST"
    | "PROVIDER_ERROR";

  constructor(
    code: OrchestrationServiceError["code"],
    message: string,
    readonly details?: OrchestrationErrorDetails,
  ) {
    super(message);
    this.name = "OrchestrationServiceError";
    this.code = code;
  }
}

export class OrchestrationService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly defaultProviderId: OrchestratorProviderId,
  ) {}

  private getProvider(providerId: OrchestratorProviderId = this.defaultProviderId) {
    return this.providers[providerId];
  }

  async generatePlan(
    request: OrchestratorRequest,
    providerId: OrchestratorProviderId = this.defaultProviderId,
  ): Promise<OrchestratorResponse> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      throw new OrchestrationServiceError(
        "PROVIDER_NOT_FOUND",
        createProviderNotFoundError(providerId).message,
      );
    }

    try {
      return await provider.generatePlan(request);
    } catch (error) {
      const details =
        error instanceof Error && "details" in error
          ? (error as ErrorWithDetails).details
          : undefined;
      throw new OrchestrationServiceError(
        "PROVIDER_ERROR",
        error instanceof Error
          ? error.message
          : "Unknown orchestration provider error.",
        details,
      );
    }
  }

  async buildAgentProfile(
    request: BuildAgentProfileRequest,
    providerId: OrchestratorProviderId = this.defaultProviderId,
  ): Promise<BuildAgentProfileResponse> {
    const provider = this.getProvider(providerId);

    if (!provider) {
      throw new OrchestrationServiceError(
        "PROVIDER_NOT_FOUND",
        createProviderNotFoundError(providerId).message,
      );
    }

    if (!provider.buildAgentProfile) {
      throw new OrchestrationServiceError(
        "PROVIDER_NOT_FOUND",
        `Orchestration provider does not support agent profile building: ${providerId}`,
      );
    }

    try {
      return await provider.buildAgentProfile(request);
    } catch (error) {
      const details =
        error instanceof Error && "details" in error
          ? (error as ErrorWithDetails).details
          : undefined;
      throw new OrchestrationServiceError(
        "PROVIDER_ERROR",
        error instanceof Error
          ? error.message
          : "Unknown agent profile provider error.",
        details,
      );
    }
  }

  async analyzeVisualStyle(
    request: VisualStyleAnalysisProviderRequest,
  ): Promise<VisualStyleAnalysisResponse> {
    const provider = this.providers.openrouter;

    if (!provider) {
      throw new OrchestrationServiceError(
        "PROVIDER_NOT_FOUND",
        "OpenRouter orchestrator provider is required for multimodal visual style analysis. Configure OPENROUTER_API_KEY.",
      );
    }

    if (!provider.analyzeVisualStyle) {
      throw new OrchestrationServiceError(
        "PROVIDER_NOT_FOUND",
        "The active OpenRouter provider does not support visual style image analysis.",
      );
    }

    try {
      return await provider.analyzeVisualStyle(request);
    } catch (error) {
      const details =
        error instanceof Error && "details" in error
          ? (error as ErrorWithDetails).details
          : undefined;
      throw new OrchestrationServiceError(
        "PROVIDER_ERROR",
        error instanceof Error
          ? error.message
          : "Unknown visual style analysis provider error.",
        details,
      );
    }
  }
}

export const createOrchestrationService = () => {
  const providers: ProviderRegistry = {};

  if (backendOrchestratorProviderSelectionConfig.providers.mock?.enabled) {
    providers.mock = new MockCanvasOrchestratorProvider();
  }

  const openAIConfig =
    backendOrchestratorProviderSelectionConfig.providers.openai;

  if (openAIConfig?.enabled && openAIConfig.apiKey && openAIConfig.model) {
    providers.openai = new OpenAIOrchestratorProvider({
      apiKey: openAIConfig.apiKey,
      baseUrl: openAIConfig.baseUrl,
      model: openAIConfig.model,
    });
  }

  const openRouterConfig =
    backendOrchestratorProviderSelectionConfig.providers.openrouter;

  if (
    openRouterConfig?.enabled &&
    openRouterConfig.apiKey &&
    openRouterConfig.model
  ) {
    providers.openrouter = new OpenRouterOrchestratorProvider({
      apiKey: openRouterConfig.apiKey,
      baseUrl: openRouterConfig.baseUrl,
      model: openRouterConfig.model,
      siteUrl: openRouterConfig.siteUrl,
      appTitle: openRouterConfig.appTitle,
    });
  }

  return new OrchestrationService(
    providers,
    backendOrchestratorProviderSelectionConfig.defaultProvider,
  );
};

export const orchestrationService = createOrchestrationService();
