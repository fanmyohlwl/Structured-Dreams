import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./App.css";
import type {
  AIGenerationBlockData,
  AIGenerationMediaMode,
  DesignBlock,
  ImageAssetKind,
  ImageBlockData,
  LiveBlockData,
  TextBlockData,
} from "../entities/block/types";
import type {
  DesignDocument,
  RenderDocumentSnapshot,
} from "../entities/document/types";
import type { SemanticSlot } from "../entities/semantic/types";
import {
  getSemanticSlotKindLabel,
  getSemanticSlotPurposeLabel,
  inferSemanticSlotKind,
} from "../entities/semantic/types";
import { aiGenerationService } from "../features/ai/services/AIGenerationService";
import { aiVideoGenerationService } from "../features/ai/services/AIVideoGenerationService";
import {
  deriveAIGenerationOutputSize,
} from "../features/ai/utils/aiBlockGeneration";
import {
  createContinuousAIGenerationSnapshot,
  createIdleContinuousAIGenerationSession,
  runSingleAIGenerationCycle,
  type ContinuousAIGenerationSessionState,
  waitForContinuousGenerationDelay,
} from "../features/ai/runtime/continuousGeneration";
import type { AIGenerationResponse } from "../features/ai/types";
import {
  createAIVideoGenerationSnapshot,
  runSingleAIVideoGenerationCycle,
} from "../features/ai/runtime/videoGeneration";
import type { AIVideoGenerationResponse } from "../features/ai/videoTypes";
import { downloadBlob } from "../features/export/services/downloadBlob";
import { prototypeExportService } from "../features/export/services/PrototypeExportService";
import type {
  AnimatedExportFormat,
  AnimatedExportStage,
  StaticExportFormat,
} from "../features/export/types";
import {
  selectExportDocumentSnapshot,
  selectPreviewDocumentSnapshot,
} from "../features/editor/state/selectors";
import { EditorSidebar } from "../features/editor/components/EditorSidebar";
import { GridCanvasPanel } from "../features/editor/components/GridCanvasPanel";
import {
  SemanticComposeSidebar,
  type SemanticLiveCaptureState,
} from "../features/editor/components/SemanticComposeSidebar";
import { LiveCameraCoordinator } from "../features/live/components/LiveCameraCoordinator";
import {
  captureSharedLiveMoment,
  enumerateSharedCameraDevices,
  sampleSharedLiveEnvironment,
  setSharedCameraDevice,
  useSharedCameraDeviceState,
  useSharedLiveCamera,
  waitForSharedCameraReady,
} from "../features/live/runtime/sharedLiveCamera";
import type {
  LiveDetectionFrame,
  SharedLiveEnvironmentSample,
} from "../features/live/types";
import {
  ExhibitionModeOverlay,
  type ExhibitionAudienceInput,
} from "../features/preview/components/ExhibitionModeOverlay";
import { LivePreviewPanel } from "../features/preview/components/LivePreviewPanel";
import { FileMenu } from "../features/persistence/components/FileMenu";
import { PersonalCenterView } from "../features/persistence/components/PersonalCenterView";
import { deriveStoredDocumentSummary } from "../features/persistence/documentSummary";
import { backendOrchestrationService } from "../features/orchestration/services/BackendOrchestrationService";
import {
  createIdleOrchestrationExecutionState,
  type AgentProfile,
  type ImageIntent,
  type LayoutContextSummary,
  type LiveMappingPatch,
  type LiveSemanticContext,
  type MediaGenerationSpec,
  type OrchestrationExecutionState,
  type OrchestrationGenerationQueueItem,
  type OrchestrationPlan,
  type VisualStyleProfile,
} from "../features/orchestration/types";
import type { Rect } from "../shared/types/common";
import {
  createDefaultAgentProfile,
  loadStoredAgentProfileLibrary,
  loadStoredAgentProfile,
  persistAgentProfile,
  persistAgentProfileLibrary,
  sanitizeAgentProfile,
} from "../features/orchestration/agentProfile";
import {
  loadActiveVisualStyleProfileIds,
  loadVisualStyleProfiles,
  persistActiveVisualStyleProfileIds,
  persistVisualStyleProfiles,
} from "../features/orchestration/visualStyleProfiles";
import {
  semanticTypographyPresets,
  type SemanticTypographyPreset,
} from "../features/typography/semanticTypographyPresets";
import {
  backendAssetPersistenceService,
  type UploadedAssetRecord,
} from "../features/persistence/services/BackendAssetPersistenceService";
import {
  backendGenerationJobService,
  type CreateGenerationJobRequest,
  type GenerationJob,
} from "../features/generation/services/BackendGenerationJobService";
import {
  backendAuthService,
  BackendAuthServiceError,
} from "../features/auth/services/BackendAuthService";
import type { AuthenticatedUser } from "../features/auth/types";
import {
  backendDocumentPersistenceService,
  DocumentPersistenceError,
} from "../features/persistence/services/BackendDocumentPersistenceService";
import type {
  DocumentSaveStage,
  RecentDocumentsStatus,
  StoredDocumentSummary,
} from "../features/persistence/types";
import {
  createDocumentCopy,
  createMockEditorState,
} from "../features/editor/state/mockEditorState";
import {
  createSemanticFrameSynchronizedDocument,
  editorReducer,
  initializeEditorState,
} from "../features/editor/state/reducer";

interface ActiveContinuousAIGenerationRef {
  sessionId: symbol;
  activeBlockId: string;
  activeGenerationId?: string;
  stopController: AbortController;
  cancelAttempted: boolean;
}

interface ActiveManualAIGenerationRef {
  requestId: symbol;
  activeBlockId: string;
  mode: AIGenerationMediaMode;
  activeGenerationId?: string;
  cancelAttempted: boolean;
}

type AppView = "workspace" | "personal-center";
type AuthStatus = "loading" | "authenticated" | "guest";

const DEFAULT_WEBM_EXPORT_DURATION_MS = 3000;
const ORCHESTRATION_MANUAL_EDIT_COOLDOWN_MS = 15000;
const GENERATION_JOB_POLL_INTERVAL_MS = 1500;
const GENERATION_JOB_RUNNING_NOTICE_ATTEMPTS = 120;

const wait = (durationMs: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

const getOrchestrationQueueItemId = (
  slotId: string,
  targetBlockId: string,
  mode: "image" | "video" = "image",
) => `${slotId}:${targetBlockId}:${mode}`;

const isTechnicalOrchestrationWarning = (item: string) => {
  const normalized = item.trim().toLowerCase();

  return [
    "no final provider image prompts are included",
    "no locked blocks or locked slots were modified",
    "canvas dimensions, grid, required copy",
  ].some((pattern) => normalized.includes(pattern));
};

const uniqueStrings = (items: string[]) =>
  [
    ...new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !isTechnicalOrchestrationWarning(item)),
    ),
  ];

type OrchestrationSlotScope = "all" | "selected";

const createLiveCaptureId = () =>
  `live_capture_${
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }`;

const getExhibitionStyleDirection = (style: ExhibitionAudienceInput["style"]) => {
  switch (style) {
    case "bold-type":
      return "favor bold typographic contrast, oversized but readable hierarchy, and a fresh type treatment this round";
    case "image-led":
      return "favor image-led composition, strong crop language, and supporting typography that does not repeat the previous round";
    case "atmospheric":
      return "favor atmosphere, color temperature, motion feeling, and subtle but distinct typography decisions";
    case "balanced":
    default:
      return "balance readable typography, image response, and live atmosphere while avoiding the exact same font/preset combination as the previous round";
  }
};

const buildExhibitionLiveNotes = (input?: ExhibitionAudienceInput) => {
  if (!input) {
    return undefined;
  }

  return [
    "Exhibition audience generation round:",
    `Round: ${input.round}`,
    input.identity ? `Audience identity: ${input.identity}` : undefined,
    input.prompt ? `Audience one-line prompt: ${input.prompt}` : undefined,
    input.keywords ? `Audience keywords: ${input.keywords}` : undefined,
    `Style tendency: ${getExhibitionStyleDirection(input.style)}.`,
    "Treat this as a new public-facing live response. Re-evaluate typography direction independently for this round; choose a noticeably different but still readable hierarchy, weight, scale, rhythm, or font preset/fontId when the contract allows it. Do not change user-owned layout, slot frames, canvas size, grid, or core copy.",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildExhibitionIdentityLine = (identity: string) => {
  const trimmedIdentity = identity.trim();

  if (!trimmedIdentity) {
    return undefined;
  }

  const possessiveIdentity = /'s$/i.test(trimmedIdentity)
    ? trimmedIdentity
    : `${trimmedIdentity}'s`;

  return `${possessiveIdentity} structured dreams`;
};

const getExhibitionIdentitySearchText = (
  slot: SemanticSlot,
  block?: DesignBlock,
) =>
  [
    slot.name,
    slot.role,
    slot.content,
    slot.visualIntent,
    block?.name,
    block?.type === "text" ? block.data.content : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const findExhibitionIdentityTextTarget = (document: DesignDocument) => {
  const textSlots = (document.semanticSlots ?? [])
    .filter((slot) => !slot.hidden && !slot.lockedByUser)
    .filter((slot) => inferSemanticSlotKind(slot) === "text")
    .map((slot) => {
      const linkedTextBlock = (slot.linkedBlockIds ?? [])
        .map((blockId) =>
          document.blocks.find((candidate) => candidate.id === blockId),
        )
        .find((block): block is Extract<DesignBlock, { type: "text" }> => {
          if (!block) {
            return false;
          }

          return block.type === "text" && !block.locked;
        });

      return {
        slot,
        block: linkedTextBlock,
        searchText: getExhibitionIdentitySearchText(slot, linkedTextBlock),
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        slot: SemanticSlot;
        block: Extract<DesignBlock, { type: "text" }>;
        searchText: string;
      } => Boolean(candidate.block),
    );

  return (
    textSlots.find((candidate) =>
      candidate.searchText.includes("structured dreams"),
    ) ??
    textSlots.find((candidate) =>
      ["identity", "audience", "name", "structured dreams"].some((keyword) =>
        candidate.searchText.includes(keyword),
      ),
    ) ??
    textSlots[0] ??
    null
  );
};

const withExhibitionIdentityText = (
  document: DesignDocument,
  identity: string,
) => {
  const content = buildExhibitionIdentityLine(identity);

  if (!content) {
    return {
      document,
      content: undefined,
      targetBlockId: undefined,
    };
  }

  const target = findExhibitionIdentityTextTarget(document);

  if (!target?.block) {
    return {
      document,
      content,
      targetBlockId: undefined,
    };
  }

  return {
    document: {
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === target.block.id && block.type === "text"
          ? {
              ...block,
              data: {
                ...block.data,
                content,
              },
            }
          : block,
      ),
    },
    content,
    targetBlockId: target.block.id,
  };
};

const exhibitionPresetCycleByStyle: Record<
  ExhibitionAudienceInput["style"],
  string[]
> = {
  balanced: [
    "neo-grotesk",
    "editorial-serif",
    "soft-humanist",
    "tech-mono",
  ],
  "bold-type": [
    "compressed-poster",
    "playful-display",
    "brutalist-mono",
    "luxury-contrast",
  ],
  "image-led": [
    "image-led-minimal",
    "neo-grotesk",
    "luxury-contrast",
    "brutalist-mono",
  ],
  atmospheric: [
    "soft-humanist",
    "script-accent",
    "editorial-serif",
    "chinese-editorial",
  ],
};

const hashExhibitionTypographySeed = (input: ExhibitionAudienceInput) =>
  `${input.identity}|${input.prompt}|${input.keywords}|${input.style}`
    .split("")
    .reduce(
      (hash, character) =>
        (hash * 31 + character.charCodeAt(0)) % 1000003,
      input.round * 97,
    );

const pickExhibitionTypographyPreset = (
  input: ExhibitionAudienceInput,
  currentFontFamily?: string,
) => {
  const presetIds =
    exhibitionPresetCycleByStyle[input.style] ??
    exhibitionPresetCycleByStyle.balanced;
  const seed = hashExhibitionTypographySeed(input);
  const orderedPresets = presetIds
    .map((id) => semanticTypographyPresets.find((preset) => preset.id === id))
    .filter((preset): preset is SemanticTypographyPreset => Boolean(preset));
  const fallbackPresets =
    orderedPresets.length > 0 ? orderedPresets : semanticTypographyPresets;
  const nonRepeatingPresets = fallbackPresets.filter(
    (preset) => preset.family !== currentFontFamily,
  );
  const candidates =
    nonRepeatingPresets.length > 0 ? nonRepeatingPresets : fallbackPresets;

  return candidates[seed % candidates.length] ?? semanticTypographyPresets[0];
};

const buildExhibitionTypographyPatch = (
  input: ExhibitionAudienceInput,
  block: Extract<DesignBlock, { type: "text" }>,
): Partial<TextBlockData> => {
  const preset = pickExhibitionTypographyPreset(
    input,
    block.data.fontFamily,
  );
  const roundVariant = Math.abs(hashExhibitionTypographySeed(input)) % 5;
  const styleScale: Record<ExhibitionAudienceInput["style"], number[]> = {
    balanced: [0.94, 1.02, 1.08, 0.98, 1.12],
    "bold-type": [1.12, 1.22, 1.04, 1.18, 1.28],
    "image-led": [0.9, 0.96, 1.04, 1, 0.92],
    atmospheric: [0.96, 1.04, 1.1, 0.92, 1.06],
  };
  const nextFontSize = Math.round(
    Math.min(
      160,
      Math.max(
        8,
        block.data.fontSize *
          (styleScale[input.style]?.[roundVariant] ??
            styleScale.balanced[roundVariant] ??
            1),
      ),
    ),
  );
  const colorCycle =
    input.style === "bold-type"
      ? ["#1f2933", "#1E398F", "#D6007E", "#0f172a", "#111827"]
      : input.style === "atmospheric"
        ? ["#1f2933", "#334155", "#1E398F", "#475569", "#0f172a"]
        : ["#1f2933", "#1E398F", "#111827", "#334155", "#D6007E"];
  const alignmentCycle: NonNullable<TextBlockData["textAlign"]>[] =
    input.style === "image-led"
      ? ["left", "right", "center", "left", "right"]
      : ["left", "center", "left", "right", "center"];

  return {
    fontFamily: preset.family,
    fontSize: nextFontSize,
    fontWeight:
      roundVariant % 2 === 0
        ? preset.defaultWeight ?? block.data.fontWeight ?? 700
        : input.style === "bold-type"
          ? 900
          : preset.defaultWeight ?? 600,
    letterSpacing:
      (preset.defaultLetterSpacing ?? block.data.letterSpacing ?? 0) +
      [-0.3, 0.2, 0.8, -0.6, 1.1][roundVariant],
    lineHeight: Math.max(
      0.88,
      Math.min(1.25, preset.defaultLineHeight ?? block.data.lineHeight ?? 1),
    ),
    textColor: colorCycle[roundVariant] ?? "#1f2933",
    textAlign: alignmentCycle[roundVariant] ?? block.data.textAlign ?? "left",
  };
};

const withExhibitionTypographyPatch = (
  document: DesignDocument,
  blockId: string | undefined,
  input: ExhibitionAudienceInput,
) => {
  if (!blockId) {
    return {
      document,
      patch: undefined,
    };
  }

  const targetBlock = document.blocks.find(
    (block): block is Extract<DesignBlock, { type: "text" }> =>
      block.id === blockId && block.type === "text" && !block.locked,
  );

  if (!targetBlock) {
    return {
      document,
      patch: undefined,
    };
  }

  const patch = buildExhibitionTypographyPatch(input, targetBlock);

  return {
    document: {
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === blockId && block.type === "text"
          ? {
              ...block,
              data: {
                ...block.data,
                ...patch,
              },
            }
          : block,
      ),
    },
    patch,
  };
};

const createExhibitionRenderDocument = (
  document: RenderDocumentSnapshot,
): RenderDocumentSnapshot => ({
  ...document,
  blocks: document.blocks.map((block) => {
    if (block.type !== "text") {
      return block;
    }

    return {
      ...block,
      data: {
        ...block.data,
        backgroundColor: null,
        liveColorMapping: block.data.liveColorMapping
          ? {
              ...block.data.liveColorMapping,
              enabled: false,
            }
          : block.data.liveColorMapping,
        liveTypography: block.data.liveTypography
          ? {
              ...block.data.liveTypography,
              enabled: false,
            }
          : block.data.liveTypography,
      },
    };
  }),
});

const isDataUrl = (url: string) => url.startsWith("data:");

const isInternalAssetUrl = (url: string) =>
  url.startsWith("/api/assets/") || url.includes("/api/assets/");

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read reference image as a data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Reference image read failed."));
    };
    reader.readAsDataURL(blob);
  });

