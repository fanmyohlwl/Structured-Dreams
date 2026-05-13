import type { StoredDesignDocument } from "../documents/types.js";

export type OrchestratorProviderId = "mock" | "openai" | "openrouter";

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

export interface BuildAgentProfileResponse {
  profile: AgentProfile;
  summary: string;
  warnings: string[];
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

export interface VisualStyleAnalysisProviderRequest {
  assetId: string;
  title?: string;
  dataUrl: string;
  mimeType: string;
}

export interface VisualStyleAnalysisResponse {
  profile: VisualStyleProfile;
  warnings: string[];
}

export interface OrchestratorRequest {
  document: StoredDesignDocument;
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

export interface OrchestrationPlanCanvasPatch {
  backgroundColor?: string;
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
  asset?: {
    assetId: string;
    kind: "raster" | "vector";
    src: string;
    mimeType: string;
    fileName?: string;
  } | null;
  fitMode?: "cover" | "contain" | "fill";
  backgroundColor?: string | null;
}

export interface PlannedAIGenerationBlockData {
  prompt: string;
  negativePrompt?: string;
  mediaMode?: "image" | "video";
  generationRatioMode?:
    | "follow-block"
    | "1:1"
    | "4:3"
    | "3:4"
    | "16:9"
    | "9:16";
  resultFitMode?: "cover" | "contain" | "fill";
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

export interface PlannedPatternBlockData {
  patternType:
    | "halftone"
    | "dither"
    | "line-specimen"
    | "checker"
    | "stripe"
    | "dot-grid";
  foregroundColor: string;
  backgroundColor?: string | null;
  density: number;
  scale: number;
  angle: number;
  seed?: number;
  label?: string;
}

export interface PlannedBlockBase {
  id: string;
  type: "text" | "image" | "ai-generation" | "live" | "pattern";
  name: string;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  hidden?: boolean;
  locked?: boolean;
  opacity?: number;
  showBorder?: boolean;
  rotation?: number;
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "difference";
  clipMode?: "frame" | "visible";
  filter?: {
    grayscale?: boolean;
    contrast?: number;
    blur?: number;
    saturate?: number;
    dither?: boolean;
    halftone?: boolean;
  };
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
  targetFrame?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  count?: number;
  treatment: string;
  patternType?: PlannedPatternBlockData["patternType"];
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

export interface OrchestrationLayoutPatch {
  id: string;
  targetSlotId?: string;
  targetBlockId?: string;
  frame?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    ratioMode?:
      | "follow-block"
      | "1:1"
      | "4:3"
      | "3:4"
      | "16:9"
      | "9:16";
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
  outputSize?: {
    width: number;
    height: number;
  };
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
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    contentType?: string;
  };
  neighbors: Array<{
    id: string;
    role?: string;
    blockType: string;
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    relation: "overlap" | "adjacent" | "background" | "foreground";
    locked?: boolean;
    hidden?: boolean;
  }>;
  occupiedRegions: Array<{
    sourceId: string;
    sourceType: "pattern" | "ambient" | "text" | "image" | "ai-generation" | "other";
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    note: string;
  }>;
  avoidRegions: Array<{
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
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
  blockPatches: Array<{
    blockId: string;
    patch: Partial<OrchestrationPlannedBlock>;
  }>;
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

export interface OrchestratorResponse {
  plan: OrchestrationPlan;
  appliedGenerationRequests?: OrchestrationGenerationRequest[];
  meta?: {
    providerId: OrchestratorProviderId;
    runMode: "plan" | "refresh" | "live-direction";
  };
  warnings?: string[];
}
