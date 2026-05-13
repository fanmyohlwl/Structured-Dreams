import type {
  BuildAgentProfileRequest,
  BuildAgentProfileResponse,
  OrchestratorProviderId,
  OrchestratorRequest,
  OrchestratorResponse,
  VisualStyleAnalysisProviderRequest,
  VisualStyleAnalysisResponse,
} from "../types.js";

export interface CanvasOrchestratorProvider {
  readonly id: OrchestratorProviderId;
  generatePlan(request: OrchestratorRequest): Promise<OrchestratorResponse>;
  buildAgentProfile?(
    request: BuildAgentProfileRequest,
  ): Promise<BuildAgentProfileResponse>;
  analyzeVisualStyle?(
    request: VisualStyleAnalysisProviderRequest,
  ): Promise<VisualStyleAnalysisResponse>;
}
