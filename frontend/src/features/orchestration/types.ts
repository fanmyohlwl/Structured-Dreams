import type {
  AIGenerationRatioMode,
  AIGenerationMediaMode,
  BlockBlendMode,
  BlockClipMode,
  BlockType,
  BlockVisualFilter,
  ImageAssetRef,
  ImageFitMode,
  PatternBlockData,
} from "../../entities/block/types";
import type { CanvasSettings } from "../../entities/document/types";
import type {
  SemanticBrief,
  SemanticSlot,
} from "../../entities/semantic/types";
import type { Rect } from "../../shared/types/common";

export interface OrchestrationPlanCanvasPatch {
  backgroundColor?: CanvasSettings["backgroundColor"];
}

export interface PlannedTextBlockData {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  textColor?: string;
  backgroundColor?: string | null;
  padding?: number;
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
}

export interface PlannedImageBlockData {
  asset?: ImageAssetRef | null;
  fitMode?: ImageFitMode;
  backgroundColor?: string | null;
}

export interface PlannedAIGenerationBlockData {
  prompt: string;
  negativePrompt?: string;
  mediaMode?: AIGenerationMediaMode;
  generationRatioMode?: AIGenerationRatioMode;
  resultFitMode?: ImageFitMode;
  matchCanvasBackground?: boolean;
  placeholderLabel?: string;
  durationSeconds?: number;
}

export interface PlannedLiveBlockData {
  detector?: "face" | "hands" | "pose" | "holistic";
  showVideo?: boolean;
  showLandmarks?: boolean;
  backgroundColor?: string | null;
}

export type PlannedPatternBlockData = PatternBlockData;

export interface PlannedBlockBase {
  id: string;
  type: BlockType;
  name: string;
  frame: Rect;
  hidden?: boolean;
  locked?: boolean;
  opacity?: number;
  showBorder?: boolean;
  rotation?: number;
  blendMode?: BlockBlendMode;
  clipMode?: BlockClipMode;
  filter?: BlockVisualFilter;
}

export type OrchestrationPlannedBlock =
  | (PlannedBlockBase & { type: "text"; data: PlannedTextBlockData })
  | (PlannedBlockBase & { type: "image"; data: PlannedImageBlockData })
  | (PlannedBlockBase & {
      type: "ai-generation";
      data: PlannedAIGenerationBlockData;
    })
  | (PlannedBlockBase & { type: "live"; data: PlannedLiveBlockData })
  | (PlannedBlockBase & { type: "pattern"; data: PlannedPatternBlockData });

export interface OrchestrationDecorativeOp {
  id: string;
  type: "duplicate-text" | "duplicate-image" | "create-pattern" | "image-slice";
  sourceSlotId?: string;
  sourceBlockId?: string;
  targetFrame?: Rect;
  count?: number;
  treatment: string;
  patternType?: PatternBlockData["patternType"];
  rationale: string;
  riskLevel: number;
}

export type OrchestrationPlanBlockOp =
  | {
      type: "replace-linked-blocks";
      slotId: string;
      blocks: OrchestrationPlannedBlock[];
    }
  | {
      type: "update";
      blockId: string;
      patch: Partial<OrchestrationPlannedBlock>;
    }
  | {
      type: "delete";
      blockId: string;
    };

export interface OrchestrationPlanBlockPatch {
  blockId: string;
  patch: Partial<OrchestrationPlannedBlock>;
}

export interface OrchestrationLayoutPatch {
  id: string;
  targetSlotId?: string;
  targetBlockId?: string;
  frame?: Rect;
  rotation?: number;
  zIndex?: number;
  opacity?: number;
  clipMode?: "frame" | "visible";
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "difference";
  rationale: string;
  riskLevel: number;
}

export interface OrchestrationRemixSummary {
  mode: "none" | "proposal" | "applied";
  warnings: string[];
}

export interface OrchestrationGenerationRequest {
  slotId: string;
  targetBlockId: string;
  mode: "image" | "video";
  /**
   * @deprecated Orchestration Contract v2 moves final image prompt ownership to
   * PromptBuilder. LLM providers should emit imageIntents instead.
   */
  prompt: string;
  negativePrompt?: string;
  reason: string;
  outputHint: {
    frame: Rect;
    ratioMode?: AIGenerationRatioMode;
  };
  providerHint?: string;
}

export interface ImageIntent {
  id: string;
  targetSlotId: string;
  targetBlockId?: string;
  subject: string;
  mood: string;
  composition: string;
  colorIntent: string;
  styleHint: string;
  abstractionLevel: "literal" | "stylized" | "abstract";
  priority: number;
  avoid?: string[];
  referenceIds?: string[];
}

