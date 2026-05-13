import type { DesignDocument } from "../../../entities/document/types";
import type { SemanticSlot } from "../../../entities/semantic/types";
import type {
  AgentProfile,
  BuildAgentProfileRequest,
  BuildAgentProfileResponse,
  LiveSemanticContext,
  OrchestratorRequest,
  OrchestratorResponse,
  VisualStyleProfile,
} from "../types";
import { loadStoredAgentProfile } from "../agentProfile";
import { validateOrchestratorResponse } from "../utils/planValidation";
import {
  getAvailableFontCatalog,
  getFallbackFontCatalog,
  getLoadedSystemFontCatalog,
} from "../../typography/fontCatalog";
import { onlineFontCatalog } from "../../typography/onlineFontCatalog";
import { semanticTypographyPresets } from "../../typography/semanticTypographyPresets";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api").replace(/\/+$/, "");

export class BackendOrchestrationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendOrchestrationServiceError";
  }
}

const toOrchestratorRequest = (
  document: DesignDocument,
  selectedSlotIds: string[] | undefined,
  runMode: "plan" | "refresh" | "live-direction",
  liveContext?: LiveSemanticContext,
  agentProfile?: AgentProfile,
  visualStyleProfiles?: VisualStyleProfile[],
): OrchestratorRequest => {
  const loadedSystemFonts = getLoadedSystemFontCatalog();
  const onlineFonts = onlineFontCatalog.map((font) => ({
      id: font.id,
      label: font.label,
      family: `"${font.family}", ${font.fallbackFamily}`,
      category: font.category,
      source: "online" as const,
    }));
  const availableFonts = (
    loadedSystemFonts.length > 0
      ? [
          ...loadedSystemFonts.slice(0, 110),
          ...getFallbackFontCatalog().slice(0, 24),
          ...onlineFonts.slice(0, 16),
        ]
      : [
          ...getAvailableFontCatalog().slice(0, 64),
          ...onlineFonts.slice(0, 16),
        ]
  )
    .filter(
      (font, index, allFonts) =>
        allFonts.findIndex((candidate) => candidate.id === font.id) === index,
    );
  const fontContext = {
    localFontsLoaded: loadedSystemFonts.length > 0,
    localFontCount: loadedSystemFonts.length,
    availableFontCount: availableFonts.length,
    preferredFontSource:
      loadedSystemFonts.length > 0 ? "local" as const : "preset" as const,
  };
  const resolvedAgentProfile = agentProfile ?? loadStoredAgentProfile() ?? undefined;
  const resolvedVisualStyleProfiles = visualStyleProfiles ?? [];

  return {
  document: {
    id: document.id,
    name: document.name,
    canvas: {
      width: document.canvas.width,
      height: document.canvas.height,
      backgroundColor: document.canvas.backgroundColor,
    },
    grid: document.grid,
    semanticBrief: document.semanticBrief,
    semanticSlots: document.semanticSlots,
    blocks: document.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      name: block.name,
      frame: block.frame,
      zIndex: block.zIndex,
      opacity: block.opacity,
      rotation: block.rotation,
      blendMode: block.blendMode,
      clipMode: block.clipMode,
      locked: block.locked,
      hidden: block.hidden,
      ...(block.type === "ai-generation"
        ? {
            data: {
              mediaMode: block.data.mediaMode,
              resultAssetId: block.data.resultAssetId,
              resultImageUrl: block.data.resultImageUrl,
              resultPreviewUrl: block.data.resultPreviewUrl,
              resultMimeType: block.data.resultMimeType,
            },
          }
        : undefined),
    })),
  },
  selectedSlotIds,
  availableFonts,
  fontContext,
  fontPresets: semanticTypographyPresets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    family: preset.family,
    category: preset.category,
  })),
  options: {
    allowAutoGeneration: document.semanticBrief?.allowAIGeneration ?? true,
  },
  liveContext,
  agentProfile: resolvedAgentProfile,
  visualStyleProfiles: resolvedVisualStyleProfiles,
  runMode,
  };
};

export class BackendOrchestrationService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request(path: string, payload: OrchestratorRequest) {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new BackendOrchestrationServiceError(
          "Could not reach the orchestration backend. Make sure the backend is running and /api requests are proxied correctly.",
        );
      }

      throw error;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new BackendOrchestrationServiceError(
        payload.error?.message ??
          `Orchestration request failed with status ${response.status}.`,
      );
    }

    const result = (await response.json()) as unknown;

    if (!validateOrchestratorResponse(result)) {
      throw new BackendOrchestrationServiceError(
        "The orchestration backend returned an invalid plan payload.",
      );
    }

    return result;
  }

  generatePlan(
    document: DesignDocument,
    selectedSlots?: SemanticSlot[],
    agentProfile?: AgentProfile,
    visualStyleProfiles?: VisualStyleProfile[],
  ): Promise<OrchestratorResponse> {
    return this.request(
      "/orchestrator/plan",
      toOrchestratorRequest(
        document,
        selectedSlots?.map((slot) => slot.id),
        "plan",
        undefined,
        agentProfile,
        visualStyleProfiles,
      ),
    );
  }

  refreshPlan(
    document: DesignDocument,
    selectedSlots?: SemanticSlot[],
    agentProfile?: AgentProfile,
    visualStyleProfiles?: VisualStyleProfile[],
  ): Promise<OrchestratorResponse> {
    return this.request(
      "/orchestrator/refresh",
      toOrchestratorRequest(
        document,
        selectedSlots?.map((slot) => slot.id),
        "refresh",
        undefined,
        agentProfile,
        visualStyleProfiles,
      ),
    );
  }

  generateLiveDirectionPlan(
    document: DesignDocument,
    liveContext: LiveSemanticContext,
    selectedSlots?: SemanticSlot[],
    agentProfile?: AgentProfile,
    visualStyleProfiles?: VisualStyleProfile[],
  ): Promise<OrchestratorResponse> {
    return this.request(
      "/orchestrator/live-direction",
      toOrchestratorRequest(
        document,
        selectedSlots?.map((slot) => slot.id),
        "live-direction",
        liveContext,
        agentProfile,
        visualStyleProfiles,
      ),
    );
  }

  async buildAgentProfile(
    input: BuildAgentProfileRequest,
  ): Promise<BuildAgentProfileResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/orchestrator/agent-profile/build`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new BackendOrchestrationServiceError(
          "Could not reach the orchestration backend. Make sure the backend is running and /api requests are proxied correctly.",
        );
      }

      throw error;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new BackendOrchestrationServiceError(
        payload.error?.message ??
          `Agent profile request failed with status ${response.status}.`,
      );
    }

    const result = (await response.json()) as BuildAgentProfileResponse;

    return {
      ...result,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    };
  }
}

export const backendOrchestrationService = new BackendOrchestrationService();