const loadReferenceUrlAsDataUrl = async (url: string) => {
  if (isDataUrl(url) || (!isInternalAssetUrl(url) && /^https?:\/\//i.test(url))) {
    return url;
  }

  if (!isInternalAssetUrl(url)) {
    return url;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load previous AI result reference (${response.status}).`);
  }

  return blobToDataUrl(await response.blob());
};

type ImageIntentFrameResolution = {
  frame: Rect;
  frameSource: "semantic-slot" | "target-block" | "fallback";
  targetSlot?: SemanticSlot;
  targetBlock?: DesignBlock;
};

const rectArea = (rect: Rect) =>
  Math.max(0, rect.width) * Math.max(0, rect.height);

const rectIntersectionArea = (left: Rect, right: Rect) => {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);

  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
};

const rectsOverlap = (left: Rect, right: Rect) =>
  rectIntersectionArea(left, right) > 0;

const rectDistance = (left: Rect, right: Rect) => {
  const dx = Math.max(
    right.x - (left.x + left.width),
    left.x - (right.x + right.width),
    0,
  );
  const dy = Math.max(
    right.y - (left.y + left.height),
    left.y - (right.y + right.height),
    0,
  );

  return Math.sqrt(dx * dx + dy * dy);
};

const getLayoutRelation = (
  target: Rect,
  candidate: Rect,
  targetZIndex = 0,
  candidateZIndex = 0,
): LayoutContextSummary["neighbors"][number]["relation"] => {
  if (rectsOverlap(target, candidate)) {
    return "overlap";
  }

  const adjacencyThreshold = Math.max(48, Math.min(target.width, target.height) * 0.35);

  if (rectDistance(target, candidate) <= adjacencyThreshold) {
    return "adjacent";
  }

  return candidateZIndex < targetZIndex ? "background" : "foreground";
};

const inferSlotOutputBlockType = (slot: SemanticSlot): string => {
  const kind = inferSemanticSlotKind(slot);

  if (slot.preferredBlockType) {
    return slot.preferredBlockType;
  }

  if (kind === "ai-image" || kind === "ai-video") {
    return "ai-generation";
  }

  return kind;
};

const isAmbientSemanticSlot = (slot: SemanticSlot) =>
  slot.role === "ambient-visual" ||
  slot.role === "live-visual" ||
  inferSemanticSlotKind(slot) === "live";

const getOccupiedRegionSourceType = (
  block: DesignBlock,
): LayoutContextSummary["occupiedRegions"][number]["sourceType"] => {
  if (block.type === "pattern") {
    return "pattern";
  }

  if (block.type === "text" || block.type === "image" || block.type === "ai-generation") {
    return block.type;
  }

  return "other";
};

const getAnimatedExportStatusMessage = (
  format: AnimatedExportFormat,
  stage: AnimatedExportStage,
) => {
  switch (stage) {
    case "preparing-assets":
      return `Preparing ${format.toUpperCase()} export...`;
    case "starting-live-camera":
      return "Starting live camera for export...";
    case "rendering-webm":
      return "Rendering WebM source...";
    case "transcoding":
      return `Transcoding ${format.toUpperCase()}...`;
  }
};

const deriveAnimatedExportDurationMs = (document: DesignDocument) => {
  const videoDurations = document.blocks
    .filter(
      (block): block is DesignBlock & { type: "ai-generation" } =>
        block.type === "ai-generation" &&
        (block.data.mediaMode ?? "image") === "video",
    )
    .map((block) => block.data.resultDurationMs ?? 0)
    .filter((duration) => duration > 0);

  return videoDurations.length > 0
    ? Math.max(...videoDurations)
    : DEFAULT_WEBM_EXPORT_DURATION_MS;
};

const createQueuedAIGenerationPatch = (): Partial<AIGenerationBlockData> => ({
  status: "queued",
  provider: "backend",
  generationProgress: 0,
  errorMessage: undefined,
});

const upsertRecentDocumentSummary = (
  currentDocuments: StoredDocumentSummary[],
  nextDocument: StoredDocumentSummary,
) =>
  [nextDocument, ...currentDocuments.filter((document) => document.id !== nextDocument.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const getDefaultDocumentSelectionIds = (document: DesignDocument) =>
  document.blocks[0] ? [document.blocks[0].id] : [];

const DEFAULT_TEMPLATE_EXPORT_BLOCK_IDS = new Set([
  "block_text_brand",
  "block_image_symbol",
  "block_ai_texture",
  "block_live_camera",
]);

type SemanticLiveAutoCaptureSensitivity = "low" | "medium" | "high";

const SEMANTIC_LIVE_AUTO_CAPTURE_INTERVAL_MS = 1500;
const MIN_SEMANTIC_LIVE_AUTO_CAPTURE_COOLDOWN_SECONDS = 8;
const DEFAULT_SEMANTIC_LIVE_AUTO_CAPTURE_COOLDOWN_SECONDS = 12;
const SEMANTIC_LIVE_AUTO_CAPTURE_THRESHOLDS: Record<
  SemanticLiveAutoCaptureSensitivity,
  {
    signalDelta: number;
    environmentDelta: number;
  }
> = {
  low: {
    signalDelta: 0.55,
    environmentDelta: 0.38,
  },
  medium: {
    signalDelta: 0.34,
    environmentDelta: 0.24,
  },
  high: {
    signalDelta: 0.2,
    environmentDelta: 0.14,
  },
};
const SEMANTIC_LIVE_AUTO_CAPTURE_SIGNAL_KEYS = [
  "smile",
  "handMotion",
  "armsRaised",
  "handsAboveShoulders",
  "jawOpen",
  "browInnerUp",
];

const getEnvironmentDelta = (
  current: SharedLiveEnvironmentSample | null,
  previous: SharedLiveEnvironmentSample | null,
) => {
  if (!current || !previous) {
    return 0;
  }

  return (
    Math.abs(current.brightness - previous.brightness) * 0.35 +
    Math.abs(current.red - previous.red) * 0.22 +
    Math.abs(current.green - previous.green) * 0.22 +
    Math.abs(current.blue - previous.blue) * 0.21
  );
};

const getSemanticLiveAutoCaptureReason = ({
  currentFrame,
  previousFrame,
  currentEnvironment,
  previousEnvironment,
  sensitivity,
}: {
  currentFrame: LiveDetectionFrame | null;
  previousFrame: LiveDetectionFrame | null;
  currentEnvironment: SharedLiveEnvironmentSample | null;
  previousEnvironment: SharedLiveEnvironmentSample | null;
  sensitivity: SemanticLiveAutoCaptureSensitivity;
}) => {
  if (!currentFrame && !currentEnvironment) {
    return undefined;
  }

  if (currentFrame && previousFrame) {
    if (
      currentFrame.faceCount !== previousFrame.faceCount ||
      currentFrame.poseCount !== previousFrame.poseCount
    ) {
      return "People changed";
    }

    if (
      currentFrame.primaryExpression &&
      previousFrame.primaryExpression &&
      currentFrame.primaryExpression !== previousFrame.primaryExpression
    ) {
      return "Expression changed";
    }

    const threshold = SEMANTIC_LIVE_AUTO_CAPTURE_THRESHOLDS[sensitivity];
    const hasGestureChange = SEMANTIC_LIVE_AUTO_CAPTURE_SIGNAL_KEYS.some(
      (signalKey) =>
        Math.abs(
          (currentFrame.expressions[signalKey] ?? 0) -
            (previousFrame.expressions[signalKey] ?? 0),
        ) >= threshold.signalDelta,
    );

    if (hasGestureChange || currentFrame.handCount !== previousFrame.handCount) {
      return "Gesture changed";
    }
  }

  const environmentDelta = getEnvironmentDelta(
    currentEnvironment,
    previousEnvironment,
  );

  if (
    environmentDelta >=
    SEMANTIC_LIVE_AUTO_CAPTURE_THRESHOLDS[sensitivity].environmentDelta
  ) {
    return "Environment changed";
  }

  return undefined;
};

export default function App() {
  const [editorState, dispatch] = useReducer(
    editorReducer,
    undefined,
    () => initializeEditorState(createMockEditorState()),
  );
  const [exportState, setExportState] = useState<{
    isExporting: boolean;
    statusMessage?: string;
  }>({
    isExporting: false,
  });
  const [documentPersistenceState, setDocumentPersistenceState] = useState<{
    isSaving: boolean;
    isLoading: boolean;
    saveStage: DocumentSaveStage;
    statusTone: "neutral" | "success" | "error";
    statusMessage?: string;
    recentDocuments: StoredDocumentSummary[];
    recentDocumentsStatus: RecentDocumentsStatus;
    recentDocumentsError?: string;
    hasLoadedRecentDocuments: boolean;
    recentDocumentsIsRefreshing: boolean;
  }>({
    isSaving: false,
    isLoading: false,
    saveStage: "idle",
    statusTone: "neutral",
    recentDocuments: [],
    recentDocumentsStatus: "loading",
    hasLoadedRecentDocuments: false,
    recentDocumentsIsRefreshing: false,
  });
  const [continuousAIGenerationSession, setContinuousAIGenerationSession] =
    useState<ContinuousAIGenerationSessionState>(
      createIdleContinuousAIGenerationSession(),
    );
  const [isExhibitionMode, setIsExhibitionMode] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("workspace");
  const [orchestrationPreviewPlan, setOrchestrationPreviewPlan] =
    useState<OrchestrationPlan | null>(null);
  const [activeAgentProfile, setActiveAgentProfile] =
    useState<AgentProfile | null>(() => loadStoredAgentProfile());
  const [savedAgentProfiles, setSavedAgentProfiles] = useState<AgentProfile[]>(
    () => loadStoredAgentProfileLibrary(),
  );
  const agentProfileSaveTargetRef = useRef<AgentProfile | null>(null);
  const [agentProfileBuilderState, setAgentProfileBuilderState] = useState<{
    isBuilding: boolean;
    summary?: string;
    errorMessage?: string;
    warnings: string[];
  }>({
    isBuilding: false,
    warnings: [],
  });
  const [visualStyleProfiles, setVisualStyleProfiles] = useState<
    VisualStyleProfile[]
  >(() => loadVisualStyleProfiles());
  const [activeVisualStyleProfileIds, setActiveVisualStyleProfileIds] =
    useState<string[]>(() => loadActiveVisualStyleProfileIds());
  const activeVisualStyleProfiles = useMemo(
    () =>
      visualStyleProfiles
        .filter((profile) => activeVisualStyleProfileIds.includes(profile.id))
        .slice(0, 3),
    [activeVisualStyleProfileIds, visualStyleProfiles],
  );
  const [visualReferenceState, setVisualReferenceState] = useState<{
    isUploading: boolean;
    isAnalyzing: boolean;
    uploadedAssets: UploadedAssetRecord[];
    statusMessage?: string;
    errorMessage?: string;
    warnings: string[];
  }>({
    isUploading: false,
    isAnalyzing: false,
    uploadedAssets: [],
    warnings: [],
  });
  const [orchestrationExecutionState, setOrchestrationExecutionState] =
    useState<OrchestrationExecutionState>(
      createIdleOrchestrationExecutionState(),
    );
  const [semanticLiveDirectionEnabled, setSemanticLiveDirectionEnabled] =
    useState(false);
  const [
    semanticLiveImageRegenerationEnabled,
    setSemanticLiveImageRegenerationEnabled,
  ] = useState(false);
  const [
    semanticLivePortraitFusionEnabled,
    setSemanticLivePortraitFusionEnabled,
  ] = useState(false);
  const [
    semanticLiveAutoCaptureEnabled,
    setSemanticLiveAutoCaptureEnabled,
  ] = useState(false);
  const [
    semanticLiveAutoCaptureCooldownSeconds,
    setSemanticLiveAutoCaptureCooldownSeconds,
  ] = useState(DEFAULT_SEMANTIC_LIVE_AUTO_CAPTURE_COOLDOWN_SECONDS);
  const [
    semanticLiveAutoCaptureSensitivity,
    setSemanticLiveAutoCaptureSensitivity,
  ] = useState<SemanticLiveAutoCaptureSensitivity>("medium");
  const [
    semanticLiveAutoCaptureLastReason,
    setSemanticLiveAutoCaptureLastReason,
  ] = useState<string | undefined>(undefined);
  const [semanticLiveCaptureState, setSemanticLiveCaptureState] =
    useState<SemanticLiveCaptureState>({
      status: "idle",
    });
  const [authState, setAuthState] = useState<{
    status: AuthStatus;
    user: AuthenticatedUser | null;
    isSubmitting: boolean;
    errorMessage?: string;
  }>({
    status: "loading",
    user: null,
    isSubmitting: false,
  });
  const activeContinuousSessionRef =
    useRef<ActiveContinuousAIGenerationRef | null>(null);
  const activeManualAIGenerationRef =
    useRef<ActiveManualAIGenerationRef | null>(null);
  const isMountedRef = useRef(true);
  const isOrchestrationRunningRef = useRef(false);
  const recentDocumentsRefreshInFlightRef = useRef<Promise<{
    ok: boolean;
    errorMessage?: string;
  }> | null>(null);
  const recentDocumentsRefreshVersionRef = useRef(0);
  const latestLiveCaptureIdRef = useRef<string | null>(null);
  const lastSemanticEditAtRef = useRef(0);
  const latestDocumentRef = useRef(editorState.document);
  const latestSharedLiveFrameRef = useRef<LiveDetectionFrame | null>(null);
  const previousAutoCaptureFrameRef = useRef<LiveDetectionFrame | null>(null);
  const previousAutoCaptureEnvironmentRef =
    useRef<SharedLiveEnvironmentSample | null>(null);
  const lastSemanticLiveAutoCaptureAtRef = useRef(0);

  const previewDocument = selectPreviewDocumentSnapshot(editorState);
  const exportDocument = selectExportDocumentSnapshot(editorState);
  const sharedLiveCameraState = useSharedLiveCamera(false);
  const sharedCameraDeviceState = useSharedCameraDeviceState();
  const currentUser = authState.user;

  const selectedBlock = editorState.document.blocks.find((block) =>
    editorState.selection.selectedBlockIds.includes(block.id),
  );
  const selectedSemanticSlot = (editorState.document.semanticSlots ?? []).find(
    (slot) => slot.id === editorState.selection.selectedSemanticSlotId,
  );
  const resolvedContinuousAIGenerationSession =
    activeContinuousSessionRef.current == null
      ? continuousAIGenerationSession
      : {
          ...continuousAIGenerationSession,
          activeBlockId: activeContinuousSessionRef.current.activeBlockId,
          activeGenerationId:
            activeContinuousSessionRef.current.activeGenerationId ??
            continuousAIGenerationSession.activeGenerationId,
          status:
            continuousAIGenerationSession.status === "idle"
              ? activeContinuousSessionRef.current.stopController.signal.aborted
                ? "stopping"
                : "running"
              : continuousAIGenerationSession.status,
        };
  const isSemanticGenerationPending =
    orchestrationExecutionState.isRunning ||
    orchestrationExecutionState.queue.some(
      (item) => item.status === "queued" || item.status === "generating",
    );
  const semanticExportDisabledReason =
    (editorState.document.compositionMode ?? "manual") === "semantic" &&
    isSemanticGenerationPending
      ? "Wait for semantic generation to finish before exporting."
      : undefined;

  const getExportReadinessError = useCallback(() => {
    if (semanticExportDisabledReason) {
      return semanticExportDisabledReason;
    }

    if (
      (editorState.document.compositionMode ?? "manual") === "semantic" &&
      exportDocument.blocks.length === 0
    ) {
      return "No semantic output blocks are ready to export. Generate output first.";
    }

    if (
      (editorState.document.compositionMode ?? "manual") === "semantic" &&
      exportDocument.blocks.some((block) =>
        DEFAULT_TEMPLATE_EXPORT_BLOCK_IDS.has(block.id),
      )
    ) {
      return "Semantic export still contains default manual template blocks. Generate output again and check semantic slot links.";
    }

    return undefined;
  }, [
    editorState.document.compositionMode,
    exportDocument.blocks,
    semanticExportDisabledReason,
  ]);

  const setContinuousSessionSafely = (
    nextSession:
      | ContinuousAIGenerationSessionState
      | ((
          current: ContinuousAIGenerationSessionState,
        ) => ContinuousAIGenerationSessionState),
  ) => {
    if (!isMountedRef.current) {
      return;
    }

    setContinuousAIGenerationSession(nextSession);
  };

  const setOrchestrationExecutionStateSafely = (
    nextState:
      | OrchestrationExecutionState
      | ((current: OrchestrationExecutionState) => OrchestrationExecutionState),
  ) => {
    if (!isMountedRef.current) {
      return;
    }

    setOrchestrationExecutionState(nextState);
  };

  const getCurrentDocumentSnapshot = useCallback(
    () => latestDocumentRef.current,
    [],
  );

  const hasActiveOrchestrationQueueItems = (
    queue: readonly OrchestrationGenerationQueueItem[],
  ) =>
    queue.some(
      (item) => item.status === "queued" || item.status === "generating",
    );

  const createOrchestrationQueue = (
    plan: OrchestrationPlan,
  ): OrchestrationGenerationQueueItem[] => {
    const semanticSlots = getCurrentDocumentSnapshot().semanticSlots ?? [];

    return plan.imageIntents
      .filter((intent) => intent.targetBlockId)
      .sort((left, right) => right.priority - left.priority)
      .map((intent) => {
        const slot = semanticSlots.find(
          (candidate) => candidate.id === intent.targetSlotId,
        );

        return {
          id: getOrchestrationQueueItemId(
            intent.targetSlotId,
            intent.targetBlockId ?? "",
            "image",
          ),
          slotId: intent.targetSlotId,
          targetBlockId: intent.targetBlockId ?? "",
          label: slot
            ? `${getSemanticSlotKindLabel(
                inferSemanticSlotKind(slot),
              )} / ${getSemanticSlotPurposeLabel(slot.role)}`
            : intent.targetBlockId ?? intent.targetSlotId,
          mode: "image",
          status: "queued",
        };
      });
  };

  useEffect(() => {
    latestDocumentRef.current = editorState.document;
  }, [editorState.document]);

  useEffect(() => {
    setOrchestrationPreviewPlan(null);
    setOrchestrationExecutionState(createIdleOrchestrationExecutionState());
    isOrchestrationRunningRef.current = false;
    latestDocumentRef.current = editorState.document;
  }, [editorState.document.id]);

  const updateAIBlockById = (
    blockId: string,
    patch: Partial<AIGenerationBlockData>,
  ) => {
    dispatch({
      type: "editor/update-ai-data-by-id",
      blockId,
      patch,
    });
  };

  const applyAIResponse = (response: AIGenerationResponse) => {
    dispatch({
      type: "editor/apply-ai-response",
      response,
    });
  };

  const applyAIVideoResponse = (response: AIVideoGenerationResponse) => {
    dispatch({
      type: "editor/apply-ai-video-response",
      response,
    });
  };

  const setAIErrorForBlock = (blockId: string, message: string) => {
    dispatch({
      type: "editor/set-ai-error",
      blockId,
      message,
    });
  };

  const handleUpdateTextBlock = (patch: Partial<TextBlockData>) => {
    dispatch({
      type: "editor/update-selected-text-data",
      patch,
    });
  };

  const handleUpdateImageBlock = (patch: Partial<ImageBlockData>) => {
    dispatch({
      type: "editor/update-selected-image-data",
      patch,
    });
  };

  const handleSetImageSource = (payload: {
    src: string;
    fileName?: string;
    mimeType?: string;
    kind?: ImageAssetKind;
  }) => {
    dispatch({
      type: "editor/set-selected-image-source",
      ...payload,
    });
  };

  const handleUpdateAIGenerationBlock = (
    patch: Partial<AIGenerationBlockData>,
  ) => {
    dispatch({
      type: "editor/update-selected-ai-data",
      patch,
    });
  };

  const handleUpdateLiveBlock = (patch: Partial<LiveBlockData>) => {
    dispatch({
      type: "editor/update-selected-live-data",
      patch,
    });
  };

  const handleUpdateSelectedBlockAppearance = (
    patch: Partial<
      Pick<
        DesignBlock,
        "showBorder" | "rotation" | "blendMode" | "clipMode" | "filter"
      >
    >,
  ) => {
    dispatch({
      type: "editor/update-selected-block-appearance",
      patch,
    });
  };

  const handleRenameCurrentDocument = useCallback((name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    dispatch({
      type: "editor/update-document-name",
      name: trimmedName,
    });

    setDocumentPersistenceState((current) => ({
      ...current,
      recentDocuments: current.recentDocuments.map((document) =>
        document.id === editorState.document.id
          ? {
              ...document,
              name: trimmedName,
            }
          : document,
      ),
      statusTone: "neutral",
      statusMessage: `Renamed current document to ${trimmedName}.`,
    }));
  }, [editorState.document.id]);

  const markSemanticEdit = () => {
    lastSemanticEditAtRef.current = Date.now();
  };

  const handleSetCompositionMode = useCallback((mode: "manual" | "semantic") => {
    dispatch({
      type: "editor/set-composition-mode",
      mode,
    });
    markSemanticEdit();
  }, []);

  const handleUpdateSemanticBrief = useCallback(
    (patch: Partial<NonNullable<DesignDocument["semanticBrief"]>>) => {
      dispatch({
        type: "editor/update-semantic-brief",
        patch,
      });
      markSemanticEdit();
    },
    [],
  );

  const handleSelectSemanticSlot = useCallback((slotId: string) => {
    dispatch({
      type: "editor/select-semantic-slot",
      slotId,
    });
  }, []);

  const handleUpdateSemanticSlot = useCallback(
    (slotId: string, patch: Partial<SemanticSlot>) => {
      dispatch({
        type: "editor/update-semantic-slot",
        slotId,
        patch,
      });
      markSemanticEdit();
    },
    [],
  );

  const handleDeleteSemanticSlot = useCallback((slotId: string) => {
    dispatch({
      type: "editor/delete-semantic-slot",
      slotId,
    });
    markSemanticEdit();
  }, []);

  const handleToggleSemanticLiveDirection = useCallback((enabled: boolean) => {
    setSemanticLiveDirectionEnabled(enabled);
    if (!enabled) {
      setSemanticLiveAutoCaptureEnabled(false);
    } else {
      void enumerateSharedCameraDevices().catch(() => undefined);
    }
    setSemanticLiveCaptureState((current) =>
      enabled
        ? current.status === "failed"
          ? { status: "idle" }
          : current
        : { status: "idle" },
    );
  }, []);

  const handleSelectSemanticLiveCameraDevice = useCallback((deviceId?: string) => {
    setSharedCameraDevice(deviceId);
    void enumerateSharedCameraDevices().catch(() => undefined);
  }, []);

  const handleRefreshSemanticLiveCameraDevices = useCallback(async () => {
    await enumerateSharedCameraDevices();
  }, []);

  const handleUpdateSemanticLiveAutoCaptureCooldown = useCallback(
    (seconds: number) => {
      setSemanticLiveAutoCaptureCooldownSeconds(
        Math.max(
          MIN_SEMANTIC_LIVE_AUTO_CAPTURE_COOLDOWN_SECONDS,
          Math.round(seconds),
        ),
      );
    },
    [],
  );

  const updateOrchestrationQueueItem = useCallback(
    (
      itemId: string,
      patch: Partial<OrchestrationGenerationQueueItem>,
    ) => {
      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        queue: current.queue.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      }));
    },
    [],
  );

  const runOrchestrationGenerationRequest = useCallback(
    async (
      request: OrchestrationPlan["generationRequests"][number],
      queueItemId: string,
    ) => {
      if (request.mode === "video") {
        const result = await runSingleAIVideoGenerationCycle({
          aiVideoGenerationService,
          snapshot: {
            blockId: request.targetBlockId,
            mediaMode: "video",
            prompt: request.prompt,
            negativePrompt: request.negativePrompt,
            frame: request.outputHint.frame,
            generationRatioMode: request.outputHint.ratioMode,
            resultFitMode: "cover",
            matchCanvasBackground: false,
            canvasBackgroundColor: editorState.document.canvas.backgroundColor,
            durationSeconds: 3,
          },
          onQueued: () => {
            updateAIBlockById(request.targetBlockId, createQueuedAIGenerationPatch());
            updateOrchestrationQueueItem(queueItemId, {
              status: "generating",
              progress: 0,
              errorMessage: undefined,
            });
          },
          onResponse: (response) => {
            applyAIVideoResponse(response);
            updateOrchestrationQueueItem(queueItemId, {
              status:
                response.status === "completed"
                  ? "completed"
                  : response.status === "failed" || response.status === "cancelled"
                    ? "failed"
                    : "generating",
              progress: response.progress,
              errorMessage:
                response.status === "failed" || response.status === "cancelled"
                  ? response.error?.message ?? "Video generation did not finish."
                  : undefined,
            });
          },
        });

        if (!result.ok) {
          setAIErrorForBlock(request.targetBlockId, result.error.message);
          updateOrchestrationQueueItem(queueItemId, {
            status: "failed",
            errorMessage: result.error.message,
          });

          return false;
        }

        return result.data.status === "completed";
      }

      const result = await runSingleAIGenerationCycle({
        aiGenerationService,
        snapshot: {
          blockId: request.targetBlockId,
          prompt: request.prompt,
          frame: request.outputHint.frame,
          generationRatioMode: request.outputHint.ratioMode,
          resultFitMode: "cover",
          matchCanvasBackground: false,
          canvasBackgroundColor: editorState.document.canvas.backgroundColor,
          intervalMs: 8000,
        },
        onQueued: () => {
          updateAIBlockById(request.targetBlockId, createQueuedAIGenerationPatch());
          updateOrchestrationQueueItem(queueItemId, {
            status: "generating",
            progress: 0,
            errorMessage: undefined,
          });
        },
        onResponse: (response) => {
          applyAIResponse(response);
          updateOrchestrationQueueItem(queueItemId, {
            status:
              response.status === "completed"
                ? "completed"
                : response.status === "failed" || response.status === "cancelled"
                  ? "failed"
                  : "generating",
            progress: response.progress,
            errorMessage:
              response.status === "failed" || response.status === "cancelled"
                ? response.error?.message ?? "Image generation did not finish."
                : undefined,
          });
        },
      });

      if (!result.ok) {
        setAIErrorForBlock(request.targetBlockId, result.error.message);
        updateOrchestrationQueueItem(queueItemId, {
          status: "failed",
          errorMessage: result.error.message,
        });

        return false;
      }

      return result.data.status === "completed";
    },
    [editorState.document.canvas.backgroundColor, updateOrchestrationQueueItem],
  );

  const resolveImageIntentFrame = useCallback(
    (
      imageIntent: ImageIntent,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): ImageIntentFrameResolution => {
      const targetSlot = (documentSnapshot.semanticSlots ?? []).find(
        (slot) => slot.id === imageIntent.targetSlotId,
      );
      const targetBlock = documentSnapshot.blocks.find(
        (block) => block.id === imageIntent.targetBlockId,
      );

      if (targetSlot) {
        return {
          frame: targetSlot.frame,
          frameSource: "semantic-slot",
          targetSlot,
          targetBlock,
        };
      }

      if (targetBlock) {
        return {
          frame: targetBlock.frame,
          frameSource: "target-block",
          targetBlock,
        };
      }

      return {
        frame: {
          x: 0,
          y: 0,
          width: documentSnapshot.canvas.width,
          height: documentSnapshot.canvas.height,
        },
        frameSource: "fallback",
      };
    },
    [getCurrentDocumentSnapshot],
  );

  const buildLayoutContextSummary = useCallback(
    (
      imageIntent: ImageIntent,
      frameResolution: ImageIntentFrameResolution,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): LayoutContextSummary => {
      const targetFrame = frameResolution.frame;
      const targetBlock = frameResolution.targetBlock;
      const targetZIndex = targetBlock?.zIndex ?? 0;
      const targetSlot = frameResolution.targetSlot;
      const targetArea = Math.max(1, rectArea(targetFrame));
      const semanticSlots = documentSnapshot.semanticSlots ?? [];
      const neighbors: LayoutContextSummary["neighbors"] = [];
      const occupiedRegions: LayoutContextSummary["occupiedRegions"] = [];
      const avoidRegions: LayoutContextSummary["avoidRegions"] = [];

      semanticSlots.forEach((slot) => {
        if (slot.id === targetSlot?.id || slot.hidden) {
          return;
        }

        const overlapRatio = rectIntersectionArea(targetFrame, slot.frame) / targetArea;
        const relation = getLayoutRelation(targetFrame, slot.frame, targetZIndex, slot.priority);
        const isRelevant =
          relation === "overlap" ||
          relation === "adjacent" ||
          isAmbientSemanticSlot(slot) ||
          overlapRatio > 0.08;

        if (!isRelevant) {
          return;
        }

        neighbors.push({
          id: slot.id,
          role: slot.role,
          blockType: inferSlotOutputBlockType(slot),
          frame: slot.frame,
          relation,
          locked: slot.lockedByUser,
          hidden: slot.hidden,
        });

        if (isAmbientSemanticSlot(slot)) {
          occupiedRegions.push({
            sourceId: slot.id,
            sourceType: "ambient",
            frame: slot.frame,
            note: `${getSemanticSlotPurposeLabel(slot.role)} semantic field`,
          });
        }
      });

      documentSnapshot.blocks.forEach((block) => {
        if (block.id === targetBlock?.id || block.hidden) {
          return;
        }

        const relation = getLayoutRelation(
          targetFrame,
          block.frame,
          targetZIndex,
          block.zIndex,
        );
        const overlapRatio = rectIntersectionArea(targetFrame, block.frame) / targetArea;
        const isPattern = block.type === "pattern";
        const isAmbient =
          block.name.toLowerCase().includes("ambient") ||
          block.name.toLowerCase().includes("texture") ||
          block.name.toLowerCase().includes("poster texture");
        const isRelevant =
          relation === "overlap" ||
          relation === "adjacent" ||
          isPattern ||
          isAmbient ||
          overlapRatio > 0.08;

        if (!isRelevant) {
          return;
        }

        neighbors.push({
          id: block.id,
          role: isPattern ? "decorative pattern" : undefined,
          blockType: block.type,
          frame: block.frame,
          relation,
          locked: block.locked,
          hidden: block.hidden,
        });

        if (isPattern || isAmbient || relation === "overlap") {
          const patternNote =
            block.type === "pattern"
              ? `${block.data.patternType} pattern field`
              : `${block.type} visual layer`;

          occupiedRegions.push({
            sourceId: block.id,
            sourceType: isAmbient && !isPattern
              ? "ambient"
              : getOccupiedRegionSourceType(block),
            frame: block.frame,
            note: `${patternNote}; z-index ${block.zIndex}`,
          });
        }
      });

      occupiedRegions.forEach((region) => {
        const overlapsTarget = rectsOverlap(targetFrame, region.frame);
        const isPatternLike =
          region.sourceType === "pattern" || region.sourceType === "ambient";

        if (!overlapsTarget && !isPatternLike) {
          return;
        }

        avoidRegions.push({
          frame: region.frame,
          reason:
            region.sourceType === "pattern"
              ? `Avoid duplicating dense decorative texture from ${region.sourceId}.`
              : `Keep focal content clear of neighboring ${region.sourceType} field ${region.sourceId}.`,
        });
      });

      return {
        targetSlot: targetSlot
          ? {
              id: targetSlot.id,
              role: targetSlot.role,
              frame: targetSlot.frame,
              contentType: targetSlot.contentType,
            }
          : undefined,
        neighbors: neighbors.slice(0, 12),
        occupiedRegions: occupiedRegions.slice(0, 10),
        avoidRegions: avoidRegions.slice(0, 8),
      };
    },
    [getCurrentDocumentSnapshot],
  );

  const resolveMediaGenerationSpec = useCallback(
    (
      plan: OrchestrationPlan,
      imageIntent: ImageIntent,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): MediaGenerationSpec | null => {
      if (!imageIntent.targetBlockId) {
        return null;
      }

      const frameResolution = resolveImageIntentFrame(imageIntent, documentSnapshot);
      const frame = frameResolution.frame;

      if (!frame) {
        return null;
      }

      const plannedSpec = plan.mediaGenerationSpecs?.find(
        (candidate) =>
          candidate.intentId === imageIntent.id ||
          candidate.imageIntent?.id === imageIntent.id ||
          (candidate.targetSlotId === imageIntent.targetSlotId &&
            candidate.targetBlockId === imageIntent.targetBlockId),
      );

      return {
        ...(plannedSpec ?? {
          id: `media_spec_${imageIntent.id}`,
          targetSlotId: imageIntent.targetSlotId,
          priority: imageIntent.priority,
        }),
        targetSlotId: imageIntent.targetSlotId,
        targetBlockId: imageIntent.targetBlockId,
        mediaType: "image",
        imageIntent: plannedSpec?.imageIntent ?? imageIntent,
        outputSize: deriveAIGenerationOutputSize({
          frame,
          generationRatioMode: "follow-block",
        }),
        metadata: {
          ...(plannedSpec?.metadata ?? {}),
          frameSource: frameResolution.frameSource,
          layoutContext: buildLayoutContextSummary(
            imageIntent,
            frameResolution,
            documentSnapshot,
          ),
        },
        priority: plannedSpec?.priority ?? imageIntent.priority,
      };
    },
    [buildLayoutContextSummary, getCurrentDocumentSnapshot, resolveImageIntentFrame],
  );

  const applySuccessfulGenerationJob = useCallback((
    job: GenerationJob,
    expectedLiveCaptureId?: string,
  ) => {
    if (
      expectedLiveCaptureId &&
      latestLiveCaptureIdRef.current !== expectedLiveCaptureId
    ) {
      return;
    }

    if (!job.targetBlockId || !job.resultUrl) {
      return;
    }

    updateAIBlockById(job.targetBlockId, {
      status: "completed",
      mediaMode: "image",
      provider: job.provider,
      generationId: job.providerGenerationId ?? job.id,
      resultAssetId: job.resultAssetId,
      resultImageUrl: job.resultUrl,
      resultPreviewUrl: job.resultUrl,
      resultMimeType: job.resultMimeType,
      generationProgress: 100,
      errorMessage: undefined,
    });
  }, []);

  const pollGenerationJob = useCallback(
    async (
      jobId: string,
      queueItemId: string,
      expectedLiveCaptureId?: string,
    ) => {
      let runningPollAttempts = 0;
      let pendingPollAttempts = 0;

      while (isMountedRef.current) {
        if (!isMountedRef.current) {
          return false;
        }

        const job = await backendGenerationJobService.getGenerationJob(jobId);
        if (job.status === "running") {
          runningPollAttempts += 1;
          pendingPollAttempts = 0;
        }
        if (job.status === "pending") {
          pendingPollAttempts += 1;
        }
        const progress =
          job.status === "success"
            ? 100
            : typeof job.progress === "number"
              ? job.progress
              : undefined;

        updateOrchestrationQueueItem(queueItemId, {
          generationJobId: job.id,
          status:
            job.status === "success"
              ? "completed"
              : job.status === "error"
                ? "failed"
                : job.status === "pending"
                  ? "queued"
                  : "generating",
          progress,
          errorMessage:
            job.status === "pending"
              ? pendingPollAttempts > 6
                ? "Waiting for the backend image worker. If another image is running, this will start next."
                : "Waiting in backend queue..."
              : job.status === "running" &&
                  runningPollAttempts >= GENERATION_JOB_RUNNING_NOTICE_ATTEMPTS
                ? "Still generating. Reference-guided images can take several minutes."
                : job.error,
          warnings: job.warnings,
        });

        if (job.status === "success") {
          applySuccessfulGenerationJob(job, expectedLiveCaptureId);
          return true;
        }

        if (job.status === "error") {
          if (job.targetBlockId) {
            setAIErrorForBlock(job.targetBlockId, job.error ?? "Generation job failed.");
          }
          return false;
        }

        await wait(GENERATION_JOB_POLL_INTERVAL_MS);
      }

      return false;
    },
    [applySuccessfulGenerationJob, updateOrchestrationQueueItem],
  );

  const runOrchestrationImageIntentJob = useCallback(
    async (
      plan: OrchestrationPlan,
      imageIntent: ImageIntent,
      queueItemId: string,
      options?: {
        transientReferenceAssets?: CreateGenerationJobRequest["transientReferenceAssets"];
        liveCaptureId?: string;
        fuseCapturedPortrait?: boolean;
      },
    ) => {
      if (!imageIntent.targetBlockId) {
        updateOrchestrationQueueItem(queueItemId, {
          status: "failed",
          errorMessage: "Image intent did not include a target AI block.",
        });
        return false;
      }

      const mediaGenerationSpec = resolveMediaGenerationSpec(plan, imageIntent);

      if (!mediaGenerationSpec) {
        updateOrchestrationQueueItem(queueItemId, {
          status: "failed",
          errorMessage: "Image intent did not resolve to a slot or block frame.",
        });
        return false;
      }

      try {
        updateAIBlockById(imageIntent.targetBlockId, createQueuedAIGenerationPatch());
        updateOrchestrationQueueItem(queueItemId, {
          status: "queued",
          progress: 0,
          errorMessage: undefined,
        });

        const job = await backendGenerationJobService.createGenerationJob({
          mediaGenerationSpec,
          providerHint: mediaGenerationSpec.providerHint,
          targetBlockId: imageIntent.targetBlockId,
          documentId: editorState.document.id,
          slotId: imageIntent.targetSlotId,
          semanticBrief: editorState.document.semanticBrief,
          visualStyleProfiles: activeVisualStyleProfiles,
          transientReferenceAssets: options?.transientReferenceAssets,
          liveCaptureId: options?.liveCaptureId,
          fuseCapturedPortrait: options?.fuseCapturedPortrait === true,
        });

        updateOrchestrationQueueItem(queueItemId, {
          generationJobId: job.id,
          status: job.status === "pending" ? "queued" : "generating",
          progress: job.progress ?? 0,
        });

        return await pollGenerationJob(
          job.id,
          queueItemId,
          options?.liveCaptureId,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to submit generation job.";
        setAIErrorForBlock(imageIntent.targetBlockId, message);
        updateOrchestrationQueueItem(queueItemId, {
          status: "failed",
          errorMessage: message,
        });
        return false;
      }
    },
    [
      activeVisualStyleProfiles,
      editorState.document.id,
      editorState.document.semanticBrief,
      pollGenerationJob,
      resolveMediaGenerationSpec,
      updateOrchestrationQueueItem,
    ],
  );

  const buildSemanticLiveContext = useCallback((
    captureState = semanticLiveCaptureState,
    options?: {
      notes?: string;
    },
  ): LiveSemanticContext => {
    const snapshot =
      (captureState.status === "captured" ||
        captureState.status === "directing" ||
        captureState.status === "applying" ||
        captureState.status === "regenerating" ||
        captureState.status === "applied")
        ? {
            dataUrl: captureState.dataUrl,
            width: captureState.width,
            height: captureState.height,
            mimeType: captureState.mimeType,
            capturedAt: captureState.capturedAt,
            frame: captureState.frame ?? null,
          }
        : undefined;

    return {
      enabled: semanticLiveDirectionEnabled,
      snapshot,
      notes: options?.notes,
      allowImageRegeneration: semanticLiveImageRegenerationEnabled,
      liveCaptureId: captureState.liveCaptureId,
      fuseCapturedPortrait:
        semanticLiveImageRegenerationEnabled &&
        semanticLivePortraitFusionEnabled,
    };
  }, [
    semanticLiveCaptureState,
    semanticLiveDirectionEnabled,
    semanticLiveImageRegenerationEnabled,
    semanticLivePortraitFusionEnabled,
  ]);

  const createLiveImageQueue = useCallback(
    (
      plan: OrchestrationPlan,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): OrchestrationGenerationQueueItem[] =>
      plan.imageIntents
        .filter((intent) => intent.targetBlockId)
        .sort((left, right) => right.priority - left.priority)
        .map((intent) => {
          const slot = (documentSnapshot.semanticSlots ?? []).find(
            (candidate) => candidate.id === intent.targetSlotId,
          );

          return {
            id: getOrchestrationQueueItemId(
              intent.targetSlotId,
              intent.targetBlockId ?? "",
              "image",
            ),
            slotId: intent.targetSlotId,
            targetBlockId: intent.targetBlockId ?? "",
            label: slot
              ? `Live Image / ${getSemanticSlotPurposeLabel(slot.role)}`
              : intent.targetBlockId ?? intent.targetSlotId,
            mode: "image",
            status: "queued",
          };
        }),
    [getCurrentDocumentSnapshot],
  );

  const buildLiveRegenerationReferences = useCallback(
    async (
      blockId: string,
      liveContext: LiveSemanticContext,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): Promise<CreateGenerationJobRequest["transientReferenceAssets"]> => {
      const references: NonNullable<
        CreateGenerationJobRequest["transientReferenceAssets"]
      > = [];

      if (
        liveContext.fuseCapturedPortrait === true &&
        liveContext.snapshot?.dataUrl
      ) {
        references.push({
          url: liveContext.snapshot.dataUrl,
          mimeType: liveContext.snapshot.mimeType ?? "image/jpeg",
          role: "live-capture",
        });
      }

      const block = documentSnapshot.blocks.find(
        (candidate) => candidate.id === blockId && candidate.type === "ai-generation",
      );
      const previousImageUrl =
        block?.type === "ai-generation"
          ? block.data.resultImageUrl ?? block.data.resultPreviewUrl
          : undefined;

      if (previousImageUrl && block?.type === "ai-generation") {
        if (isExhibitionMode) {
          return references;
        }

        try {
          references.push({
            assetId: block.data.resultAssetId,
            url: await loadReferenceUrlAsDataUrl(previousImageUrl),
            mimeType: block.data.resultMimeType ?? "image/png",
            role: "previous-ai-result",
          });
        } catch {
          references.push({
            assetId: block.data.resultAssetId,
            url: previousImageUrl,
            mimeType: block.data.resultMimeType ?? "image/png",
            role: "previous-ai-result",
          });
        }
      }

      return references;
    },
    [getCurrentDocumentSnapshot, isExhibitionMode],
  );

  const deriveFallbackLiveImageIntents = useCallback(
    (
      plan: OrchestrationPlan,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ): ImageIntent[] => {
      const existingTargetSlotIds = new Set(
        plan.imageIntents.map((intent) => intent.targetSlotId),
      );

      return (documentSnapshot.semanticSlots ?? [])
        .filter((slot) => !slot.hidden)
        .filter((slot) => inferSemanticSlotKind(slot) === "ai-image")
        .filter((slot) => !existingTargetSlotIds.has(slot.id))
        .map((slot) => {
          const targetBlockId = (slot.linkedBlockIds ?? []).find((blockId) => {
            const block = documentSnapshot.blocks.find(
              (candidate) => candidate.id === blockId,
            );

            return (
              block?.type === "ai-generation" &&
              !block.locked &&
              (block.data.mediaMode ?? "image") === "image"
            );
          });

          if (!targetBlockId) {
            return null;
          }

          return {
            id: `live_fallback_${slot.id}`,
            targetSlotId: slot.id,
            targetBlockId,
            subject: slot.content?.trim() || slot.name || "Campaign visual",
            mood:
              plan.liveArtDirection?.summary ??
              "Live-responsive campaign visual",
            composition: "Use the existing semantic slot frame.",
            colorIntent:
              plan.liveArtDirection?.colorStrategy ??
              "Adapt the current campaign color mood to the live moment.",
            styleHint:
              plan.liveArtDirection?.imageRegenerationStrategy ??
              "Preserve the original campaign role while refreshing the visual from the live moment.",
            abstractionLevel: "stylized",
            priority: Math.max(1, 100 - slot.priority),
            avoid: [],
            referenceIds: [],
          } satisfies ImageIntent;
        })
        .filter((intent): intent is NonNullable<typeof intent> => Boolean(intent))
        .sort((left, right) => right.priority - left.priority);
    },
    [getCurrentDocumentSnapshot],
  );

  const runLiveImageRegeneration = useCallback(
    async (
      plan: OrchestrationPlan,
      liveContext: LiveSemanticContext,
      captureState: SemanticLiveCaptureState,
      documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
    ) => {
      const liveCaptureId = liveContext.liveCaptureId;
      const fallbackIntents = deriveFallbackLiveImageIntents(
        plan,
        documentSnapshot,
      );
      const resolvedImageIntents =
        plan.imageIntents.length > 0
          ? [
              ...plan.imageIntents,
              ...fallbackIntents.filter(
                (fallbackIntent) =>
                  !plan.imageIntents.some(
                    (intent) => intent.targetSlotId === fallbackIntent.targetSlotId,
                  ),
              ),
            ]
          : fallbackIntents;
      const eligibleIntents = resolvedImageIntents
        .filter((intent) => {
          if (!intent.targetBlockId) {
            return false;
          }

          const block = documentSnapshot.blocks.find(
            (candidate) => candidate.id === intent.targetBlockId,
          );

          return (
            block?.type === "ai-generation" &&
            !block.locked &&
            (block.data.mediaMode ?? "image") === "image"
          );
        })
        .sort((left, right) => right.priority - left.priority);
      const skippedLockedCount =
        resolvedImageIntents.filter((intent) => {
          const block = intent.targetBlockId
            ? documentSnapshot.blocks.find(
                (candidate) => candidate.id === intent.targetBlockId,
              )
            : undefined;

          return block?.locked;
        }).length ||
        (documentSnapshot.semanticSlots ?? []).filter((slot) => {
          const slotKind = inferSemanticSlotKind(slot);

          return (
            slotKind === "ai-image" &&
            (slot.linkedBlockIds ?? []).some((blockId) => {
              const block = documentSnapshot.blocks.find(
                (candidate) => candidate.id === blockId,
              );

              return (
                block?.type === "ai-generation" &&
                block.locked &&
                (block.data.mediaMode ?? "image") === "image"
              );
            })
          );
        }).length;

      if (eligibleIntents.length === 0) {
        const hasAnyAiTargets = (documentSnapshot.semanticSlots ?? []).some((slot) => {
          if (slot.hidden || inferSemanticSlotKind(slot) !== "ai-image") {
            return false;
          }

          return (slot.linkedBlockIds ?? []).some((blockId) => {
            const block = documentSnapshot.blocks.find(
              (candidate) => candidate.id === blockId,
            );

            return (
              block?.type === "ai-generation" &&
              (block.data.mediaMode ?? "image") === "image"
            );
          });
        });
        const warning = skippedLockedCount > 0
          ? "Locked AI image block skipped."
          : hasAnyAiTargets
            ? "Live mappings applied, but AI image regeneration could not resolve a usable target."
            : "Live mappings applied; no AI image targets were available for regeneration.";
        setSemanticLiveCaptureState({
          ...captureState,
          status: "applied",
          liveDirectionSummary:
            plan.liveArtDirection?.summary ?? "Live mappings applied.",
          liveDirectionWarnings: uniqueStrings([
            ...(captureState.liveDirectionWarnings ?? []),
            warning,
          ]),
        });
        setOrchestrationExecutionStateSafely((current) => ({
          ...current,
          phase: "completed",
          isRunning: false,
          summary: hasAnyAiTargets
            ? "Live mappings applied, regeneration skipped."
            : "Live mappings applied; no AI image targets were available for regeneration.",
          warnings: uniqueStrings([...current.warnings, warning]),
        }));
        return;
      }

      const queue = createLiveImageQueue({
        ...plan,
        imageIntents: eligibleIntents,
      }, documentSnapshot);
      const jobResults: boolean[] = [];

      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: "generating-images",
        isRunning: true,
        summary: `Generating live image 0/${eligibleIntents.length}.`,
        queue,
      }));
      setSemanticLiveCaptureState({
        ...captureState,
        status: "regenerating",
        liveDirectionSummary:
          plan.liveArtDirection?.imageRegenerationStrategy ??
          plan.liveArtDirection?.summary ??
          "Generating live-responsive AI image updates.",
      });

      for (const [index, imageIntent] of eligibleIntents.entries()) {
        if (
          liveCaptureId &&
          latestLiveCaptureIdRef.current !== liveCaptureId
        ) {
          return;
        }

        const queueItemId = getOrchestrationQueueItemId(
          imageIntent.targetSlotId,
          imageIntent.targetBlockId ?? "",
          "image",
        );
        setOrchestrationExecutionStateSafely((current) => ({
          ...current,
          summary: `Generating live image ${index + 1}/${eligibleIntents.length}.`,
        }));

        const transientReferenceAssets = imageIntent.targetBlockId
          ? await buildLiveRegenerationReferences(
              imageIntent.targetBlockId,
              liveContext,
              documentSnapshot,
            )
          : undefined;
        const mediaGenerationSpec = resolveMediaGenerationSpec(
          plan,
          imageIntent,
          documentSnapshot,
        );
        const planWithLiveSpec = mediaGenerationSpec
          ? {
              ...plan,
              mediaGenerationSpecs: [
                ...(plan.mediaGenerationSpecs ?? []).filter(
                  (spec) =>
                    spec.intentId !== imageIntent.id &&
                    spec.imageIntent?.id !== imageIntent.id,
                ),
                {
                  ...mediaGenerationSpec,
                  metadata: {
                    ...(mediaGenerationSpec.metadata ?? {}),
                    liveCaptureId,
                    fuseCapturedPortrait:
                      liveContext.fuseCapturedPortrait === true,
                    liveFrame: liveContext.snapshot?.frame ?? undefined,
                    imageRegenerationStrategy:
                      plan.liveArtDirection?.imageRegenerationStrategy,
                  },
                },
              ],
            }
          : plan;

        const didComplete = await runOrchestrationImageIntentJob(
          planWithLiveSpec,
          imageIntent,
          queueItemId,
          {
            transientReferenceAssets,
            liveCaptureId,
            fuseCapturedPortrait: liveContext.fuseCapturedPortrait === true,
          },
        );
        jobResults.push(didComplete);
      }

      if (
        liveCaptureId &&
        latestLiveCaptureIdRef.current !== liveCaptureId
      ) {
        return;
      }

      const failedCount = jobResults.filter((didComplete) => !didComplete).length;
      setSemanticLiveCaptureState({
        ...captureState,
        status: failedCount > 0 ? "failed" : "applied",
        liveDirectionSummary:
          failedCount > 0
            ? "Live mappings applied, but some live images failed."
            : "Generated image updated.",
        liveDirectionWarnings: uniqueStrings([
          ...(captureState.liveDirectionWarnings ?? []),
          ...(failedCount > 0
            ? [`${failedCount} live image regeneration job(s) failed.`]
            : []),
        ]),
      });
      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: failedCount > 0 ? "failed" : "completed",
        isRunning: false,
        summary:
          failedCount > 0
            ? "Live mappings applied, but some generated media failed."
            : "Generated image updated.",
        errorMessage:
          failedCount > 0
            ? "One or more live image regeneration jobs failed."
            : undefined,
        warnings: uniqueStrings([
          ...current.warnings,
          ...(failedCount > 0
            ? [`${failedCount} live image regeneration job(s) failed.`]
            : []),
        ]),
      }));
    },
    [
      deriveFallbackLiveImageIntents,
      buildLiveRegenerationReferences,
      createLiveImageQueue,
      getCurrentDocumentSnapshot,
      resolveMediaGenerationSpec,
      runOrchestrationImageIntentJob,
    ],
  );

  const runSemanticLiveDirection = useCallback(async (
    liveContext: LiveSemanticContext,
    captureState: SemanticLiveCaptureState,
    documentSnapshot: DesignDocument = getCurrentDocumentSnapshot(),
  ) => {
    if (!semanticLiveDirectionEnabled) {
      setSemanticLiveCaptureState({
        ...captureState,
        status: "failed",
        errorMessage: "Enable Semantic Live Direction before capturing a live moment.",
      });
      return;
    }

    if (isOrchestrationRunningRef.current) {
      return;
    }

    isOrchestrationRunningRef.current = true;
    setSemanticLiveCaptureState({
      ...captureState,
      status: "directing",
      errorMessage: undefined,
      liveDirectionSummary: undefined,
      liveDirectionWarnings: undefined,
    });
    setOrchestrationExecutionState({
      ...createIdleOrchestrationExecutionState(),
      isRunning: true,
      phase: "planning-layout",
      summary: "Directing live response from the shared camera context.",
    });

    try {
      const previousLiveMappingPatches =
        semanticLiveCaptureState.liveMappingPatches ?? [];
      const response =
        await backendOrchestrationService.generateLiveDirectionPlan(
          documentSnapshot,
          liveContext,
          undefined,
          activeAgentProfile ?? undefined,
          activeVisualStyleProfiles,
        );
      const liveMappingPatches = response.plan.liveMappingPatches ?? [];

      setSemanticLiveCaptureState({
        ...captureState,
        status: "applying",
        liveArtDirection: response.plan.liveArtDirection,
        liveMappingPatches,
        liveDirectionSummary:
          response.plan.liveArtDirection?.summary ??
          response.plan.summary ??
          "Applying live mappings.",
      });

      dispatch({
        type: "editor/apply-live-mapping-patches",
        patches: liveMappingPatches,
        replaceExisting: true,
        forceReplaceExistingSemanticLiveRules: true,
        liveCaptureId: captureState.liveCaptureId,
        previousPatches: previousLiveMappingPatches,
      });

      setOrchestrationPreviewPlan(response.plan);
      const warnings = uniqueStrings([
        ...(response.plan.liveArtDirection?.warnings ?? []),
        ...(response.plan.warnings ?? []),
        ...(response.warnings ?? []),
      ]);
      const nextCaptureState: SemanticLiveCaptureState = {
        ...captureState,
        status: "applied",
        liveArtDirection: response.plan.liveArtDirection,
        liveMappingPatches,
        liveDirectionSummary:
          response.plan.liveArtDirection?.summary ??
          response.plan.summary ??
          "Live mappings applied.",
        liveDirectionWarnings: warnings,
      };

      if (semanticLiveImageRegenerationEnabled) {
        setOrchestrationExecutionState((current) => ({
          ...current,
          phase: "generating-images",
          isRunning: true,
          summary: "Live mappings applied. Preparing live image regeneration.",
          warnings,
        }));
        await runLiveImageRegeneration(
          response.plan,
          liveContext,
          nextCaptureState,
          documentSnapshot,
        );
      } else {
        setOrchestrationExecutionState({
          ...createIdleOrchestrationExecutionState(),
          phase: "completed",
          summary: "Live mappings applied.",
          warnings,
        });
        setSemanticLiveCaptureState(nextCaptureState);
      }
    } catch (error) {
      setOrchestrationExecutionState({
        ...createIdleOrchestrationExecutionState(),
        phase: "failed",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to generate live direction.",
      });
      setSemanticLiveCaptureState({
        ...captureState,
        status: "failed",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to generate live direction.",
      });
    } finally {
      isOrchestrationRunningRef.current = false;
    }
  }, [
    activeAgentProfile,
    activeVisualStyleProfiles,
    getCurrentDocumentSnapshot,
    runLiveImageRegeneration,
    semanticLiveCaptureState.liveMappingPatches,
    semanticLiveDirectionEnabled,
    semanticLiveImageRegenerationEnabled,
  ]);

  const handleCaptureSemanticLiveMoment = useCallback(async (options?: {
    autoCaptureReason?: string;
    exhibitionAudience?: ExhibitionAudienceInput;
  }) => {
    const liveCaptureId = createLiveCaptureId();
    latestLiveCaptureIdRef.current = liveCaptureId;
    lastSemanticLiveAutoCaptureAtRef.current = Date.now();
    const exhibitionNotes = buildExhibitionLiveNotes(options?.exhibitionAudience);
    setSemanticLiveCaptureState({
      status: "capturing",
      liveCaptureId,
      autoCaptureReason: options?.autoCaptureReason,
    });

    try {
      await waitForSharedCameraReady(15000);
      const capture = await captureSharedLiveMoment();
      const synchronizedDocument = createSemanticFrameSynchronizedDocument(
        latestDocumentRef.current,
      );
      latestDocumentRef.current = synchronizedDocument;
      dispatch({
        type: "editor/sync-semantic-output-block-frames",
      });
      const captureState: SemanticLiveCaptureState = {
        status: "captured",
        liveCaptureId,
        capturedAt: new Date().toISOString(),
        dataUrl: capture.dataUrl,
        width: capture.width,
        height: capture.height,
        mimeType: capture.mimeType,
        frame: capture.frame,
        autoCaptureReason: options?.autoCaptureReason,
      };
      const liveContext = buildSemanticLiveContext(captureState, {
        notes: exhibitionNotes,
      });

      await runSemanticLiveDirection(
        liveContext,
        captureState,
        synchronizedDocument,
      );
    } catch (error) {
      setSemanticLiveCaptureState({
        status: "failed",
        liveCaptureId,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Could not capture the shared live moment.",
      });
    }
  }, [buildSemanticLiveContext, runSemanticLiveDirection]);

  useEffect(() => {
    latestSharedLiveFrameRef.current = sharedLiveCameraState.frame;
  }, [sharedLiveCameraState.frame]);

  useEffect(() => {
    if (!semanticLiveDirectionEnabled) {
      return;
    }

    void enumerateSharedCameraDevices().catch(() => undefined);
  }, [semanticLiveDirectionEnabled]);

  useEffect(() => {
    if (
      !semanticLiveDirectionEnabled ||
      !semanticLiveAutoCaptureEnabled ||
      (editorState.document.compositionMode ?? "manual") !== "semantic"
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (sharedLiveCameraState.status !== "streaming") {
        return;
      }

      const isBusy =
        semanticLiveCaptureState.status === "capturing" ||
        semanticLiveCaptureState.status === "directing" ||
        semanticLiveCaptureState.status === "applying" ||
        semanticLiveCaptureState.status === "regenerating" ||
        orchestrationExecutionState.isRunning ||
        isOrchestrationRunningRef.current ||
        isSemanticGenerationPending;

      const currentFrame = latestSharedLiveFrameRef.current;
      const currentEnvironment = sampleSharedLiveEnvironment();

      if (isBusy) {
        previousAutoCaptureFrameRef.current = currentFrame;
        previousAutoCaptureEnvironmentRef.current = currentEnvironment;
        return;
      }

      const reason = getSemanticLiveAutoCaptureReason({
        currentFrame,
        previousFrame: previousAutoCaptureFrameRef.current,
        currentEnvironment,
        previousEnvironment: previousAutoCaptureEnvironmentRef.current,
        sensitivity: semanticLiveAutoCaptureSensitivity,
      });
      previousAutoCaptureFrameRef.current = currentFrame;
      previousAutoCaptureEnvironmentRef.current = currentEnvironment;

      if (!reason) {
        return;
      }

      const now = Date.now();
      const cooldownMs =
        Math.max(
          MIN_SEMANTIC_LIVE_AUTO_CAPTURE_COOLDOWN_SECONDS,
          semanticLiveAutoCaptureCooldownSeconds,
        ) * 1000;

      if (now - lastSemanticLiveAutoCaptureAtRef.current < cooldownMs) {
        return;
      }

      lastSemanticLiveAutoCaptureAtRef.current = now;
      setSemanticLiveAutoCaptureLastReason(reason);
      void handleCaptureSemanticLiveMoment({
        autoCaptureReason: reason,
      });
    }, SEMANTIC_LIVE_AUTO_CAPTURE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    editorState.document.compositionMode,
    handleCaptureSemanticLiveMoment,
    isSemanticGenerationPending,
    orchestrationExecutionState.isRunning,
    semanticLiveAutoCaptureCooldownSeconds,
    semanticLiveAutoCaptureEnabled,
    semanticLiveAutoCaptureSensitivity,
    semanticLiveCaptureState.status,
    semanticLiveDirectionEnabled,
    sharedLiveCameraState.status,
  ]);

  const handleReapplySemanticLiveDirection = useCallback(async () => {
    const patches = semanticLiveCaptureState.liveMappingPatches ?? [];

    if (patches.length === 0) {
      return;
    }

    dispatch({
      type: "editor/apply-live-mapping-patches",
      patches,
      replaceExisting: true,
      forceReplaceExistingSemanticLiveRules: true,
      liveCaptureId: semanticLiveCaptureState.liveCaptureId,
      previousPatches: patches,
    });
    setSemanticLiveCaptureState((current) => ({
      ...current,
      status: "applied",
      liveDirectionSummary: "Live mappings reapplied.",
      liveDirectionWarnings: current.liveDirectionWarnings,
    }));
    setOrchestrationExecutionState({
      ...createIdleOrchestrationExecutionState(),
      phase: "completed",
      summary: "Live mappings reapplied.",
      warnings: semanticLiveCaptureState.liveDirectionWarnings ?? [],
    });
  }, [semanticLiveCaptureState]);

  const applyOrchestrationPlan = useCallback(
    async (plan: OrchestrationPlan) => {
      dispatch({
        type: "editor/apply-orchestration-plan",
        plan,
      });
      dispatch({
        type: "editor/set-orchestration-state",
        patch: {
          lastAppliedPlanId: plan.planId,
          lastSummary: plan.summary,
          lastError: undefined,
        },
      });
      setOrchestrationPreviewPlan(plan);
    },
    [],
  );

  const handleApplyLayoutRemix = useCallback(() => {
    const patches = orchestrationPreviewPlan?.layoutPatches ?? [];
    const remixWarnings = orchestrationPreviewPlan?.remixSummary?.warnings ?? [];

    if (patches.length === 0) {
      return;
    }

    dispatch({
      type: "editor/apply-layout-patches",
      patches,
    });

    setOrchestrationPreviewPlan((currentPlan) => {
      if (!currentPlan) {
        return currentPlan;
      }

      return {
        ...currentPlan,
        remixSummary: {
          mode: "applied",
          warnings: currentPlan.remixSummary?.warnings ?? [],
        },
        layoutPatches: [],
      };
    });
    setOrchestrationExecutionStateSafely((current) => {
      const nextWarnings = uniqueStrings([...current.warnings, ...remixWarnings]);

      if (hasActiveOrchestrationQueueItems(current.queue)) {
        return {
          ...current,
          summary: "Layout remix applied. Image generation continues.",
          warnings: nextWarnings,
          completedAt: undefined,
        };
      }

      return {
        ...createIdleOrchestrationExecutionState(),
        phase: "completed",
        summary: "Layout remix applied.",
        warnings: nextWarnings,
      };
    });
  }, [orchestrationPreviewPlan]);

  const handleDismissLayoutRemix = useCallback(() => {
    if (!orchestrationPreviewPlan) {
      return;
    }

    setOrchestrationPreviewPlan((currentPlan) => {
      if (!currentPlan) {
        return currentPlan;
      }

      return {
        ...currentPlan,
        remixSummary: {
          mode: "none",
          warnings: currentPlan.remixSummary?.warnings ?? [],
        },
        layoutPatches: [],
      };
    });
  }, [orchestrationPreviewPlan]);

  const handleApplyDecorativeOps = useCallback((opIds?: string[]) => {
    const ops = orchestrationPreviewPlan?.decorativeOps ?? [];
    const selectedOps = opIds?.length
      ? ops.filter((op) => opIds.includes(op.id))
      : ops;

    if (selectedOps.length === 0) {
      return;
    }

    dispatch({
      type: "editor/apply-decorative-ops",
      ops: selectedOps,
    });
    setOrchestrationPreviewPlan((currentPlan) => {
      if (!currentPlan) {
        return currentPlan;
      }

      const appliedIds = new Set(selectedOps.map((op) => op.id));
      return {
        ...currentPlan,
        decorativeOps: (currentPlan.decorativeOps ?? []).filter(
          (op) => !appliedIds.has(op.id),
        ),
      };
    });
    setOrchestrationExecutionStateSafely({
      ...createIdleOrchestrationExecutionState(),
      phase: "completed",
      summary: "Decorative poster operations applied.",
      warnings: [],
    });
  }, [orchestrationPreviewPlan]);

  const handleDismissDecorativeOps = useCallback(() => {
    setOrchestrationPreviewPlan((currentPlan) =>
      currentPlan
        ? {
            ...currentPlan,
            decorativeOps: [],
          }
        : currentPlan,
    );
  }, []);

  const executeAppliedOrchestrationPlan = useCallback(
    async (plan: OrchestrationPlan, inheritedWarnings: string[] = []) => {
      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: "applying-layout",
        summary: plan.summary,
        warnings: inheritedWarnings,
      }));

      await applyOrchestrationPlan(plan);

      const queue = createOrchestrationQueue(plan);

      if (queue.length === 0) {
        const completedAt = new Date().toISOString();
        setOrchestrationExecutionStateSafely({
          phase: "completed",
          isRunning: false,
          summary: "Layout applied. No image generation was required.",
          warnings: inheritedWarnings,
          queue: [],
          startedAt: completedAt,
          completedAt,
        });
        dispatch({
          type: "editor/set-orchestration-state",
          patch: {
            isRunning: false,
            lastRunAt: completedAt,
            lastSummary: plan.summary,
            lastError: undefined,
            autoRefreshIntervalMs:
              plan.refreshPolicy?.recommendedIntervalMs ??
              editorState.document.orchestrationState?.autoRefreshIntervalMs,
          },
        });
        return;
      }

      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: "generating-images",
        summary: "Generating image from compiled prompt...",
        warnings: inheritedWarnings,
        queue,
      }));

      const imageIntentsWithTargets = plan.imageIntents
        .filter((intent) => intent.targetBlockId)
        .sort((left, right) => right.priority - left.priority);
      const jobResults: boolean[] = [];

      for (const imageIntent of imageIntentsWithTargets) {
        const queueItemId = getOrchestrationQueueItemId(
          imageIntent.targetSlotId,
          imageIntent.targetBlockId ?? "",
          "image",
        );

        const didComplete = await runOrchestrationImageIntentJob(
          plan,
          imageIntent,
          queueItemId,
        );
        jobResults.push(didComplete);
      }
      const failedCount = jobResults.filter((didComplete) => !didComplete).length;

      const completedAt = new Date().toISOString();
      const executionWarnings = uniqueStrings([
        ...inheritedWarnings,
        ...(failedCount > 0
          ? [`${failedCount} media generation request(s) did not complete successfully.`]
          : []),
      ]);
      const didFail = failedCount > 0;

      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: didFail ? "failed" : "completed",
        isRunning: false,
        summary: didFail
          ? "Layout applied, but some generated media failed."
          : "Layout applied and media generation completed.",
        errorMessage: didFail
          ? "One or more generated media requests failed."
          : undefined,
        warnings: executionWarnings,
        completedAt,
      }));
      dispatch({
        type: "editor/set-orchestration-state",
        patch: {
          isRunning: false,
          lastRunAt: completedAt,
          lastSummary: plan.summary,
          lastError: didFail
            ? "One or more generated media requests failed."
            : undefined,
          autoRefreshIntervalMs:
            plan.refreshPolicy?.recommendedIntervalMs ??
            editorState.document.orchestrationState?.autoRefreshIntervalMs,
        },
      });
    },
    [
      applyOrchestrationPlan,
      createOrchestrationQueue,
      editorState.document.orchestrationState?.autoRefreshIntervalMs,
      runOrchestrationImageIntentJob,
    ],
  );

  const runOrchestration = useCallback(
    async (
      runMode: "plan" | "refresh",
      scope: OrchestrationSlotScope = "all",
    ) => {
      if (isOrchestrationRunningRef.current) {
        return;
      }

      isOrchestrationRunningRef.current = true;
      dispatch({
        type: "editor/set-orchestration-state",
        patch: {
          isRunning: true,
          lastError: undefined,
        },
      });
      setOrchestrationExecutionStateSafely({
        phase: "planning-layout",
        isRunning: true,
        summary: "Planning semantic layout with Director profile...",
        warnings: [],
        queue: [],
        startedAt: new Date().toISOString(),
      });

      try {
        const selectedSlots =
          scope === "selected" && selectedSemanticSlot
            ? [selectedSemanticSlot]
            : undefined;
        const response =
          runMode === "refresh"
            ? await backendOrchestrationService.refreshPlan(
                editorState.document,
                selectedSlots,
                activeAgentProfile ?? undefined,
                activeVisualStyleProfiles,
              )
            : await backendOrchestrationService.generatePlan(
                editorState.document,
                selectedSlots,
                activeAgentProfile ?? undefined,
                activeVisualStyleProfiles,
              );

        if (!isMountedRef.current) {
          return;
        }

        const responseWarnings = uniqueStrings([
          ...response.plan.warnings,
          ...(response.warnings ?? []),
        ]);

        setOrchestrationPreviewPlan(response.plan);
        setOrchestrationExecutionStateSafely((current) => ({
          ...current,
          phase: "applying-layout",
          summary: response.plan.summary,
          warnings: responseWarnings,
        }));

        await executeAppliedOrchestrationPlan(response.plan, responseWarnings);
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate semantic output.";
        setOrchestrationExecutionStateSafely({
          phase: "failed",
          isRunning: false,
          summary: "Output generation failed.",
          errorMessage: message,
          warnings: [],
          queue: [],
        });
        dispatch({
          type: "editor/set-orchestration-state",
          patch: {
            isRunning: false,
            lastError: message,
          },
        });
      } finally {
        isOrchestrationRunningRef.current = false;
      }
    },
    [
      editorState.document,
      activeAgentProfile,
      activeVisualStyleProfiles,
      executeAppliedOrchestrationPlan,
      selectedSemanticSlot,
    ],
  );

  const retryOrchestrationGenerationJob = useCallback(
    async (jobId: string) => {
      if (isOrchestrationRunningRef.current) {
        return;
      }

      isOrchestrationRunningRef.current = true;
      setOrchestrationExecutionStateSafely((current) => ({
        ...current,
        phase: "generating-images",
        isRunning: true,
        errorMessage: undefined,
        summary: current.summary ?? "Retrying media generation job.",
      }));

      try {
        const job = await backendGenerationJobService.retryGenerationJob(jobId);
        const queueItemId = getOrchestrationQueueItemId(
          job.slotId ?? job.payload.mediaGenerationSpec.targetSlotId,
          job.targetBlockId ??
            job.payload.mediaGenerationSpec.targetBlockId ??
            "",
          job.mediaType,
        );

        if (job.targetBlockId) {
          updateAIBlockById(job.targetBlockId, createQueuedAIGenerationPatch());
        }

        updateOrchestrationQueueItem(queueItemId, {
          generationJobId: job.id,
          status: "queued",
          progress: 0,
          errorMessage: undefined,
        });

        const didComplete = await pollGenerationJob(job.id, queueItemId);
        const completedAt = new Date().toISOString();

        setOrchestrationExecutionStateSafely((current) => ({
          ...current,
          phase: didComplete ? "completed" : "failed",
          isRunning: false,
          summary: didComplete
            ? "Media generation retry completed."
            : "Media generation retry failed.",
          errorMessage: didComplete
            ? undefined
            : "Retried generation job did not complete successfully.",
          completedAt,
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to retry generation job.";
        setOrchestrationExecutionStateSafely((current) => ({
          ...current,
          phase: "failed",
          isRunning: false,
          summary: "Media generation retry failed.",
          errorMessage: message,
        }));
      } finally {
        isOrchestrationRunningRef.current = false;
      }
    },
    [pollGenerationJob, updateOrchestrationQueueItem],
  );

  const setAuthenticatedUserSafely = useCallback((user: AuthenticatedUser) => {
    setAuthState((current) => {
      const isSameUser =
        current.status === "authenticated" &&
        current.user?.id === user.id &&
        current.user.email === user.email &&
        current.user.displayName === user.displayName;

      if (isSameUser && !current.isSubmitting && !current.errorMessage) {
        return current;
      }

      return {
        status: "authenticated",
        user,
        isSubmitting: false,
      };
    });
  }, []);

  const loadRecentDocuments = useCallback(async (options?: {
    markLoading?: boolean;
  }): Promise<{
    ok: boolean;
    errorMessage?: string;
  }> => {
    if (recentDocumentsRefreshInFlightRef.current) {
      return recentDocumentsRefreshInFlightRef.current;
    }

    if (isMountedRef.current) {
      setDocumentPersistenceState((current) => ({
        ...current,
        recentDocumentsStatus:
          options?.markLoading &&
          !current.hasLoadedRecentDocuments &&
          current.recentDocuments.length === 0
            ? "loading"
            : current.recentDocumentsStatus,
        recentDocumentsError: undefined,
        recentDocumentsIsRefreshing:
          current.hasLoadedRecentDocuments || current.recentDocuments.length > 0,
      }));
    }

    const refreshVersion = recentDocumentsRefreshVersionRef.current;
    const refreshPromise = (async (): Promise<{
      ok: boolean;
      errorMessage?: string;
    }> => {
      try {
        const recentDocuments =
          await backendDocumentPersistenceService.getRecentDocuments();

        if (
          !isMountedRef.current ||
          recentDocumentsRefreshVersionRef.current !== refreshVersion
        ) {
          return {
            ok: false,
            errorMessage: "Recent document refresh aborted after unmount.",
          };
        }

        setDocumentPersistenceState((current) => ({
          ...current,
          recentDocuments,
          recentDocumentsStatus: "ready",
          recentDocumentsError: undefined,
          hasLoadedRecentDocuments: true,
          recentDocumentsIsRefreshing: false,
        }));
        return {
          ok: true as const,
        };
      } catch (error) {
        const errorMessage =
          error instanceof DocumentPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load recent documents.";

        if (
          !isMountedRef.current ||
          recentDocumentsRefreshVersionRef.current !== refreshVersion
        ) {
          return {
            ok: false as const,
            errorMessage,
          };
        }

        if (/sign in/i.test(errorMessage)) {
          recentDocumentsRefreshVersionRef.current += 1;
          recentDocumentsRefreshInFlightRef.current = null;
          setAuthState({
            status: "guest",
            user: null,
            isSubmitting: false,
          });
          setDocumentPersistenceState((current) => ({
            ...current,
            recentDocuments: [],
            recentDocumentsStatus: "ready",
            recentDocumentsError: undefined,
            hasLoadedRecentDocuments: true,
            recentDocumentsIsRefreshing: false,
          }));
          return {
            ok: false as const,
            errorMessage,
          };
        }

        setDocumentPersistenceState((current) => ({
          ...current,
          recentDocumentsStatus: "error",
          recentDocumentsError: errorMessage,
          hasLoadedRecentDocuments: true,
          recentDocumentsIsRefreshing: false,
        }));
        return {
          ok: false as const,
          errorMessage,
        };
      }
    })();

    recentDocumentsRefreshInFlightRef.current = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      if (recentDocumentsRefreshInFlightRef.current === refreshPromise) {
        recentDocumentsRefreshInFlightRef.current = null;
      }
    }
  }, []);

  const refreshRecentDocuments = useCallback(async (options?: {
    markLoading?: boolean;
  }) => loadRecentDocuments(options), [loadRecentDocuments]);

  const handleLoadDocumentFromServer = useCallback(
    async (documentId: string) => {
      if (!currentUser) {
        setActiveView("personal-center");
        setDocumentPersistenceState((current) => ({
          ...current,
          isLoading: false,
          saveStage: "idle",
          statusTone: "error",
          statusMessage: "Sign in to open saved documents.",
        }));
        return false;
      }

      setDocumentPersistenceState((current) => ({
        ...current,
        isLoading: true,
        saveStage: "idle",
        statusTone: "neutral",
        statusMessage: "Loading document from server...",
      }));

      try {
        const storedRecord =
          await backendDocumentPersistenceService.getDocument(documentId);

        dispatch({
          type: "editor/replace-document",
          document: storedRecord.document,
          selectedBlockIds: getDefaultDocumentSelectionIds(storedRecord.document),
          resetUi: true,
        });

        if (!isMountedRef.current) {
          return false;
        }

        setDocumentPersistenceState((current) => ({
          ...current,
          isLoading: false,
          saveStage: "idle",
          statusTone: "success",
          statusMessage: `Loaded ${storedRecord.document.name} from server.`,
        }));
        return true;
      } catch (error) {
        if (!isMountedRef.current) {
          return false;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to load document from server.";

        if (/sign in/i.test(message)) {
          recentDocumentsRefreshVersionRef.current += 1;
          recentDocumentsRefreshInFlightRef.current = null;
          setAuthState({
            status: "guest",
            user: null,
            isSubmitting: false,
          });
          setDocumentPersistenceState((current) => ({
            ...current,
            recentDocuments: [],
            recentDocumentsStatus: "ready",
            recentDocumentsError: undefined,
            hasLoadedRecentDocuments: true,
            recentDocumentsIsRefreshing: false,
          }));
        }

        setDocumentPersistenceState((current) => ({
          ...current,
          isLoading: false,
          saveStage: "idle",
          statusTone: "error",
          statusMessage: message,
        }));
        return false;
      }
    },
    [currentUser],
  );

  const queueRecentDocumentsRefresh = useCallback(
    (successStatusMessage?: string) => {
      void refreshRecentDocuments().then((result) => {
        if (!isMountedRef.current || result.ok || !result.errorMessage) {
          return;
        }

        setDocumentPersistenceState((current) => {
          if (current.isSaving || current.isLoading) {
            return current;
          }

          if (
            successStatusMessage &&
            current.statusMessage &&
            current.statusMessage !== successStatusMessage
          ) {
            return current;
          }

          return {
            ...current,
            statusMessage: successStatusMessage
              ? `${successStatusMessage} ${result.errorMessage}`
              : result.errorMessage,
            recentDocumentsStatus: "error",
            recentDocumentsError: result.errorMessage,
            hasLoadedRecentDocuments: true,
            recentDocumentsIsRefreshing: false,
          };
        });
      });
    },
    [refreshRecentDocuments],
  );

  const hydrateCurrentSession = useCallback(async () => {
    try {
      const user = await backendAuthService.getCurrentUser();

      if (!isMountedRef.current) {
        return;
      }

      if (user) {
        recentDocumentsRefreshVersionRef.current += 1;
        recentDocumentsRefreshInFlightRef.current = null;
        setAuthenticatedUserSafely(user);
        void loadRecentDocuments({
          markLoading: true,
        });
        return;
      }

      recentDocumentsRefreshVersionRef.current += 1;
      recentDocumentsRefreshInFlightRef.current = null;
      setAuthState({
        status: "guest",
        user: null,
        isSubmitting: false,
      });
      setDocumentPersistenceState((current) => ({
        ...current,
        recentDocuments: [],
        recentDocumentsStatus: "ready",
        recentDocumentsError: undefined,
        hasLoadedRecentDocuments: true,
        recentDocumentsIsRefreshing: false,
      }));
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      recentDocumentsRefreshVersionRef.current += 1;
      recentDocumentsRefreshInFlightRef.current = null;
      setAuthState({
        status: "guest",
        user: null,
        isSubmitting: false,
        errorMessage:
          error instanceof BackendAuthServiceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load current session.",
      });
      setDocumentPersistenceState((current) => ({
        ...current,
        recentDocuments: [],
        recentDocumentsStatus: "ready",
        recentDocumentsError: undefined,
        hasLoadedRecentDocuments: true,
        recentDocumentsIsRefreshing: false,
      }));
    }
  }, [loadRecentDocuments, setAuthenticatedUserSafely]);

  const handleLogin = useCallback(
    async (input: { email: string; password: string }) => {
      setAuthState((current) => ({
        ...current,
        isSubmitting: true,
        errorMessage: undefined,
      }));

      try {
        const user = await backendAuthService.login(input);

        if (!isMountedRef.current) {
          return;
        }

        recentDocumentsRefreshVersionRef.current += 1;
        recentDocumentsRefreshInFlightRef.current = null;
        setAuthenticatedUserSafely(user);
        setDocumentPersistenceState((current) => ({
          ...current,
          statusTone: "success",
          statusMessage: `Signed in as ${user.displayName}.`,
        }));
        void loadRecentDocuments({
          markLoading: true,
        });
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setAuthState((current) => ({
          ...current,
          status: "guest",
          user: null,
          isSubmitting: false,
          errorMessage:
            error instanceof BackendAuthServiceError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Failed to sign in.",
        }));
      }
    },
    [loadRecentDocuments, setAuthenticatedUserSafely],
  );

  const handleRegister = useCallback(
    async (input: {
      email: string;
      password: string;
      displayName?: string;
    }) => {
      setAuthState((current) => ({
        ...current,
        isSubmitting: true,
        errorMessage: undefined,
      }));

      try {
        const user = await backendAuthService.register(input);

        if (!isMountedRef.current) {
          return;
        }

        recentDocumentsRefreshVersionRef.current += 1;
        recentDocumentsRefreshInFlightRef.current = null;
        setAuthenticatedUserSafely(user);
        setDocumentPersistenceState((current) => ({
          ...current,
          statusTone: "success",
          statusMessage: `Created account for ${user.displayName}.`,
        }));
        void loadRecentDocuments({
          markLoading: true,
        });
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setAuthState((current) => ({
          ...current,
          status: "guest",
          user: null,
          isSubmitting: false,
          errorMessage:
            error instanceof BackendAuthServiceError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Failed to create account.",
        }));
      }
    },
    [loadRecentDocuments, setAuthenticatedUserSafely],
  );

  const handleLogout = useCallback(async () => {
    try {
      await backendAuthService.logout();
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      recentDocumentsRefreshVersionRef.current += 1;
      recentDocumentsRefreshInFlightRef.current = null;
      setAuthState({
        status: "guest",
        user: null,
        isSubmitting: false,
      });
      setDocumentPersistenceState((current) => ({
        ...current,
        recentDocuments: [],
        recentDocumentsStatus: "ready",
        recentDocumentsError: undefined,
        hasLoadedRecentDocuments: true,
        recentDocumentsIsRefreshing: false,
        statusTone: "neutral",
        statusMessage: "Signed out.",
      }));
    }
  }, []);

  const runSaveDocumentToServer = useCallback(
    async (
      document: DesignDocument,
      options?: {
        mode?: "save" | "save-as";
      },
    ) => {
      if (!currentUser) {
        setActiveView("personal-center");
        setDocumentPersistenceState((current) => ({
          ...current,
          isSaving: false,
          saveStage: "save-failed",
          statusTone: "error",
          statusMessage: "Sign in to save documents to your account.",
        }));
        return null;
      }

      setDocumentPersistenceState((current) => ({
        ...current,
        isSaving: true,
        saveStage: "saving",
        statusTone: "neutral",
        statusMessage:
          options?.mode === "save-as"
            ? "Saving new document copy to server..."
            : "Saving document to server...",
      }));

      try {
        const storedRecord = await backendDocumentPersistenceService.saveDocument(
          document,
          {
            onStage: (stage) => {
              if (!isMountedRef.current) {
                return;
              }

              const nextStatusMessage =
                stage === "saving"
                  ? options?.mode === "save-as"
                    ? "Saving new document copy to server..."
                    : "Saving document to server..."
                  : stage === "normalizing-assets"
                    ? "Saving... normalizing image assets..."
                    : stage === "writing-document"
                      ? "Saving... writing document record..."
                      : "Saving document to server...";

              setDocumentPersistenceState((current) => ({
                ...current,
                isSaving: true,
                saveStage: stage,
                statusTone: "neutral",
                statusMessage: nextStatusMessage,
              }));
            },
          },
        );

        if (!isMountedRef.current) {
          return null;
        }

        dispatch({
          type: "editor/replace-document",
          document: storedRecord.document,
        });

        const successStatusMessage =
          options?.mode === "save-as"
            ? `Saved new copy ${storedRecord.document.name} to server.`
            : `Saved ${storedRecord.document.name} to server.`;

        setDocumentPersistenceState((current) => ({
          ...current,
          isSaving: false,
          saveStage: "idle",
          statusTone: "success",
          statusMessage: successStatusMessage,
          recentDocuments: upsertRecentDocumentSummary(
            current.recentDocuments,
            deriveStoredDocumentSummary(storedRecord),
          ),
          recentDocumentsStatus:
            current.recentDocumentsStatus === "error"
              ? current.recentDocumentsStatus
              : "ready",
          recentDocumentsError:
            current.recentDocumentsStatus === "error"
              ? current.recentDocumentsError
              : undefined,
          hasLoadedRecentDocuments: true,
          recentDocumentsIsRefreshing: false,
        }));

        queueRecentDocumentsRefresh(successStatusMessage);
        return storedRecord;
      } catch (error) {
        if (!isMountedRef.current) {
          return null;
        }

        const resolvedErrorMessage =
          error instanceof DocumentPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to save document to server.";

        if (/sign in/i.test(resolvedErrorMessage)) {
          recentDocumentsRefreshVersionRef.current += 1;
          recentDocumentsRefreshInFlightRef.current = null;
          setAuthState({
            status: "guest",
            user: null,
            isSubmitting: false,
          });
          setDocumentPersistenceState((current) => ({
            ...current,
            recentDocuments: [],
            recentDocumentsStatus: "ready",
            recentDocumentsError: undefined,
            hasLoadedRecentDocuments: true,
            recentDocumentsIsRefreshing: false,
          }));
        }

        setDocumentPersistenceState((current) => ({
          ...current,
          isSaving: false,
          saveStage: "save-failed",
          statusTone: "error",
          statusMessage: `Save failed: ${resolvedErrorMessage}`,
        }));

        return null;
      }
    },
    [currentUser, queueRecentDocumentsRefresh],
  );

  const handleSaveDocumentToServer = useCallback(async () => {
    await runSaveDocumentToServer(editorState.document, {
      mode: "save",
    });
  }, [editorState.document, runSaveDocumentToServer]);

  const handleSaveDocumentAsNewCopy = useCallback(async () => {
    const nextDocument = createDocumentCopy(editorState.document);

    await runSaveDocumentToServer(nextDocument, {
      mode: "save-as",
    });
  }, [editorState.document, runSaveDocumentToServer]);

  const handleCreateNewDocument = useCallback(() => {
    const nextState = createMockEditorState();

    dispatch({
      type: "editor/replace-document",
      document: nextState.document,
      selectedBlockIds: nextState.selection.selectedBlockIds,
      resetUi: true,
    });
    setIsExhibitionMode(false);
    setActiveView("workspace");

    setDocumentPersistenceState((current) => ({
      ...current,
      saveStage: "idle",
      statusTone: "neutral",
      statusMessage: `Started a new document: ${nextState.document.name}.`,
    }));
  }, []);

  const handleOpenDocumentForEditing = useCallback(
    async (documentId: string) => {
      const didLoad = await handleLoadDocumentFromServer(documentId);

      if (didLoad) {
        setIsExhibitionMode(false);
        setActiveView("workspace");
      }
    },
    [handleLoadDocumentFromServer],
  );

  const finalizeContinuousSession = (
    sessionId: symbol,
    nextState: ContinuousAIGenerationSessionState = createIdleContinuousAIGenerationSession(),
  ) => {
    if (activeContinuousSessionRef.current?.sessionId !== sessionId) {
      return;
    }

    activeContinuousSessionRef.current = null;
    setContinuousSessionSafely(nextState);
  };

  const handleStopContinuousAI = async () => {
    const activeSession = activeContinuousSessionRef.current;

    if (!activeSession) {
      return;
    }

    if (!activeSession.stopController.signal.aborted) {
      activeSession.stopController.abort();
    }

    setContinuousSessionSafely((current) =>
      current.status === "idle"
        ? current
        : {
            ...current,
            status: "stopping",
          },
    );

    if (activeSession.activeGenerationId && !activeSession.cancelAttempted) {
      activeSession.cancelAttempted = true;
      await aiGenerationService.cancelGeneration(
        activeSession.activeGenerationId,
        "backend",
      );
    }
  };

  const handleCancelAI = async () => {
    const activeGeneration = activeManualAIGenerationRef.current;

    if (
      !activeGeneration ||
      activeGeneration.cancelAttempted ||
      !activeGeneration.activeGenerationId
    ) {
      return;
    }

    activeGeneration.cancelAttempted = true;

    const cancelResult =
      activeGeneration.mode === "video"
        ? await aiVideoGenerationService.cancelVideoGeneration(
            activeGeneration.activeGenerationId,
            "backend",
          )
        : await aiGenerationService.cancelGeneration(
            activeGeneration.activeGenerationId,
            "backend",
          );

    if (!cancelResult.ok) {
      setAIErrorForBlock(
        activeGeneration.activeBlockId,
        cancelResult.error.message,
      );
      activeManualAIGenerationRef.current = null;
    }
  };

  const handleGenerateAI = async () => {
    if (!selectedBlock || selectedBlock.type !== "ai-generation") {
      return;
    }

    if (activeManualAIGenerationRef.current) {
      return;
    }

    const mode = selectedBlock.data.mediaMode ?? "image";
    const requestId = Symbol(`ai-${mode}-generation`);

    activeManualAIGenerationRef.current = {
      requestId,
      activeBlockId: selectedBlock.id,
      mode,
      cancelAttempted: false,
    };

    const updateActiveGenerationId = (generationId: string) => {
      if (activeManualAIGenerationRef.current?.requestId !== requestId) {
        return;
      }

      activeManualAIGenerationRef.current.activeGenerationId = generationId;
    };

    const finalizeManualGeneration = () => {
      if (activeManualAIGenerationRef.current?.requestId !== requestId) {
        return;
      }

      activeManualAIGenerationRef.current = null;
    };

    if (mode === "video") {
      const snapshot = createAIVideoGenerationSnapshot({
        block: selectedBlock,
        canvasBackgroundColor: editorState.document.canvas.backgroundColor,
      });
      const result = await runSingleAIVideoGenerationCycle({
        aiVideoGenerationService,
        snapshot,
        onQueued: () => {
          updateAIBlockById(selectedBlock.id, createQueuedAIGenerationPatch());
        },
        onResponse: (response) => {
          updateActiveGenerationId(response.generationId);
          applyAIVideoResponse(response);
        },
      });

      finalizeManualGeneration();

      if (!result.ok) {
        setAIErrorForBlock(selectedBlock.id, result.error.message);
      }

      return;
    }

    const snapshot = createContinuousAIGenerationSnapshot({
      block: selectedBlock,
      canvasBackgroundColor: editorState.document.canvas.backgroundColor,
    });
    const result = await runSingleAIGenerationCycle({
      aiGenerationService,
      snapshot,
      onQueued: () => {
        updateAIBlockById(selectedBlock.id, createQueuedAIGenerationPatch());
      },
      onResponse: (response) => {
        updateActiveGenerationId(response.generationId);
        applyAIResponse(response);
      },
    });

    finalizeManualGeneration();

    if (!result.ok) {
      setAIErrorForBlock(selectedBlock.id, result.error.message);
    }
  };

  const handleStartContinuousAI = async () => {
    if (!selectedBlock || selectedBlock.type !== "ai-generation") {
      return;
    }

    if ((selectedBlock.data.mediaMode ?? "image") !== "image") {
      return;
    }

    if (activeContinuousSessionRef.current) {
      return;
    }

    const snapshot = createContinuousAIGenerationSnapshot({
      block: selectedBlock,
      canvasBackgroundColor: editorState.document.canvas.backgroundColor,
    });
    const sessionId = Symbol("continuous-ai-generation");
    const stopController = new AbortController();

    activeContinuousSessionRef.current = {
      sessionId,
      activeBlockId: snapshot.blockId,
      stopController,
      cancelAttempted: false,
    };

    setContinuousSessionSafely({
      activeBlockId: snapshot.blockId,
      status: "running",
      iterationCount: 0,
      startedAt: new Date().toISOString(),
      activeGenerationId: undefined,
      lastErrorMessage: undefined,
    });

    let iterationCount = 0;

    while (activeContinuousSessionRef.current?.sessionId === sessionId) {
      const result = await runSingleAIGenerationCycle({
        aiGenerationService,
        snapshot,
        onQueued: () => {
          updateAIBlockById(snapshot.blockId, createQueuedAIGenerationPatch());
        },
        onResponse: (response) => {
          applyAIResponse(response);

          if (activeContinuousSessionRef.current?.sessionId !== sessionId) {
            return;
          }

          activeContinuousSessionRef.current.activeGenerationId =
            response.generationId;
          setContinuousSessionSafely((current) => ({
            ...current,
            activeGenerationId: response.generationId,
          }));
        },
      });

      if (activeContinuousSessionRef.current?.sessionId !== sessionId) {
        return;
      }

      activeContinuousSessionRef.current.activeGenerationId = undefined;

      if (!result.ok) {
        setAIErrorForBlock(snapshot.blockId, result.error.message);
        finalizeContinuousSession(sessionId, {
          ...createIdleContinuousAIGenerationSession(),
          lastErrorMessage: result.error.message,
        });
        return;
      }

      if (result.data.status === "failed") {
        finalizeContinuousSession(sessionId, {
          ...createIdleContinuousAIGenerationSession(),
          lastErrorMessage:
            result.data.error?.message ?? "Continuous generation stopped after a failed round.",
        });
        return;
      }

      if (result.data.status === "cancelled") {
        break;
      }

      iterationCount += 1;
      setContinuousSessionSafely((current) => ({
        ...current,
        status: stopController.signal.aborted ? "stopping" : "running",
        iterationCount,
        activeGenerationId: undefined,
      }));

      if (stopController.signal.aborted) {
        break;
      }

      await waitForContinuousGenerationDelay(
        snapshot.intervalMs,
        stopController.signal,
      );

      if (stopController.signal.aborted) {
        break;
      }
    }

    finalizeContinuousSession(sessionId);
  };

  const handleExportStaticImage = async (format: StaticExportFormat) => {
    const readinessError = getExportReadinessError();

    if (readinessError) {
      setExportState({
        isExporting: false,
        statusMessage: readinessError,
      });
      return;
    }

    setExportState({
      isExporting: true,
      statusMessage: `Exporting ${format === "jpeg" ? "JPG" : "PNG"}...`,
    });

    try {
      const result = await prototypeExportService.exportStaticImage({
        document: exportDocument,
        options: {
          format,
          pixelRatio: 2,
          quality: 0.92,
          backgroundColor: exportDocument.canvas.backgroundColor,
        },
      });

      downloadBlob(result.blob, result.fileName);
      setExportState({
        isExporting: false,
        statusMessage: `${format === "jpeg" ? "JPG" : "PNG"} export ready.`,
      });

      window.setTimeout(() => {
        setExportState((current) =>
          current.isExporting
            ? current
            : {
                ...current,
                statusMessage: undefined,
              },
        );
      }, 1800);
    } catch (error) {
      setExportState({
        isExporting: false,
        statusMessage:
          error instanceof Error ? error.message : "Export failed unexpectedly.",
      });
    }
  };

  const handleExportAnimatedMedia = useCallback(
    async (format: AnimatedExportFormat) => {
      const readinessError = getExportReadinessError();

      if (readinessError) {
        setExportState({
          isExporting: false,
          statusMessage: readinessError,
        });
        return;
      }

      setExportState({
        isExporting: true,
        statusMessage: getAnimatedExportStatusMessage(
          format,
          "preparing-assets",
        ),
      });

      try {
        const result = await prototypeExportService.exportAnimatedMedia({
          document: exportDocument,
          options: {
            format,
            frameRate: 24,
            durationMs: deriveAnimatedExportDurationMs(editorState.document),
            backgroundColor: exportDocument.canvas.backgroundColor,
            onStageChange: (stage) => {
              setExportState((current) => ({
                ...current,
                isExporting: true,
                statusMessage: getAnimatedExportStatusMessage(format, stage),
              }));
            },
          },
        });

        downloadBlob(result.blob, result.fileName);
        const successMessage = `${format.toUpperCase()} export ready.`;
        setExportState({
          isExporting: false,
          statusMessage: successMessage,
        });

        window.setTimeout(() => {
          setExportState((current) =>
            current.isExporting
              ? current
              : {
                  ...current,
                  statusMessage:
                    current.statusMessage === successMessage
                      ? undefined
                      : current.statusMessage,
                },
          );
        }, 2000);
      } catch (error) {
        setExportState({
          isExporting: false,
          statusMessage:
            error instanceof Error
              ? error.message
              : `${format.toUpperCase()} export failed unexpectedly.`,
        });
      }
    },
    [editorState.document, exportDocument, getExportReadinessError],
  );

  const handleEnterExhibition = useCallback(() => {
    setIsExhibitionMode(true);
  }, []);

  const handleOpenPersonalCenter = useCallback(() => {
    setActiveView("personal-center");

    if (currentUser) {
      void refreshRecentDocuments({
        markLoading: documentPersistenceState.recentDocuments.length === 0,
      });
    }
  }, [
    currentUser,
    documentPersistenceState.recentDocuments.length,
    refreshRecentDocuments,
  ]);

  const handleBuildAgentProfile = useCallback(
    async (
      plainLanguageBrief: string,
      referenceImages?: Array<{
        assetId?: string;
        title?: string;
        mimeType?: string;
        byteSize?: number;
      }>,
    ) => {
      const trimmedBrief = plainLanguageBrief.trim();

      if (!trimmedBrief) {
        setAgentProfileBuilderState({
          isBuilding: false,
          summary: undefined,
          errorMessage: "Describe how you want the AI Design Director to work.",
          warnings: [],
        });
        return;
      }

      const currentLibraryProfile = activeAgentProfile
        ? savedAgentProfiles.find(
            (profile) =>
              JSON.stringify(profile) === JSON.stringify(activeAgentProfile),
          )
        : null;
      agentProfileSaveTargetRef.current = currentLibraryProfile ?? null;

      setAgentProfileBuilderState({
        isBuilding: true,
        summary: referenceImages?.length
          ? "Analyzing Director references..."
          : "Building AI Design Director profile...",
        warnings: [],
      });

      try {
        const result = await backendOrchestrationService.buildAgentProfile({
          plainLanguageBrief: trimmedBrief,
          existingProfile: activeAgentProfile ?? undefined,
          referenceImages: referenceImages?.slice(0, 10),
        });
        const profile = sanitizeAgentProfile(result.profile);

        if (!isMountedRef.current) {
          return;
        }

        setActiveAgentProfile(profile);
        persistAgentProfile(profile);
        setAgentProfileBuilderState({
          isBuilding: false,
          summary:
            "AI Design Director profile updated. Click Save Updated Profile to keep it in your profile library.",
          warnings: result.warnings ?? [],
        });
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setAgentProfileBuilderState({
          isBuilding: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to build AI Design Director profile.",
          warnings: [],
        });
      }
    },
    [activeAgentProfile, savedAgentProfiles],
  );

  const handleSaveAgentProfile = useCallback((profile: AgentProfile) => {
    const sanitizedProfile = sanitizeAgentProfile(profile);
    const sanitizedProfileJson = JSON.stringify(sanitizedProfile);
    const saveTargetJson = agentProfileSaveTargetRef.current
      ? JSON.stringify(agentProfileSaveTargetRef.current)
      : undefined;
    const activeProfileJson = activeAgentProfile
      ? JSON.stringify(activeAgentProfile)
      : undefined;
    let replaceIndex = saveTargetJson
      ? savedAgentProfiles.findIndex(
          (candidate) => JSON.stringify(candidate) === saveTargetJson,
        )
      : -1;

    if (replaceIndex < 0 && activeProfileJson) {
      replaceIndex = savedAgentProfiles.findIndex(
        (candidate) => JSON.stringify(candidate) === activeProfileJson,
      );
    }

    if (replaceIndex < 0) {
      replaceIndex = savedAgentProfiles.findIndex(
        (candidate) => candidate.agentName === sanitizedProfile.agentName,
      );
    }

    const nextProfiles =
      replaceIndex >= 0
        ? savedAgentProfiles
            .map((candidate, index) =>
              index === replaceIndex ? sanitizedProfile : candidate,
            )
            .filter(
              (candidate, index, profiles) =>
                profiles.findIndex(
                  (profileCandidate) =>
                    JSON.stringify(profileCandidate) === JSON.stringify(candidate),
                ) === index,
            )
            .slice(0, 20)
        : [
            sanitizedProfile,
            ...savedAgentProfiles.filter(
              (candidate) => JSON.stringify(candidate) !== sanitizedProfileJson,
            ),
          ].slice(0, 20);

    setSavedAgentProfiles(nextProfiles);
    persistAgentProfileLibrary(nextProfiles);
    setActiveAgentProfile(sanitizedProfile);
    persistAgentProfile(sanitizedProfile);
    agentProfileSaveTargetRef.current = sanitizedProfile;
    setAgentProfileBuilderState({
      isBuilding: false,
      summary: "AI Design Director profile saved.",
      warnings: [],
    });
  }, [activeAgentProfile, savedAgentProfiles]);

  const handleSelectAgentProfile = useCallback((profile: AgentProfile | null) => {
    const sanitizedProfile = profile ? sanitizeAgentProfile(profile) : null;

    setActiveAgentProfile(sanitizedProfile);
    persistAgentProfile(sanitizedProfile);
    agentProfileSaveTargetRef.current = sanitizedProfile;
    setAgentProfileBuilderState({
      isBuilding: false,
      summary: sanitizedProfile
        ? `Activated ${sanitizedProfile.agentName}.`
        : "Activated the default AI Design Director.",
      warnings: [],
    });
  }, []);

  const handleRestoreDefaultAgentProfile = useCallback(() => {
    const profile = createDefaultAgentProfile();

    setActiveAgentProfile(null);
    persistAgentProfile(null);
    agentProfileSaveTargetRef.current = null;
    setAgentProfileBuilderState({
      isBuilding: false,
      summary:
        "Restored the default AI Design Director. Semantic Compose will use the base art director behavior.",
      warnings: [],
    });
  }, []);

  const handleUploadVisualReference = useCallback(async (file: File) => {
    setVisualReferenceState((current) => ({
      ...current,
      isUploading: true,
      errorMessage: undefined,
      statusMessage: "Uploading visual reference...",
      warnings: [],
    }));

    try {
      const asset = await backendAssetPersistenceService.uploadImage(file);

      if (!isMountedRef.current) {
        return;
      }

      setVisualReferenceState((current) => ({
        ...current,
        isUploading: false,
        uploadedAssets: [
          asset,
          ...current.uploadedAssets.filter(
            (candidate) => candidate.id !== asset.id,
          ),
        ].slice(0, 10),
        statusMessage:
          "Reference image uploaded. It will be used the next time you build the AI Design Director profile.",
        warnings: [],
      }));
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setVisualReferenceState((current) => ({
        ...current,
        isUploading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to upload visual reference.",
      }));
    }
  }, []);

  const handleAnalyzeVisualReference = useCallback(
    async (input: { assetId: string; title?: string }) => {
      setVisualReferenceState((current) => ({
        ...current,
        isAnalyzing: true,
        errorMessage: undefined,
        statusMessage: "Analyzing visual composition with OpenRouter...",
      }));

      try {
        const result = await backendAssetPersistenceService.analyzeVisualStyle(input);
        const nextProfiles = [
          result.profile,
          ...visualStyleProfiles.filter(
            (profile) => profile.id !== result.profile.id,
          ),
        ].slice(0, 40);
        const nextActiveIds = [
          result.profile.id,
          ...activeVisualStyleProfileIds.filter(
            (id) => id !== result.profile.id,
          ),
        ];

        if (!isMountedRef.current) {
          return;
        }

        setVisualStyleProfiles(nextProfiles);
        persistVisualStyleProfiles(nextProfiles);
        setActiveVisualStyleProfileIds(nextActiveIds);
        persistActiveVisualStyleProfileIds(nextActiveIds);
        setVisualReferenceState((current) => ({
          ...current,
          isAnalyzing: false,
          statusMessage: "Visual style profile saved.",
          warnings: result.warnings ?? [],
        }));
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setVisualReferenceState((current) => ({
          ...current,
          isAnalyzing: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to analyze visual reference.",
        }));
      }
    },
    [activeVisualStyleProfileIds, visualStyleProfiles],
  );

  const handleToggleVisualStyleProfile = useCallback((profileId: string) => {
    setActiveVisualStyleProfileIds((current) => {
      const next = current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [profileId, ...current];

      persistActiveVisualStyleProfileIds(next);
      return next;
    });
  }, []);

  const handleExitExhibition = useCallback(() => {
    setIsExhibitionMode(false);

    if (globalThis.document.fullscreenElement != null) {
      void globalThis.document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const applyExhibitionIdentityText = useCallback(
    (audienceInput: ExhibitionAudienceInput) => {
      const identityResult = withExhibitionIdentityText(
        latestDocumentRef.current,
        audienceInput.identity,
      );

      if (!identityResult.targetBlockId || !identityResult.content) {
        return identityResult;
      }

      const typographyResult = withExhibitionTypographyPatch(
        identityResult.document,
        identityResult.targetBlockId,
        audienceInput,
      );

      latestDocumentRef.current = typographyResult.document;
      dispatch({
        type: "editor/update-text-block-content",
        blockId: identityResult.targetBlockId,
        content: identityResult.content,
      });
      if (typographyResult.patch) {
        dispatch({
          type: "editor/update-text-block-data-by-id",
          blockId: identityResult.targetBlockId,
          patch: typographyResult.patch,
        });
      }

      return {
        ...identityResult,
        document: typographyResult.document,
      };
    },
    [],
  );

  const handleGenerateExhibitionOutput = useCallback(
    async (audienceInput: ExhibitionAudienceInput) => {
      applyExhibitionIdentityText(audienceInput);
      await handleCaptureSemanticLiveMoment({
        autoCaptureReason: "Exhibition audience generation",
        exhibitionAudience: audienceInput,
      });
    },
    [applyExhibitionIdentityText, handleCaptureSemanticLiveMoment],
  );

  const handleIterateExhibitionOutput = useCallback(
    async (audienceInput: ExhibitionAudienceInput) => {
      applyExhibitionIdentityText(audienceInput);
      await handleCaptureSemanticLiveMoment({
        autoCaptureReason: "Exhibition audience iteration",
        exhibitionAudience: audienceInput,
      });
    },
    [applyExhibitionIdentityText, handleCaptureSemanticLiveMoment],
  );

  useEffect(() => {
    void hydrateCurrentSession();
  }, [hydrateCurrentSession]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      const activeSession = activeContinuousSessionRef.current;

      if (!activeSession) {
        return;
      }

      if (!activeSession.stopController.signal.aborted) {
        activeSession.stopController.abort();
      }

      if (activeSession.activeGenerationId && !activeSession.cancelAttempted) {
        activeSession.cancelAttempted = true;
        void aiGenerationService.cancelGeneration(
          activeSession.activeGenerationId,
          "backend",
        );
      }

      activeContinuousSessionRef.current = null;

      const activeManualGeneration = activeManualAIGenerationRef.current;

      if (!activeManualGeneration) {
        return;
      }

      if (
        activeManualGeneration.activeGenerationId &&
        !activeManualGeneration.cancelAttempted
      ) {
        activeManualGeneration.cancelAttempted = true;

        if (activeManualGeneration.mode === "video") {
          void aiVideoGenerationService.cancelVideoGeneration(
            activeManualGeneration.activeGenerationId,
            "backend",
          );
        } else {
          void aiGenerationService.cancelGeneration(
            activeManualGeneration.activeGenerationId,
            "backend",
          );
        }
      }

      activeManualAIGenerationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isExhibitionMode) {
      return undefined;
    }

    const handleFullscreenChange = () => {
      if (globalThis.document.fullscreenElement == null) {
        setIsExhibitionMode(false);
      }
    };

    globalThis.document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange,
    );

    return () => {
      globalThis.document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange,
      );
    };
  }, [isExhibitionMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTextEntryTarget =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable ||
        Boolean(target?.closest("[contenteditable='true']"));

      if (isExhibitionMode) {
        if (event.key === "Escape") {
          event.preventDefault();
          handleExitExhibition();
          return;
        }

        if (
          !isTextEntryTarget &&
          (event.key === "Backspace" || event.key === "Delete")
        ) {
          event.preventDefault();
        }

        return;
      }

      if (activeView !== "workspace") {
        return;
      }

      if (
        isTextEntryTarget ||
        target?.closest(".file-menu")
      ) {
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        if ((editorState.document.compositionMode ?? "manual") === "semantic") {
          dispatch({
            type: "editor/delete-semantic-slot",
          });
          return;
        }

        dispatch({
          type: "editor/delete-selected-block",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeView,
    editorState.document.compositionMode,
    handleExitExhibition,
    isExhibitionMode,
  ]);

  useEffect(() => {
    const orchestrationState = editorState.document.orchestrationState;

    if (
      activeView !== "workspace" ||
      (editorState.document.compositionMode ?? "manual") !== "semantic" ||
      !orchestrationState?.autoRefreshEnabled ||
      orchestrationState.isRunning
    ) {
      return undefined;
    }

    const now = Date.now();
    const timeSinceLastSemanticEdit = now - lastSemanticEditAtRef.current;
    const waitForCooldownMs = Math.max(
      ORCHESTRATION_MANUAL_EDIT_COOLDOWN_MS - timeSinceLastSemanticEdit,
      0,
    );
    const delayMs = Math.max(
      orchestrationState.autoRefreshIntervalMs,
      waitForCooldownMs,
    );

    const timeoutId = window.setTimeout(() => {
      if (isOrchestrationRunningRef.current) {
        return;
      }

      void runOrchestration("refresh");
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeView,
    editorState.document.compositionMode,
    editorState.document.orchestrationState,
    runOrchestration,
  ]);

  const exhibitionRenderDocument = useMemo(
    () => createExhibitionRenderDocument(previewDocument),
    [previewDocument],
  );

  const exhibitionIsBusy =
    semanticLiveCaptureState.status === "capturing" ||
    semanticLiveCaptureState.status === "directing" ||
    semanticLiveCaptureState.status === "applying" ||
    semanticLiveCaptureState.status === "regenerating" ||
    orchestrationExecutionState.isRunning;
  const exhibitionStageTone =
    semanticLiveCaptureState.status === "failed" ||
    orchestrationExecutionState.phase === "failed"
      ? "error"
      : semanticLiveCaptureState.status === "applied" ||
          orchestrationExecutionState.phase === "completed"
        ? "success"
        : exhibitionIsBusy
          ? "active"
          : "idle";
  const exhibitionStageLabel =
    semanticLiveCaptureState.status === "capturing"
      ? "Capturing"
      : semanticLiveCaptureState.status === "directing" ||
          orchestrationExecutionState.phase === "planning-layout"
        ? "Directing"
        : semanticLiveCaptureState.status === "regenerating" ||
            orchestrationExecutionState.phase === "generating-images"
          ? "Regenerating"
          : semanticLiveCaptureState.status === "failed"
            ? "Needs attention"
            : semanticLiveCaptureState.status === "applied"
              ? "Ready"
              : "Ready";

  return (
    <main
      className={`app-shell${
        isExhibitionMode ? " app-shell--exhibition-active" : ""
      }`}
    >
      {activeView === "workspace" ? (
        <LiveCameraCoordinator
          document={editorState.document}
          forceActive={
            isExhibitionMode ||
            (semanticLiveDirectionEnabled &&
              (editorState.document.compositionMode ?? "manual") === "semantic")
          }
        />
      ) : null}
      <header className="app-shell__header">
        <div className="app-shell__header-copy">
          {activeView === "personal-center" ? (
            <button
              type="button"
              className="app-shell__title-button"
              onClick={() => setActiveView("workspace")}
            >
              <h1 className="app-shell__title">Structured Dreams</h1>
            </button>
          ) : (
            <>
              <h1 className="app-shell__title">Structured Dreams</h1>
              <p className="app-shell__file-name">
                Current file: {editorState.document.name}
              </p>
            </>
          )}
          {documentPersistenceState.statusMessage ? (
            <p
              className={`app-shell__status-message app-shell__status-message--${documentPersistenceState.statusTone}`}
            >
              {documentPersistenceState.statusMessage}
            </p>
          ) : null}
        </div>

        {activeView === "workspace" ? (
          <div className="app-shell__header-actions">
            <button
              type="button"
              className="secondary-button app-shell__header-button"
              onClick={handleOpenPersonalCenter}
            >
              {currentUser ? "Personal Center" : "Sign In"}
            </button>
            <FileMenu
              currentDocumentId={editorState.document.id}
              currentDocumentName={editorState.document.name}
              isAuthenticated={currentUser != null}
              recentDocuments={documentPersistenceState.recentDocuments}
              recentDocumentsStatus={documentPersistenceState.recentDocumentsStatus}
              recentDocumentsError={documentPersistenceState.recentDocumentsError}
              hasLoadedRecentDocuments={
                documentPersistenceState.hasLoadedRecentDocuments
              }
              recentDocumentsIsRefreshing={
                documentPersistenceState.recentDocumentsIsRefreshing
              }
              isSaving={documentPersistenceState.isSaving}
              isLoading={documentPersistenceState.isLoading}
              onNewDocument={handleCreateNewDocument}
              onSave={handleSaveDocumentToServer}
              onSaveAsNewCopy={handleSaveDocumentAsNewCopy}
              onOpenRecent={handleOpenDocumentForEditing}
              onRenameCurrentDocument={handleRenameCurrentDocument}
              onOpenAccountAccess={handleOpenPersonalCenter}
            />
          </div>
        ) : null}
      </header>

      {activeView === "personal-center" ? (
        <PersonalCenterView
          currentUser={currentUser}
          authStatus={authState.status}
          authSubmitting={authState.isSubmitting}
          authError={authState.errorMessage}
          documents={documentPersistenceState.recentDocuments}
          documentsStatus={documentPersistenceState.recentDocumentsStatus}
          documentsError={documentPersistenceState.recentDocumentsError}
          hasLoadedDocuments={documentPersistenceState.hasLoadedRecentDocuments}
          documentsAreRefreshing={
            documentPersistenceState.recentDocumentsIsRefreshing
          }
          currentDocumentId={editorState.document.id}
          onOpenDocument={handleOpenDocumentForEditing}
          onCreateNewDocument={handleCreateNewDocument}
          onRefreshDocuments={() =>
            refreshRecentDocuments({
              markLoading: true,
            })
          }
          onLogin={handleLogin}
          onRegister={handleRegister}
          onLogout={handleLogout}
          activeAgentProfile={activeAgentProfile}
          savedAgentProfiles={savedAgentProfiles}
          agentProfileBuilderState={agentProfileBuilderState}
          onBuildAgentProfile={handleBuildAgentProfile}
          onSaveAgentProfile={handleSaveAgentProfile}
          onSelectAgentProfile={handleSelectAgentProfile}
          onRestoreDefaultAgentProfile={handleRestoreDefaultAgentProfile}
          visualReferenceState={visualReferenceState}
          visualStyleProfiles={visualStyleProfiles}
          activeVisualStyleProfileIds={activeVisualStyleProfileIds}
          onUploadVisualReference={handleUploadVisualReference}
          onAnalyzeVisualReference={handleAnalyzeVisualReference}
          onToggleVisualStyleProfile={handleToggleVisualStyleProfile}
          isLoading={documentPersistenceState.isLoading}
        />
      ) : (
        <section className="workspace-layout">
          {(editorState.document.compositionMode ?? "manual") === "semantic" ? (
            <SemanticComposeSidebar
              document={editorState.document}
              activeTool={editorState.ui.activeTool}
              selectedSlot={selectedSemanticSlot}
              previewPlan={orchestrationPreviewPlan}
              orchestrationExecution={orchestrationExecutionState}
              semanticLiveDirectionEnabled={semanticLiveDirectionEnabled}
              semanticLiveImageRegenerationEnabled={
                semanticLiveImageRegenerationEnabled
              }
              semanticLivePortraitFusionEnabled={
                semanticLivePortraitFusionEnabled
              }
              semanticLiveCameraDeviceState={sharedCameraDeviceState}
              semanticLiveAutoCaptureEnabled={semanticLiveAutoCaptureEnabled}
              semanticLiveAutoCaptureCooldownSeconds={
                semanticLiveAutoCaptureCooldownSeconds
              }
              semanticLiveAutoCaptureSensitivity={
                semanticLiveAutoCaptureSensitivity
              }
              semanticLiveAutoCaptureLastReason={
                semanticLiveAutoCaptureLastReason
              }
              semanticLiveCapture={semanticLiveCaptureState}
              activeAgentProfile={activeAgentProfile}
              activeVisualStyleProfiles={activeVisualStyleProfiles}
              primaryActionLabel={
                editorState.document.orchestrationState?.lastAppliedPlanId
                  ? "Refresh Output"
                  : "Generate Output"
              }
              onSetCompositionMode={handleSetCompositionMode}
              onSetTool={(tool) =>
                dispatch({
                  type: "editor/set-tool",
                  tool,
                })
              }
              onUpdateCanvas={(patch) =>
                dispatch({
                  type: "editor/update-canvas",
                  patch,
                })
              }
              onUpdateSemanticBrief={handleUpdateSemanticBrief}
              onSelectSemanticSlot={handleSelectSemanticSlot}
              onUpdateSemanticSlot={handleUpdateSemanticSlot}
              onDeleteSemanticSlot={handleDeleteSemanticSlot}
              onMoveSemanticSlotLayer={(slotId, direction) =>
                dispatch({
                  type: "editor/move-semantic-slot-layer",
                  slotId,
                  direction,
                })
              }
              onGenerateOutput={() => runOrchestration("plan")}
              onRefreshSelectedOutput={() =>
                runOrchestration("refresh", "selected")
              }
              onApplyLayoutRemix={handleApplyLayoutRemix}
              onDismissLayoutRemix={handleDismissLayoutRemix}
              onApplyDecorativeOps={handleApplyDecorativeOps}
              onDismissDecorativeOps={handleDismissDecorativeOps}
              onRetryGenerationJob={retryOrchestrationGenerationJob}
              onToggleSemanticLiveDirection={handleToggleSemanticLiveDirection}
              onToggleSemanticLiveImageRegeneration={
                setSemanticLiveImageRegenerationEnabled
              }
              onToggleSemanticLivePortraitFusion={
                setSemanticLivePortraitFusionEnabled
              }
              onSelectSemanticLiveCameraDevice={
                handleSelectSemanticLiveCameraDevice
              }
              onRefreshSemanticLiveCameraDevices={
                handleRefreshSemanticLiveCameraDevices
              }
              onToggleSemanticLiveAutoCapture={setSemanticLiveAutoCaptureEnabled}
              onUpdateSemanticLiveAutoCaptureCooldown={
                handleUpdateSemanticLiveAutoCaptureCooldown
              }
              onUpdateSemanticLiveAutoCaptureSensitivity={
                setSemanticLiveAutoCaptureSensitivity
              }
              onCaptureLiveMoment={handleCaptureSemanticLiveMoment}
              onReapplyLiveDirection={handleReapplySemanticLiveDirection}
              onToggleAutoRefresh={(enabled) =>
                dispatch({
                  type: "editor/set-orchestration-state",
                  patch: {
                    autoRefreshEnabled: enabled,
                  },
                })
              }
              onUpdateAutoRefreshInterval={(intervalMs) =>
                dispatch({
                  type: "editor/set-orchestration-state",
                  patch: {
                    autoRefreshIntervalMs: intervalMs,
                  },
                })
              }
            />
          ) : (
            <EditorSidebar
              compositionMode={editorState.document.compositionMode ?? "manual"}
              activeTool={editorState.ui.activeTool}
              canvas={editorState.document.canvas}
              grid={editorState.document.grid}
              blocks={editorState.document.blocks}
              continuousAIGenerationSession={resolvedContinuousAIGenerationSession}
              selectedBlock={selectedBlock}
              onToolChange={(tool) =>
                dispatch({
                  type: "editor/set-tool",
                  tool,
                })
              }
              onSetCompositionMode={handleSetCompositionMode}
              onSelectBlock={(blockId) =>
                dispatch({
                  type: "editor/select-block",
                  blockId,
                })
              }
              onCanvasChange={(patch) =>
                dispatch({
                  type: "editor/update-canvas",
                  patch,
                })
              }
              onGridChange={(patch) =>
                dispatch({
                  type: "editor/update-grid",
                  patch,
                })
              }
              onDeleteSelectedBlock={() =>
                dispatch({
                  type: "editor/delete-selected-block",
                })
              }
              onUpdateSelectedBlockName={(name) =>
                dispatch({
                  type: "editor/update-selected-block-name",
                  name,
                })
              }
              onUpdateTextBlock={handleUpdateTextBlock}
              onUpdateImageBlock={handleUpdateImageBlock}
              onSetImageSource={handleSetImageSource}
              onUpdateAIGenerationBlock={handleUpdateAIGenerationBlock}
              onUpdateLiveBlock={handleUpdateLiveBlock}
              onUpdateSelectedBlockAppearance={handleUpdateSelectedBlockAppearance}
              onToggleBlockHidden={(blockId) =>
                dispatch({
                  type: "editor/toggle-block-hidden",
                  blockId,
                })
              }
              onMoveBlockLayer={(blockId, direction) =>
                dispatch({
                  type: "editor/move-block-layer",
                  blockId,
                  direction,
                })
              }
              onGenerateAI={handleGenerateAI}
              onCancelAI={handleCancelAI}
              onStartContinuousAI={handleStartContinuousAI}
              onStopContinuousAI={handleStopContinuousAI}
            />
          )}

          <GridCanvasPanel editorState={editorState} dispatch={dispatch} />

          <LivePreviewPanel
            document={previewDocument}
            onExportStaticImage={handleExportStaticImage}
            onExportAnimatedMedia={handleExportAnimatedMedia}
            onEnterExhibition={handleEnterExhibition}
            isExporting={exportState.isExporting}
            exportDisabled={Boolean(semanticExportDisabledReason)}
            exportDisabledReason={semanticExportDisabledReason}
            exportStatusMessage={exportState.statusMessage}
          />
        </section>
      )}

      {activeView === "workspace" && isExhibitionMode ? (
        <ExhibitionModeOverlay
          document={exhibitionRenderDocument}
          onExit={handleExitExhibition}
          onGenerate={handleGenerateExhibitionOutput}
          onIterateAgain={handleIterateExhibitionOutput}
          isBusy={exhibitionIsBusy}
          stageLabel={exhibitionStageLabel}
          stageTone={exhibitionStageTone}
          cameraStatus={sharedLiveCameraState.status}
          cameraErrorMessage={sharedLiveCameraState.errorMessage}
          faceCount={sharedLiveCameraState.frame?.faceCount ?? 0}
          handCount={sharedLiveCameraState.frame?.handCount ?? 0}
          poseCount={sharedLiveCameraState.frame?.poseCount ?? 0}
          primaryExpression={sharedLiveCameraState.frame?.primaryExpression}
          captureSummary={
            semanticLiveCaptureState.liveDirectionSummary ??
            orchestrationExecutionState.summary
          }
          captureWarnings={uniqueStrings([
            ...(semanticLiveCaptureState.liveDirectionWarnings ?? []),
            ...orchestrationExecutionState.warnings,
          ])}
          regenerationEnabled={semanticLiveImageRegenerationEnabled}
          portraitFusionEnabled={semanticLivePortraitFusionEnabled}
          onTogglePortraitFusion={setSemanticLivePortraitFusionEnabled}
        />
      ) : null}
    </main>
  );
}