export interface TypographyAdjustment {
  targetSlotId: string;
  targetBlockId?: string;
  textRole: string;
  fontCategory: "serif" | "sans" | "mono" | "display" | "script" | "system";
  fontPreset?: string;
  fontId?: string;
  fontFamily?: string;
  fontSource?: "preset" | "local" | "online";
  fontWeight?: number | string;
  fontSizeScale?: number;
  letterSpacing?: number;
  lineHeight?: number;
  alignment?: "left" | "center" | "right";
  textColor?: string;
  backgroundColor?: string | null;
  rationale?: string;
}

export interface DesignCritique {
  readabilityScore?: number;
  hierarchyScore?: number;
  brandAlignmentScore?: number;
  warnings: string[];
  suggestions: string[];
}

export interface MediaGenerationSpec {
  id: string;
  intentId?: string;
  targetSlotId: string;
  targetBlockId?: string;
  providerHint?: string;
  mediaType: "image" | "video";
  imageIntent?: ImageIntent;
  compiledPrompt?: string;
  outputSize?: { width: number; height: number };
  format?: "png" | "jpeg" | "webp";
  background?: "transparent" | "solid";
  referenceAssetIds?: string[];
  metadata?: Record<string, unknown>;
  priority: number;
  status?: "planned" | "queued" | "skipped";
  rationale?: string;
}

export interface LayoutContextSummary {
  targetSlot?: {
    id: string;
    role: string;
    frame: Rect;
    contentType?: string;
  };
  neighbors: Array<{
    id: string;
    role?: string;
    blockType: string;
    frame: Rect;
    relation: "overlap" | "adjacent" | "background" | "foreground";
    locked?: boolean;
    hidden?: boolean;
  }>;
  occupiedRegions: Array<{
    sourceId: string;
    sourceType: "pattern" | "ambient" | "text" | "image" | "ai-generation" | "other";
    frame: Rect;
    note: string;
  }>;
  avoidRegions: Array<{
    frame: Rect;
    reason: string;
  }>;
}

export interface LiveSnapshotLandmarkSample {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  region?: "face" | "hand" | "pose";
}

export interface LiveSnapshotFrameSummary {
  faceCount: number;
  handCount: number;
  poseCount: number;
  expressions: Record<string, number>;
  primaryExpression?: string;
  updatedAt?: number;
  landmarkSamples: LiveSnapshotLandmarkSample[];
}

export interface LiveSnapshot {
  dataUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  capturedAt?: string;
  frame: LiveSnapshotFrameSummary | null;
}

export interface LiveSemanticContext {
  enabled: boolean;
  snapshot?: LiveSnapshot;
  notes?: string;
  allowImageRegeneration?: boolean;
  liveCaptureId?: string;
  fuseCapturedPortrait?: boolean;
}

export interface LiveArtDirection {
  summary: string;
  observations: string[];
  primarySignals: string[];
  direction: string;
  colorStrategy?: string;
  motionStrategy?: string;
  imageRegenerationStrategy?: string;
  warnings: string[];
}

export interface LiveMappingPatch {
  id: string;
  targetSlotId?: string;
  targetBlockId?: string;
  mappingType:
    | "canvas-color"
    | "block-color"
    | "image-layout"
    | "text-typography"
    | "live-visual";
  signalKey: string;
  intensity: number;
  rationale: string;
}

export interface OrchestrationRefreshPolicy {
  recommendedIntervalMs: number;
  allowAutoRefresh: boolean;
}

export interface OrchestrationPlan {
  planId: string;
  summary: string;
  canvasPatch?: OrchestrationPlanCanvasPatch;
  slotLinks: Array<{
    slotId: string;
    linkedBlockIds: string[];
  }>;
  blockOps: OrchestrationPlanBlockOp[];
  blockPatches: OrchestrationPlanBlockPatch[];
  imageIntents: ImageIntent[];
  typographyAdjustments: TypographyAdjustment[];
  mediaGenerationSpecs?: MediaGenerationSpec[];
  liveArtDirection?: LiveArtDirection;
  liveMappingPatches?: LiveMappingPatch[];
  layoutPatches?: OrchestrationLayoutPatch[];
  remixSummary?: OrchestrationRemixSummary;
  decorativeOps?: OrchestrationDecorativeOp[];
  critique: DesignCritique;
  generationRequests: OrchestrationGenerationRequest[];
  refreshPolicy?: OrchestrationRefreshPolicy;
  warnings: string[];
}

export interface OrchestratorRequest {
  document: {
    id: string;
    name: string;
    canvas: {
      width: number;
      height: number;
      backgroundColor: string;
    };
    grid: {
      columns: number;
      rows: number;
      padding: number;
      showGrid: boolean;
      snapToGrid: boolean;
    };
    semanticBrief?: SemanticBrief;
    semanticSlots?: SemanticSlot[];
    blocks: Array<{
      id: string;
      type: BlockType;
      name: string;
      frame: Rect;
      zIndex?: number;
      opacity?: number;
      rotation?: number;
      blendMode?: BlockBlendMode;
      clipMode?: BlockClipMode;
      locked?: boolean;
      hidden?: boolean;
      data?: {
        mediaMode?: AIGenerationMediaMode;
        resultAssetId?: string;
        resultImageUrl?: string;
        resultPreviewUrl?: string;
        resultMimeType?: string;
      };
    }>;
  };
  selectedSlotIds?: string[];
  availableFonts?: Array<{
    id: string;
    label: string;
    family: string;
    category: string;
    source: "system" | "fallback" | "online";
  }>;
  fontPresets?: Array<{
    id: string;
    label: string;
    family: string;
    category: string;
  }>;
  fontContext?: {
    localFontsLoaded: boolean;
    localFontCount: number;
    availableFontCount: number;
    preferredFontSource?: "local" | "online" | "preset";
  };
  options?: {
    allowAutoGeneration?: boolean;
  };
  liveContext?: LiveSemanticContext;
  agentProfile?: AgentProfile;
  visualStyleProfiles?: VisualStyleProfile[];
  runMode: "plan" | "refresh" | "live-direction";
}

export interface OrchestratorResponse {
  plan: OrchestrationPlan;
  appliedGenerationRequests?: OrchestrationGenerationRequest[];
  meta?: {
    providerId: string;
    runMode: "plan" | "refresh" | "live-direction";
  };
  warnings?: string[];
}

export interface AgentProfile {
  version: 1;
  agentName: string;
  plainLanguageBrief: string;
  designDirection: string;
  compositionBias:
    | "minimal-grid"
    | "editorial-grid"
    | "complex-grid"
    | "poster-system"
    | "experimental-system";
  typographyBias: string;
  colorBias: string;
  imageTreatmentBias: string;
  layoutComplexity: number;
  visualDensity: number;
  riskLevel: number;
  avoid: string[];
  liveDirectionBehavior: {
    preferMappingOnly: boolean;
    respondToExpression: boolean;
    respondToBodyMotion: boolean;
    respondToEnvironment: boolean;
  };
}

export interface BuildAgentProfileResponse {
  profile: AgentProfile;
  summary: string;
  warnings: string[];
}

export interface BuildAgentProfileRequest {
  plainLanguageBrief: string;
  existingProfile?: AgentProfile;
  referenceImages?: Array<{
    assetId?: string;
    title?: string;
    dataUrl?: string;
    mimeType?: string;
    byteSize?: number;
  }>;
}

export interface VisualStyleProfile {
  id: string;
  assetId: string;
  title: string;
  createdAt: string;
  summary: string;
  composition: string;
  typography: string;
  color: string;
  imageTreatment: string;
  spatialRules: string[];
  layoutRules: string[];
  avoid: string[];
  confidence: number;
}

export interface VisualStyleAnalysisResponse {
  profile: VisualStyleProfile;
  warnings: string[];
}

export type OrchestrationExecutionPhase =
  | "idle"
  | "planning-layout"
  | "applying-layout"
  | "generating-images"
  | "completed"
  | "failed";

export type OrchestrationGenerationQueueItemStatus =
  | "queued"
  | "generating"
  | "completed"
  | "failed";

export interface OrchestrationGenerationQueueItem {
  id: string;
  slotId: string;
  targetBlockId: string;
  label: string;
  mode: "image" | "video";
  status: OrchestrationGenerationQueueItemStatus;
  generationJobId?: string;
  progress?: number;
  errorMessage?: string;
  warnings?: string[];
}

export interface OrchestrationExecutionState {
  phase: OrchestrationExecutionPhase;
  isRunning: boolean;
  summary?: string;
  errorMessage?: string;
  warnings: string[];
  queue: OrchestrationGenerationQueueItem[];
  startedAt?: string;
  completedAt?: string;
}

export const createIdleOrchestrationExecutionState =
  (): OrchestrationExecutionState => ({
    phase: "idle",
    isRunning: false,
    warnings: [],
    queue: [],
  });
