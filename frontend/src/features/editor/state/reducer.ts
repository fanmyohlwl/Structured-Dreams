import type {
  AIGenerationBlockData,
  AIGenerationBlock,
  BlockType,
  DesignBlock,
  ImageAssetKind,
  ImageBlockData,
  ImageBlock,
  LiveColorMapping,
  LiveBlock,
  LiveBlockData,
  PatternBlock,
  PatternBlockData,
  TextBlockData,
  TextBlock,
} from "../../../entities/block/types";
import {
  normalizeBlockBlendMode,
  normalizeBlockClipMode,
  normalizeBlockRotation,
  normalizeBlockVisualFilter,
} from "../../../entities/block/visualStyle";
import type { CanvasSettings, DesignDocument } from "../../../entities/document/types";
import { getGridGeometry } from "../../../entities/grid/geometry";
import type { GridSettings } from "../../../entities/grid/types";
import type {
  CompositionMode,
  DocumentOrchestrationState,
  SemanticBrief,
  SemanticSlot,
} from "../../../entities/semantic/types";
import {
  clampOrchestrationAutoRefreshIntervalMs,
  createDefaultOrchestrationState,
  createEmptySemanticBrief,
  deriveSemanticSlotKindPatch,
  withDefaultDocumentOrchestrationState,
  withDefaultSemanticBrief,
  withDefaultSemanticSlot,
} from "../../../entities/semantic/types";
import type { Point, Rect } from "../../../shared/types/common";
import type { AIGenerationResponse } from "../../ai/types";
import type { AIVideoGenerationResponse } from "../../ai/videoTypes";
import { withDefaultAIGenerationBlockData } from "../../ai/utils/aiBlockGeneration";
import type {
  LiveMappingPatch,
  OrchestrationDecorativeOp,
  OrchestrationPlan,
  OrchestrationLayoutPatch,
  OrchestrationPlannedBlock,
  TypographyAdjustment,
} from "../../orchestration/types";
import { normalizePatternBlockData } from "../../rendering/utils/patternRendering";
import { withDefaultImageBlockData } from "../../live/utils/imageLiveLayout";
import { normalizeLiveSignalKey } from "../../live/config/liveSignalRegistry";
import { withDefaultLiveColorMapping as normalizeLiveColorMapping } from "../../live/utils/liveColorMapping";
import { withDefaultTextBlockData } from "../../live/utils/textLiveTypography";
import { getAvailableFontCatalog } from "../../typography/fontCatalog";
import {
  getOnlineFontById,
  getOnlineFontFamilyStack,
  onlineFontCatalog,
} from "../../typography/onlineFontCatalog";
import {
  getSemanticTypographyPreset,
  semanticTypographyPresets,
} from "../../typography/semanticTypographyPresets";
import type {
  EditorState,
  EditorTool,
  LayerMoveDirection,
  LeftPanelTab,
  ResizeHandle,
} from "./types";
import { GLOBAL_LIVE_SOURCE_ID } from "../../live/runtime/sharedLiveCamera";

const now = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createDefaultLiveColorMapping = (): LiveColorMapping => ({
  enabled: false,
  sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
  defaultColor: "#ffffff",
  transitionMs: 600,
  rules: [
    {
      id: createId("live_rule"),
      expressionKey: "smile",
      threshold: 0.35,
      color: "#fff2b8",
    },
  ],
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clampCanvasZoom = (zoom: number) => clamp(zoom, 0.2, 2);

const withDefaultBlockVisualStyle = <TBlock extends DesignBlock>(
  block: TBlock,
): TBlock => ({
  ...block,
  rotation: normalizeBlockRotation(block.rotation),
  blendMode: normalizeBlockBlendMode(block.blendMode),
  clipMode: normalizeBlockClipMode(block.clipMode),
  filter: normalizeBlockVisualFilter(block.filter),
});

const clampCanvasDimension = (value: number) => clamp(Math.round(value), 320, 4096);
const clampSemanticFontSize = (value: number) => clamp(Math.round(value), 8, 160);

const fontCategoryFallbacks: Record<
  TypographyAdjustment["fontCategory"],
  string | null
> = {
  serif: "Georgia, Times New Roman, serif",
  sans: "Avenir Next, Helvetica Neue, sans-serif",
  mono: "IBM Plex Mono, SFMono-Regular, monospace",
  display: "Impact, Avenir Next Condensed, sans-serif",
  script: "Snell Roundhand, Brush Script MT, cursive",
  system: null,
};

const clampSemanticFontSizeScale = (value: number) => clamp(value, 0.35, 3);
const clampSemanticLetterSpacing = (value: number) => clamp(value, -2, 24);
const clampSemanticLineHeight = (value: number) => clamp(value, 0.75, 1.8);

const safeCssColorPattern =
  /^(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|[a-z]+)$/i;

const sanitizeCssColor = (value: string | null | undefined) => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return safeCssColorPattern.test(trimmed) ? trimmed : undefined;
};

const getLiveSignalAccentColor = (signalKey: string, intensity: number) => {
  const normalizedSignal = signalKey.toLowerCase();

  if (normalizedSignal.includes("hand") || normalizedSignal.includes("motion")) {
    return intensity > 0.65 ? "#38bdf8" : "#bae6fd";
  }

  if (normalizedSignal.includes("smile") || normalizedSignal.includes("happy")) {
    return intensity > 0.65 ? "#fde047" : "#fef3c7";
  }

  if (normalizedSignal.includes("brow") || normalizedSignal.includes("frown")) {
    return intensity > 0.65 ? "#fb7185" : "#ffe4e6";
  }

  if (normalizedSignal.includes("pose")) {
    return intensity > 0.65 ? "#34d399" : "#d1fae5";
  }

  return intensity > 0.65 ? "#a78bfa" : "#ede9fe";
};

const resolveLivePatchIntensity = (patch: LiveMappingPatch) =>
  clamp(
    typeof patch.intensity === "number" && Number.isFinite(patch.intensity)
      ? patch.intensity
      : 0.5,
    0,
    1,
  );

const getLivePatchSignalKey = (patch: LiveMappingPatch) =>
  normalizeLiveSignalKey(
    patch.signalKey,
    patch.mappingType === "image-layout" || patch.mappingType === "live-visual"
      ? "handMotion"
      : "smile",
  );

const createLiveColorMappingFromPatch = ({
  current,
  patch,
  fallbackDefaultColor,
  liveCaptureId,
}: {
  current?: LiveColorMapping;
  patch: LiveMappingPatch;
  fallbackDefaultColor?: string | null;
  liveCaptureId?: string;
}): LiveColorMapping => {
  const intensity = resolveLivePatchIntensity(patch);
  const base = normalizeLiveColorMapping(
    current,
    fallbackDefaultColor ?? "#ffffff",
  );
  const expressionKey = getLivePatchSignalKey(patch);
  const rule = {
    id: base.rules[0]?.id ?? createId("live_rule"),
    expressionKey,
    threshold: clamp(0.12 + (1 - intensity) * 0.5, 0.05, 0.85),
    color: getLiveSignalAccentColor(expressionKey, intensity),
  };

  return {
    ...base,
    enabled: true,
    managedBy: "semantic-live",
    liveCaptureId,
    sourceBlockId: base.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
    transitionMs: clamp(Math.round(180 + intensity * 520), 120, 1200),
    rules: [
      rule,
      ...base.rules.filter((candidate) => candidate.expressionKey !== expressionKey),
    ].slice(0, 4),
  };
};

const createTextLiveTypographyFromPatch = (
  block: TextBlock,
  patch: LiveMappingPatch,
  liveCaptureId?: string,
) => {
  const data = withDefaultTextBlockData(block.data);
  const liveTypography = data.liveTypography!;
  const intensity = resolveLivePatchIntensity(patch);
  const signalKey = getLivePatchSignalKey(patch);
  const baseFontSize = data.fontSize;
  const minFontSize = clamp(
    Math.round(baseFontSize * (0.78 + intensity * 0.12)),
    8,
    240,
  );
  const maxFontSize = clamp(
    Math.round(baseFontSize * (1.08 + intensity * 1.4)),
    minFontSize,
    320,
  );
  const baseLetterSpacing = data.letterSpacing ?? 0;

  return {
    ...liveTypography,
    enabled: true,
    managedBy: "semantic-live" as const,
    liveCaptureId,
    sourceBlockId: liveTypography.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
    transitionMs: clamp(Math.round(160 + intensity * 420), 120, 1000),
    fontSizeMapping: {
      ...liveTypography.fontSizeMapping,
      enabled: true,
      signalKey,
      min: minFontSize,
      max: maxFontSize,
    },
    letterSpacingMapping: {
      ...liveTypography.letterSpacingMapping,
      enabled: true,
      signalKey,
      min: clamp(baseLetterSpacing - intensity * 1.5, -8, 40),
      max: clamp(baseLetterSpacing + 4 + intensity * 18, -8, 48),
    },
  };
};

const createImageLiveLayoutFromPatch = (
  block: ImageBlock,
  patch: LiveMappingPatch,
  liveCaptureId?: string,
) => {
  const data = withDefaultImageBlockData(block.data);
  const liveLayout = data.liveLayout!;
  const intensity = resolveLivePatchIntensity(patch);
  const signalKey = getLivePatchSignalKey(patch);
  const shouldWave =
    patch.mappingType === "live-visual" ||
    signalKey.toLowerCase().includes("hand") ||
    signalKey.toLowerCase().includes("motion") ||
    signalKey.toLowerCase().includes("wave");
  const minCount = clamp(Math.round(1 + intensity * 2), 1, 36);
  const maxCount = clamp(Math.round(4 + intensity * 24), minCount, 36);

  return {
    ...liveLayout,
    enabled: true,
    managedBy: "semantic-live" as const,
    liveCaptureId,
    sourceBlockId: liveLayout.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
    countSignalKey: signalKey,
    minCount,
    maxCount,
    layoutMode: shouldWave ? "wave" : liveLayout.layoutMode,
    gap: clamp(Math.round(18 - intensity * 10), 2, 96),
    waveSignalKey: signalKey,
    waveAmplitude: clamp(Math.round(16 + intensity * 84), 0, 160),
    transitionMs: clamp(Math.round(160 + intensity * 420), 120, 1000),
  };
};

const resolveTypographyFontFamily = (
  adjustment: TypographyAdjustment,
  currentFontFamily: string,
) => {
  const availableFont = adjustment.fontId
    ? getAvailableFontCatalog().find((font) => font.id === adjustment.fontId)
    : undefined;

  if (availableFont) {
    return availableFont.family;
  }

  const onlineFont = getOnlineFontById(adjustment.fontId);

  if (onlineFont) {
    return getOnlineFontFamilyStack(onlineFont);
  }

  const preset = getSemanticTypographyPreset(adjustment.fontPreset);

  if (preset) {
    return preset.family;
  }

  const allowedFamilies = new Set([
    currentFontFamily,
    ...getAvailableFontCatalog().map((font) => font.family),
    ...semanticTypographyPresets.map((preset) => preset.family),
    ...onlineFontCatalog.map((font) => getOnlineFontFamilyStack(font)),
  ]);

  if (adjustment.fontFamily && allowedFamilies.has(adjustment.fontFamily)) {
    return adjustment.fontFamily;
  }

  return fontCategoryFallbacks[adjustment.fontCategory] ?? currentFontFamily;
};

const getAxisMetrics = (document: DesignDocument, axis: "x" | "y") => {
  const geometry = getGridGeometry(document.canvas, document.grid);

  if (axis === "x") {
    return {
      start: geometry.left,
      step: geometry.columnWidth,
      tracks: document.grid.columns,
    };
  }

  return {
    start: geometry.top,
    step: geometry.rowHeight,
    tracks: document.grid.rows,
  };
};

const positionToIndex = (
  value: number,
  document: DesignDocument,
  axis: "x" | "y",
  maxIndex?: number,
) => {
  const metrics = getAxisMetrics(document, axis);
  const rawIndex = Math.round((value - metrics.start) / metrics.step);
  return clamp(rawIndex, 0, maxIndex ?? metrics.tracks - 1);
};

const indexToPosition = (
  index: number,
  document: DesignDocument,
  axis: "x" | "y",
) => {
  const metrics = getAxisMetrics(document, axis);
  return metrics.start + index * metrics.step;
};

const sizeToSpan = (size: number, document: DesignDocument, axis: "x" | "y") => {
  const metrics = getAxisMetrics(document, axis);
  const rawSpan = Math.round(size / metrics.step);
  const maxSpan = metrics.tracks;
  return clamp(rawSpan, 1, maxSpan);
};

const spanToSize = (span: number, document: DesignDocument, axis: "x" | "y") => {
  const metrics = getAxisMetrics(document, axis);
  return span * metrics.step;
};

const normalizeFrameToGrid = (
  frame: Rect,
  document: DesignDocument,
): Rect => {
  const { grid } = document;
  const geometry = getGridGeometry(document.canvas, grid);
  const gridRight = geometry.left + geometry.width;
  const gridBottom = geometry.top + geometry.height;

  if (!grid.snapToGrid) {
    const minWidth = geometry.columnWidth;
    const minHeight = geometry.rowHeight;
    const maxX = gridRight - minWidth;
    const maxY = gridBottom - minHeight;
    const nextX = clamp(frame.x, geometry.left, maxX);
    const nextY = clamp(frame.y, geometry.top, maxY);
    const nextWidth = clamp(
      frame.width,
      minWidth,
      gridRight - nextX,
    );
    const nextHeight = clamp(
      frame.height,
      minHeight,
      gridBottom - nextY,
    );

    return {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    };
  }

  const widthSpan = sizeToSpan(frame.width, document, "x");
  const heightSpan = sizeToSpan(frame.height, document, "y");
  const startColumn = positionToIndex(
    frame.x,
    document,
    "x",
    grid.columns - widthSpan,
  );
  const startRow = positionToIndex(
    frame.y,
    document,
    "y",
    grid.rows - heightSpan,
  );

  return {
    x: indexToPosition(startColumn, document, "x"),
    y: indexToPosition(startRow, document, "y"),
    width: spanToSize(widthSpan, document, "x"),
    height: spanToSize(heightSpan, document, "y"),
  };
};

const updateDocumentTimestamp = (document: DesignDocument): DesignDocument => ({
  ...document,
  updatedAt: now(),
});

const normalizeSemanticSlotToGrid = (
  slot: SemanticSlot,
  document: DesignDocument,
): SemanticSlot => ({
  ...withDefaultSemanticSlot(slot),
  frame: normalizeFrameToGrid(slot.frame, document),
});

const withDefaultSemanticDocumentData = (
  document: DesignDocument,
): DesignDocument => ({
  ...document,
  compositionMode: document.compositionMode ?? "manual",
  semanticBrief: withDefaultSemanticBrief(document.semanticBrief),
  semanticSlots: (document.semanticSlots ?? []).map((slot) =>
    normalizeSemanticSlotToGrid(slot, document),
  ),
  orchestrationState: withDefaultDocumentOrchestrationState(
    document.orchestrationState,
  ),
});

const withDefaultCanvasLiveColorMapping = (
  canvas: CanvasSettings,
): CanvasSettings => ({
  ...canvas,
  liveColorMapping: canvas.liveColorMapping ?? createDefaultLiveColorMapping(),
});

const withDefaultLiveColorMapping = (block: DesignBlock): DesignBlock => {
  if (
    block.type === "live" ||
    block.type === "ai-generation" ||
    block.type === "pattern"
  ) {
    return block;
  }

  return {
    ...block,
    data: {
      ...block.data,
      liveColorMapping: block.data.liveColorMapping ?? createDefaultLiveColorMapping(),
    },
  } as DesignBlock;
};

const withDefaultAIGenerationData = (block: DesignBlock): DesignBlock => {
  if (block.type !== "ai-generation") {
    return block;
  }

  return {
    ...block,
    data: withDefaultAIGenerationBlockData(block.data),
  };
};

const withDefaultImageData = (block: DesignBlock): DesignBlock => {
  if (block.type !== "image") {
    return block;
  }

  return {
    ...block,
    data: withDefaultImageBlockData(block.data),
  };
};

const withDefaultTextData = (block: DesignBlock): DesignBlock => {
  if (block.type !== "text") {
    return block;
  }

  return {
    ...block,
    data: withDefaultTextBlockData(block.data),
  };
};

const withDefaultPatternData = (block: DesignBlock): DesignBlock => {
  if (block.type !== "pattern") {
    return block;
  }

  return {
    ...block,
    data: withDefaultPatternBlockData(block.data),
  };
};

const withDefaultPatternBlockData = (
  data: Partial<PatternBlockData> | undefined,
): PatternBlockData => normalizePatternBlockData(data);

const normalizeDocument = (document: DesignDocument): DesignDocument => ({
  ...(() => {
    const semanticReadyDocument = withDefaultSemanticDocumentData(document);

    return {
      ...updateDocumentTimestamp(semanticReadyDocument),
      canvas: withDefaultCanvasLiveColorMapping(semanticReadyDocument.canvas),
      semanticBrief: withDefaultSemanticBrief(semanticReadyDocument.semanticBrief),
      semanticSlots: (semanticReadyDocument.semanticSlots ?? []).map((slot) =>
        normalizeSemanticSlotToGrid(slot, semanticReadyDocument),
      ),
      orchestrationState: withDefaultDocumentOrchestrationState(
        semanticReadyDocument.orchestrationState,
      ),
      blocks: normalizeBlockZIndexes(
        semanticReadyDocument.blocks.map((block) => ({
          ...withDefaultAIGenerationData(
            withDefaultImageData(
              withDefaultTextData(
                withDefaultPatternData(withDefaultLiveColorMapping(block)),
              ),
            ),
          ),
          showBorder: block.showBorder ?? true,
          rotation: normalizeBlockRotation(block.rotation),
          blendMode: normalizeBlockBlendMode(block.blendMode),
          clipMode: normalizeBlockClipMode(block.clipMode),
          filter: normalizeBlockVisualFilter(block.filter),
          frame: normalizeFrameToGrid(block.frame, semanticReadyDocument),
        })),
      ),
    };
  })(),
});

const updateHistory = (state: EditorState): EditorState => ({
  ...state,
  history: {
    version: state.history.version + 1,
    canUndo: true,
    canRedo: false,
  },
});

const getSelectedBlockId = (state: EditorState) => state.selection.selectedBlockIds[0];
const getSelectedSemanticSlotId = (state: EditorState) =>
  state.selection.selectedSemanticSlotId;

const getSelectedBlock = (state: EditorState) =>
  state.document.blocks.find((block) => block.id === getSelectedBlockId(state));

const updateBlocks = (
  state: EditorState,
  updater: (blocks: DesignBlock[]) => DesignBlock[],
): EditorState => {
  const nextBlocks = updater(state.document.blocks);
  return updateHistory({
    ...state,
    document: updateDocumentTimestamp({
      ...state.document,
      blocks: nextBlocks,
    }),
  });
};

const updateSemanticSlots = (
  state: EditorState,
  updater: (slots: SemanticSlot[]) => SemanticSlot[],
): EditorState => {
  const nextSlots = updater(state.document.semanticSlots ?? []);
  return updateHistory({
    ...state,
    document: updateDocumentTimestamp({
      ...state.document,
      semanticSlots: nextSlots.map((slot) =>
        normalizeSemanticSlotToGrid(slot, state.document),
      ),
    }),
  });
};

const createTextBlock = (name: string, frame: Rect, zIndex: number): TextBlock => ({
  id: createId("block_text"),
  type: "text",
  name,
  frame,
  zIndex,
  locked: false,
  hidden: false,
  opacity: 1,
  showBorder: true,
  rotation: 0,
  blendMode: "normal",
  clipMode: "frame",
  data: {
    ...withDefaultTextBlockData({
      content: "New Brand Text",
      fontFamily: "Georgia, Times New Roman, serif",
      fontSize: 36,
      fontWeight: 700,
      textColor: "#1f2933",
      backgroundColor: null,
      padding: 0,
      textAlign: "left",
      liveColorMapping: createDefaultLiveColorMapping(),
    }),
  },
});

const createImageBlock = (name: string, frame: Rect, zIndex: number): ImageBlock => ({
  id: createId("block_image"),
  type: "image",
  name,
  frame,
  zIndex,
  locked: false,
  hidden: false,
  opacity: 1,
  showBorder: true,
  rotation: 0,
  blendMode: "normal",
  clipMode: "frame",
  data: withDefaultImageBlockData({
    asset: null,
    fitMode: "contain",
    backgroundColor: "#f8fafc",
    liveColorMapping: createDefaultLiveColorMapping(),
  }),
});

const createAIGenerationBlock = (
  name: string,
  frame: Rect,
  zIndex: number,
): AIGenerationBlock => ({
  id: createId("block_ai"),
  type: "ai-generation",
  name,
  frame,
  zIndex,
  locked: false,
  hidden: false,
  opacity: 1,
  showBorder: true,
  rotation: 0,
  blendMode: "normal",
  clipMode: "frame",
  data: {
    ...withDefaultAIGenerationBlockData({
      prompt: "Describe a future AI-generated visual",
      status: "idle",
      mediaMode: "image",
      durationSeconds: 3,
      placeholderLabel: "AI media block",
    }),
  },
});

const createLiveBlock = (name: string, frame: Rect, zIndex: number): LiveBlock => ({
  id: createId("block_live"),
  type: "live",
  name,
  frame,
  zIndex,
  locked: false,
  hidden: false,
  opacity: 1,
  showBorder: true,
  rotation: 0,
  blendMode: "normal",
  clipMode: "frame",
    data: {
      source: "camera",
      detector: "holistic",
      status: "idle",
      backgroundColor: "#0f172a",
      showVideo: true,
    showLandmarks: true,
    placeholderLabel: "Live camera block",
  },
});

const createPatternBlock = (
  name: string,
  frame: Rect,
  zIndex: number,
  data?: Partial<PatternBlockData>,
): PatternBlock => ({
  id: createId("block_pattern"),
  type: "pattern",
  name,
  frame,
  zIndex,
  locked: false,
  hidden: false,
  opacity: 0.82,
  showBorder: false,
  rotation: 0,
  blendMode: "multiply",
  clipMode: "frame",
  data: withDefaultPatternBlockData({
    patternType: "dot-grid",
    foregroundColor: "#111827",
    backgroundColor: null,
    density: 0.55,
    scale: 18,
    angle: 0,
    ...data,
  }),
});

const createSemanticSlot = (
  document: DesignDocument,
  point?: Point,
): SemanticSlot => {
  const frame = normalizeFrameToGrid(
    {
      x: point?.x ?? getGridGeometry(document.canvas, document.grid).left,
      y: point?.y ?? getGridGeometry(document.canvas, document.grid).top,
      width: spanToSize(4, document, "x"),
      height: spanToSize(3, document, "y"),
    },
    document,
  );

  return {
    id: createId("semantic_slot"),
    name: "Text",
    ...deriveSemanticSlotKindPatch("text"),
    role: "custom",
    frame,
    priority: (document.semanticSlots?.length ?? 0) + 1,
    content: "",
    visualIntent: "",
    lockedByUser: false,
    hidden: false,
    linkedBlockIds: [],
  };
};

const createBlockAtPosition = (
  document: DesignDocument,
  tool: EditorTool,
  point?: Point,
): DesignBlock | null => {
  const blockType: BlockType | null =
    tool === "add-text"
      ? "text"
      : tool === "add-image"
        ? "image"
        : tool === "add-ai"
          ? "ai-generation"
          : tool === "add-live"
            ? "live"
            : null;

  if (!blockType) {
    return null;
  }

  const defaultSpans =
    blockType === "text"
      ? { columns: 4, rows: 3 }
      : blockType === "image"
        ? { columns: 4, rows: 4 }
        : blockType === "ai-generation"
          ? { columns: 6, rows: 5 }
          : { columns: 5, rows: 4 };

  const initialFrame = normalizeFrameToGrid(
    {
      x: point?.x ?? getGridGeometry(document.canvas, document.grid).left,
      y: point?.y ?? getGridGeometry(document.canvas, document.grid).top,
      width: spanToSize(defaultSpans.columns, document, "x"),
      height: spanToSize(defaultSpans.rows, document, "y"),
    },
    document,
  );

  const zIndex =
    document.blocks.length > 0
      ? Math.max(...document.blocks.map((block) => block.zIndex)) + 1
      : 1;

  if (blockType === "text") {
    return createTextBlock("Text Block", initialFrame, zIndex);
  }

  if (blockType === "image") {
    return createImageBlock("Image Block", initialFrame, zIndex);
  }

  if (blockType === "ai-generation") {
    return createAIGenerationBlock("AI Generation Block", initialFrame, zIndex);
  }

  return createLiveBlock("Live Block", initialFrame, zIndex);
};

const resizeFrame = (
  frame: Rect,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
): Rect => {
  let nextFrame = { ...frame };

  if (handle.includes("w")) {
    nextFrame = {
      ...nextFrame,
      x: frame.x + deltaX,
      width: frame.width - deltaX,
    };
  }

  if (handle.includes("e")) {
    nextFrame = {
      ...nextFrame,
      width: frame.width + deltaX,
    };
  }

  if (handle.includes("n")) {
    nextFrame = {
      ...nextFrame,
      y: frame.y + deltaY,
      height: frame.height - deltaY,
    };
  }

  if (handle.includes("s")) {
    nextFrame = {
      ...nextFrame,
      height: frame.height + deltaY,
    };
  }

  return nextFrame;
};

const setInteractionIdle = (state: EditorState): EditorState => ({
  ...state,
  ui: {
    ...state.ui,
    interaction: {
      type: "idle",
    },
  },
});

const updateBlockFrame = (
  state: EditorState,
  blockId: string,
  frame: Rect,
): EditorState =>
  updateBlocks(state, (blocks) =>
    blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            frame: normalizeFrameToGrid(frame, state.document),
          }
        : block,
    ),
  );

const updateSelectedBlockData = <TBlock extends DesignBlock>(
  state: EditorState,
  matcher: (block: DesignBlock) => block is TBlock,
  updater: (block: TBlock) => TBlock,
): EditorState => {
  const selectedBlockId = getSelectedBlockId(state);

  if (!selectedBlockId) {
    return state;
  }

  return updateBlocks(state, (blocks) =>
    blocks.map((block) => {
      if (block.id !== selectedBlockId || !matcher(block)) {
        return block;
      }

      return updater(block);
    }),
  );
};

const updateBlockById = (
  state: EditorState,
  blockId: string,
  updater: (block: DesignBlock) => DesignBlock,
): EditorState =>
  updateBlocks(state, (blocks) =>
    blocks.map((block) => (block.id === blockId ? updater(block) : block)),
  );

const updateSemanticSlotById = (
  state: EditorState,
  slotId: string,
  updater: (slot: SemanticSlot) => SemanticSlot,
): EditorState =>
  updateSemanticSlots(state, (slots) =>
    slots.map((slot) => (slot.id === slotId ? updater(slot) : slot)),
  );

const findTypographyTargetBlockId = (
  blocks: DesignBlock[],
  slots: SemanticSlot[],
  adjustment: TypographyAdjustment,
) => {
  if (
    adjustment.targetBlockId &&
    blocks.some(
      (block) =>
        block.id === adjustment.targetBlockId &&
        block.type === "text" &&
        !block.locked,
    )
  ) {
    return adjustment.targetBlockId;
  }

  const slot = slots.find((candidate) => candidate.id === adjustment.targetSlotId);

  return (slot?.linkedBlockIds ?? []).find((blockId) =>
    blocks.some(
      (block) => block.id === blockId && block.type === "text" && !block.locked,
    ),
  );
};

const applyTypographyAdjustmentToTextBlock = (
  block: TextBlock,
  adjustment: TypographyAdjustment,
): TextBlock => {
  const baseData = withDefaultTextBlockData(block.data);
  const fontFamily = resolveTypographyFontFamily(
    adjustment,
    baseData.fontFamily,
  );
  const fontSizeScale =
    typeof adjustment.fontSizeScale === "number"
      ? clampSemanticFontSizeScale(adjustment.fontSizeScale)
      : 1;
  const fontSize =
    typeof adjustment.fontSizeScale === "number"
      ? clampSemanticFontSize(baseData.fontSize * fontSizeScale)
      : baseData.fontSize;
  const preset = getSemanticTypographyPreset(adjustment.fontPreset);
  const textColor = sanitizeCssColor(adjustment.textColor) ?? undefined;
  const backgroundColor = sanitizeCssColor(adjustment.backgroundColor);

  return {
    ...block,
    data: {
      ...baseData,
      fontFamily,
      fontSize,
      ...(adjustment.fontWeight !== undefined
        ? { fontWeight: adjustment.fontWeight }
        : preset?.defaultWeight !== undefined
          ? { fontWeight: preset.defaultWeight }
          : undefined),
      ...(typeof adjustment.letterSpacing === "number"
        ? { letterSpacing: clampSemanticLetterSpacing(adjustment.letterSpacing) }
        : preset?.defaultLetterSpacing !== undefined
          ? { letterSpacing: preset.defaultLetterSpacing }
          : undefined),
      ...(typeof adjustment.lineHeight === "number"
        ? { lineHeight: clampSemanticLineHeight(adjustment.lineHeight) }
        : preset?.defaultLineHeight !== undefined
          ? { lineHeight: preset.defaultLineHeight }
          : undefined),
      ...(textColor !== undefined ? { textColor } : undefined),
      ...(backgroundColor !== undefined
        ? { backgroundColor }
        : undefined),
      ...(adjustment.alignment
        ? { textAlign: adjustment.alignment }
        : undefined),
    },
  };
};

const createPlannedBlock = (
  specification: OrchestrationPlannedBlock,
  document: DesignDocument,
): DesignBlock => {
  const base = {
    id: specification.id,
    name: specification.name,
    frame: normalizeFrameToGrid(specification.frame, document),
    zIndex: 1,
    locked: specification.locked ?? false,
    hidden: specification.hidden ?? false,
    opacity: specification.opacity ?? 1,
    showBorder: specification.showBorder ?? true,
    rotation: normalizeBlockRotation(specification.rotation),
    blendMode: normalizeBlockBlendMode(specification.blendMode),
    clipMode: normalizeBlockClipMode(specification.clipMode),
    filter: normalizeBlockVisualFilter(specification.filter),
  };

  if (specification.type === "text") {
    return {
      ...base,
      type: "text",
      data: withDefaultTextBlockData({
        content: specification.data.content,
        fontFamily:
          specification.data.fontFamily ?? "Georgia, Times New Roman, serif",
        fontSize: specification.data.fontSize ?? 32,
        fontWeight: specification.data.fontWeight ?? 700,
        textColor: specification.data.textColor ?? "#111827",
        backgroundColor:
          specification.data.backgroundColor === undefined
            ? null
            : specification.data.backgroundColor,
        padding: specification.data.padding ?? 0,
        textAlign: specification.data.textAlign ?? "left",
        letterSpacing: specification.data.letterSpacing,
        lineHeight: specification.data.lineHeight,
      }),
    };
  }

  if (specification.type === "image") {
    return {
      ...base,
      type: "image",
      data: withDefaultImageBlockData({
        asset: specification.data.asset ?? null,
        fitMode: specification.data.fitMode ?? "cover",
        backgroundColor:
          specification.data.backgroundColor === undefined
            ? "#f8fafc"
            : specification.data.backgroundColor,
      }),
    };
  }

  if (specification.type === "ai-generation") {
    return {
      ...base,
      type: "ai-generation",
      data: withDefaultAIGenerationBlockData({
        prompt: specification.data.prompt,
        negativePrompt: specification.data.negativePrompt,
        status: "idle",
        mediaMode: specification.data.mediaMode ?? "image",
        generationRatioMode:
          specification.data.generationRatioMode ?? "follow-block",
        resultFitMode: specification.data.resultFitMode ?? "contain",
        matchCanvasBackground:
          specification.data.matchCanvasBackground ?? false,
        placeholderLabel:
          specification.data.placeholderLabel ?? "AI media block",
        durationSeconds: specification.data.durationSeconds ?? 3,
      }),
    };
  }

  if (specification.type === "pattern") {
    return {
      ...base,
      type: "pattern",
      showBorder: specification.showBorder ?? false,
      data: withDefaultPatternBlockData(specification.data),
    };
  }

  return {
    ...base,
    type: "live",
    data: {
      source: "camera",
      detector: specification.data.detector ?? "holistic",
      status: "idle",
      backgroundColor: specification.data.backgroundColor ?? "#0f172a",
      showVideo: specification.data.showVideo ?? true,
      showLandmarks: specification.data.showLandmarks ?? false,
      placeholderLabel: "Live camera block",
    },
  };
};

const normalizeBlockZIndexes = (blocks: DesignBlock[]) => {
  const sortedBlocks = [...blocks].sort((left, right) => {
    if (left.zIndex !== right.zIndex) {
      return left.zIndex - right.zIndex;
    }

    return blocks.findIndex((block) => block.id === left.id) -
      blocks.findIndex((block) => block.id === right.id);
  });
  const zIndexMap = new Map<string, number>(
    sortedBlocks.map((block, index) => [block.id, index + 1]),
  );

  return blocks.map((block) => ({
    ...block,
    zIndex: zIndexMap.get(block.id) ?? block.zIndex,
  }));
};

const moveBlockLayer = (
  blocks: DesignBlock[],
  blockId: string,
  direction: LayerMoveDirection,
) => {
  const normalizedBlocks = normalizeBlockZIndexes(blocks);
  const orderedBlocks = [...normalizedBlocks].sort((left, right) => left.zIndex - right.zIndex);
  const blockIndex = orderedBlocks.findIndex((block) => block.id === blockId);

  if (blockIndex < 0) {
    return normalizedBlocks;
  }

  const targetIndex =
    direction === "up"
      ? Math.min(blockIndex + 1, orderedBlocks.length - 1)
      : Math.max(blockIndex - 1, 0);

  if (targetIndex === blockIndex) {
    return normalizedBlocks;
  }

  const nextOrderedBlocks = [...orderedBlocks];
  const [movedBlock] = nextOrderedBlocks.splice(blockIndex, 1);
  nextOrderedBlocks.splice(targetIndex, 0, movedBlock);

  const zIndexMap = new Map<string, number>(
    nextOrderedBlocks.map((block, index) => [block.id, index + 1]),
  );

  return normalizedBlocks.map((block) => ({
    ...block,
    zIndex: zIndexMap.get(block.id) ?? block.zIndex,
  }));
};

const normalizeSemanticSlotPriorities = (slots: SemanticSlot[]) => {
  const sortedSlots = [...slots].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return slots.findIndex((slot) => slot.id === left.id) -
      slots.findIndex((slot) => slot.id === right.id);
  });
  const priorityMap = new Map<string, number>(
    sortedSlots.map((slot, index) => [slot.id, index + 1]),
  );

  return slots.map((slot) => ({
    ...slot,
    priority: priorityMap.get(slot.id) ?? slot.priority,
  }));
};

const syncLinkedBlockZIndexesWithSemanticSlots = (
  blocks: DesignBlock[],
  slots: SemanticSlot[],
) => {
  const normalizedSlots = normalizeSemanticSlotPriorities(slots);
  const slotPriorityByBlockId = new Map<string, number>();

  normalizedSlots.forEach((slot) => {
    (slot.linkedBlockIds ?? []).forEach((blockId) => {
      slotPriorityByBlockId.set(blockId, slot.priority);
    });
  });

  if (slotPriorityByBlockId.size === 0) {
    return normalizeBlockZIndexes(blocks);
  }

  const orderedBlocks = [...blocks].sort((left, right) => {
    const leftPriority = slotPriorityByBlockId.get(left.id);
    const rightPriority = slotPriorityByBlockId.get(right.id);

    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) {
        return -1;
      }

      if (rightPriority === undefined) {
        return 1;
      }

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
    }

    if (left.zIndex !== right.zIndex) {
      return left.zIndex - right.zIndex;
    }

    return blocks.findIndex((block) => block.id === left.id) -
      blocks.findIndex((block) => block.id === right.id);
  });
  const zIndexMap = new Map<string, number>(
    orderedBlocks.map((block, index) => [block.id, index + 1]),
  );

  return blocks.map((block) => ({
    ...block,
    zIndex: zIndexMap.get(block.id) ?? block.zIndex,
  }));
};

const syncSemanticOutputBlockFramesWithSemanticSlots = (
  blocks: DesignBlock[],
  slots: SemanticSlot[],
) => {
  const slotFrameByLinkedBlockId = new Map<string, Rect>();

  slots.forEach((slot) => {
    if (slot.hidden) {
      return;
    }

    (slot.linkedBlockIds ?? []).forEach((blockId) => {
      slotFrameByLinkedBlockId.set(blockId, slot.frame);
    });
  });

  if (slotFrameByLinkedBlockId.size === 0) {
    return blocks;
  }

  return blocks.map((block) => {
    const targetFrame = slotFrameByLinkedBlockId.get(block.id);

    if (!targetFrame || block.locked || block.type === "pattern") {
      return block;
    }

    if (
      block.frame.x === targetFrame.x &&
      block.frame.y === targetFrame.y &&
      block.frame.width === targetFrame.width &&
      block.frame.height === targetFrame.height
    ) {
      return block;
    }

    return {
      ...block,
      frame: targetFrame,
    };
  });
};

export const createSemanticFrameSynchronizedDocument = (
  document: DesignDocument,
): DesignDocument => {
  const semanticSlots = document.semanticSlots ?? [];

  return {
    ...document,
    blocks: syncLinkedBlockZIndexesWithSemanticSlots(
      syncSemanticOutputBlockFramesWithSemanticSlots(
        document.blocks,
        semanticSlots,
      ),
      semanticSlots,
    ),
    semanticSlots: normalizeSemanticSlotPriorities(semanticSlots),
  };
};

const moveSemanticSlotLayer = (
  slots: SemanticSlot[],
  slotId: string,
  direction: LayerMoveDirection,
) => {
  const normalizedSlots = normalizeSemanticSlotPriorities(slots);
  const orderedSlots = [...normalizedSlots].sort(
    (left, right) => left.priority - right.priority,
  );
  const slotIndex = orderedSlots.findIndex((slot) => slot.id === slotId);

  if (slotIndex < 0) {
    return normalizedSlots;
  }

  const targetIndex =
    direction === "up"
      ? Math.min(slotIndex + 1, orderedSlots.length - 1)
      : Math.max(slotIndex - 1, 0);

  if (targetIndex === slotIndex) {
    return normalizedSlots;
  }

  const nextOrderedSlots = [...orderedSlots];
  const [movedSlot] = nextOrderedSlots.splice(slotIndex, 1);
  nextOrderedSlots.splice(targetIndex, 0, movedSlot);
  const priorityMap = new Map<string, number>(
    nextOrderedSlots.map((slot, index) => [slot.id, index + 1]),
  );

  return normalizedSlots.map((slot) => ({
    ...slot,
    priority: priorityMap.get(slot.id) ?? slot.priority,
  }));
};

const applyOrchestrationPlanToDocument = (
  state: EditorState,
  plan: OrchestrationPlan,
): EditorState => {
  const lockedBlockIds = new Set(
    state.document.blocks.filter((block) => block.locked).map((block) => block.id),
  );
  let nextBlocks = [...state.document.blocks];
  let nextSlots = [...(state.document.semanticSlots ?? [])];
  const slotsWithFreshBlockOps = new Set<string>();

  for (const blockOp of plan.blockOps) {
    if (blockOp.type === "replace-linked-blocks") {
      const slotIndex = nextSlots.findIndex((slot) => slot.id === blockOp.slotId);

      if (slotIndex < 0) {
        continue;
      }

      const slot = nextSlots[slotIndex];

      if (slot.lockedByUser) {
        continue;
      }

      if ((slot.linkedBlockIds ?? []).some((blockId) => lockedBlockIds.has(blockId))) {
        continue;
      }

      nextBlocks = nextBlocks.filter(
        (block) => !(slot.linkedBlockIds ?? []).includes(block.id),
      );

      const plannedBlocks = blockOp.blocks.map((block) =>
        ({
          ...createPlannedBlock(block, state.document),
          zIndex: slot.priority,
        }),
      );

      nextBlocks = [...nextBlocks, ...plannedBlocks];
      nextSlots[slotIndex] = {
        ...slot,
        linkedBlockIds: plannedBlocks.map((block) => block.id),
      };
      slotsWithFreshBlockOps.add(slot.id);
      continue;
    }

    if (blockOp.type === "delete") {
      if (lockedBlockIds.has(blockOp.blockId)) {
        continue;
      }

      nextBlocks = nextBlocks.filter((block) => block.id !== blockOp.blockId);
      nextSlots = nextSlots.map((slot) => ({
        ...slot,
        linkedBlockIds: (slot.linkedBlockIds ?? []).filter(
          (linkedBlockId) => linkedBlockId !== blockOp.blockId,
        ),
      }));
      continue;
    }

    nextBlocks = nextBlocks.map((block) => {
      if (block.id !== blockOp.blockId || block.locked) {
        return block;
      }

      return {
        ...block,
        ...(typeof blockOp.patch.name === "string"
          ? { name: blockOp.patch.name }
          : undefined),
        ...(blockOp.patch.frame ? { frame: blockOp.patch.frame } : undefined),
        ...(typeof blockOp.patch.hidden === "boolean"
          ? { hidden: blockOp.patch.hidden }
          : undefined),
        ...(typeof blockOp.patch.opacity === "number"
          ? { opacity: blockOp.patch.opacity }
          : undefined),
        ...(typeof blockOp.patch.showBorder === "boolean"
          ? { showBorder: blockOp.patch.showBorder }
          : undefined),
      } as DesignBlock;
    });
  }

  for (const blockPatch of plan.blockPatches) {
    nextBlocks = nextBlocks.map((block) => {
      if (block.id !== blockPatch.blockId || block.locked) {
        return block;
      }

      return {
        ...block,
        ...(typeof blockPatch.patch.name === "string"
          ? { name: blockPatch.patch.name }
          : undefined),
      } as DesignBlock;
    });
  }

  if (plan.slotLinks.length > 0) {
    const existingBlockIds = new Set(nextBlocks.map((block) => block.id));
    nextSlots = nextSlots.map((slot) => {
      const linked = plan.slotLinks.find((slotLink) => slotLink.slotId === slot.id);

      if (!linked || slot.lockedByUser) {
        return slot;
      }

      if (slotsWithFreshBlockOps.has(slot.id)) {
        return {
          ...slot,
          linkedBlockIds: (slot.linkedBlockIds ?? []).filter((blockId) =>
            existingBlockIds.has(blockId),
          ),
        };
      }

      const mergedLinkedBlockIds = [
        ...(slot.linkedBlockIds ?? []),
        ...linked.linkedBlockIds,
      ].filter((blockId, index, allBlockIds) => allBlockIds.indexOf(blockId) === index);

      return {
        ...slot,
        linkedBlockIds: mergedLinkedBlockIds.filter((blockId) =>
          existingBlockIds.has(blockId),
        ),
      };
    });
  }

  if (plan.typographyAdjustments.length > 0) {
    for (const adjustment of plan.typographyAdjustments) {
      const targetBlockId = findTypographyTargetBlockId(
        nextBlocks,
        nextSlots,
        adjustment,
      );

      if (!targetBlockId) {
        continue;
      }

      nextBlocks = nextBlocks.map((block) =>
        block.id === targetBlockId && block.type === "text" && !block.locked
          ? applyTypographyAdjustmentToTextBlock(block, adjustment)
          : block,
      );
    }
  }

  const nextDocument = {
    ...state.document,
    canvas: {
      ...state.document.canvas,
      ...(typeof plan.canvasPatch?.backgroundColor === "string"
        ? { backgroundColor: plan.canvasPatch.backgroundColor }
        : undefined),
    },
    blocks: syncLinkedBlockZIndexesWithSemanticSlots(
      syncSemanticOutputBlockFramesWithSemanticSlots(nextBlocks, nextSlots),
      nextSlots,
    ),
    semanticSlots: normalizeSemanticSlotPriorities(nextSlots),
  };

  return updateHistory({
    ...state,
    document: updateDocumentTimestamp(nextDocument),
  });
};

const resolveLayoutPatchTargetBlockIds = (
  blocks: DesignBlock[],
  slots: SemanticSlot[],
  patch: OrchestrationLayoutPatch,
) => {
  if (patch.targetBlockId) {
    const linkedSlot = patch.targetSlotId
      ? slots.find((candidate) => candidate.id === patch.targetSlotId)
      : slots.find((candidate) =>
          (candidate.linkedBlockIds ?? []).includes(patch.targetBlockId ?? ""),
        );

    if (linkedSlot?.lockedByUser) {
      return [];
    }

    return blocks.some((block) => block.id === patch.targetBlockId)
      ? [patch.targetBlockId]
      : [];
  }

  if (!patch.targetSlotId) {
    return [];
  }

  const slot = slots.find((candidate) => candidate.id === patch.targetSlotId);

  if (!slot || slot.lockedByUser) {
    return [];
  }

  return (slot.linkedBlockIds ?? []).filter((blockId) =>
    blocks.some((block) => block.id === blockId),
  );
};

const applyLayoutPatchesToDocument = (
  state: EditorState,
  patches: OrchestrationLayoutPatch[],
): EditorState => {
  if (patches.length === 0) {
    return state;
  }

  const slots = state.document.semanticSlots ?? [];
  const slotById = new Map(slots.map((slot) => [slot.id, withDefaultSemanticSlot(slot)]));
  let nextBlocks = [...state.document.blocks];
  let nextSlots = slots.map((slot) => withDefaultSemanticSlot(slot));

  for (const patch of patches) {
    const targetBlockIds = resolveLayoutPatchTargetBlockIds(
      nextBlocks,
      nextSlots,
      patch,
    );

    const targetSlot =
      (patch.targetSlotId ? slotById.get(patch.targetSlotId) : undefined) ??
      (patch.targetBlockId
        ? nextSlots.find((slot) =>
            (slot.linkedBlockIds ?? []).includes(patch.targetBlockId ?? ""),
          )
        : undefined);
    const canApplyFramePatch =
      Boolean(patch.frame) && Boolean(targetSlot?.canMove) && Boolean(targetSlot?.canResize);
    const normalizedPatchFrame =
      patch.frame && canApplyFramePatch
        ? normalizeFrameToGrid(patch.frame, state.document)
        : undefined;

    if (targetBlockIds.length === 0 && !normalizedPatchFrame) {
      continue;
    }

    if (normalizedPatchFrame && targetSlot?.id) {
      nextSlots = nextSlots.map((slot) =>
        slot.id === targetSlot.id && !slot.lockedByUser
          ? withDefaultSemanticSlot({
              ...slot,
              frame: normalizedPatchFrame,
            })
          : slot,
      );
      slotById.set(
        targetSlot.id,
        withDefaultSemanticSlot({
          ...targetSlot,
          frame: normalizedPatchFrame,
        }),
      );
    }

    nextBlocks = nextBlocks.map((block) => {
      if (!targetBlockIds.includes(block.id) || block.locked) {
        return block;
      }

      return withDefaultBlockVisualStyle({
        ...block,
        ...(normalizedPatchFrame ? { frame: normalizedPatchFrame } : undefined),
        ...(typeof patch.rotation === "number" && targetSlot?.canRotate
          ? { rotation: patch.rotation }
          : undefined),
        ...(typeof patch.zIndex === "number" && targetSlot?.canOverlap
          ? { zIndex: Math.round(patch.zIndex) }
          : undefined),
        ...(typeof patch.opacity === "number" ? { opacity: patch.opacity } : undefined),
        ...(patch.clipMode && (targetSlot?.canCrop || targetSlot?.canOverlap)
          ? { clipMode: patch.clipMode }
          : undefined),
        ...(patch.blendMode && targetSlot?.canOverlap
          ? { blendMode: patch.blendMode }
          : undefined),
      } as DesignBlock);
    });
  }

  return updateHistory({
    ...state,
    document: updateDocumentTimestamp({
      ...state.document,
      blocks: syncLinkedBlockZIndexesWithSemanticSlots(
        syncSemanticOutputBlockFramesWithSemanticSlots(nextBlocks, nextSlots),
        nextSlots,
      ),
      semanticSlots: nextSlots,
    }),
  });
};

const getDecorativeOpFrame = (
  op: OrchestrationDecorativeOp,
  sourceBlock: DesignBlock | undefined,
  sourceSlot: SemanticSlot | undefined,
  document: DesignDocument,
) =>
  normalizeFrameToGrid(
    op.targetFrame ??
      sourceBlock?.frame ??
      sourceSlot?.frame ?? {
        x: getGridGeometry(document.canvas, document.grid).left,
        y: getGridGeometry(document.canvas, document.grid).top,
        width: spanToSize(4, document, "x"),
        height: spanToSize(3, document, "y"),
      },
    document,
  );

const createDecorativeBlocksFromOps = (
  document: DesignDocument,
  ops: OrchestrationDecorativeOp[],
) => {
  const slots = document.semanticSlots ?? [];
  const blockById = new Map(document.blocks.map((block) => [block.id, block]));
  const maxZIndex =
    document.blocks.length > 0
      ? Math.max(...document.blocks.map((block) => block.zIndex))
      : 0;
  const createdBlocks: DesignBlock[] = [];

  ops.forEach((op, opIndex) => {
    const sourceSlot = op.sourceSlotId
      ? slots.find((slot) => slot.id === op.sourceSlotId)
      : undefined;
    const sourceBlock =
      (op.sourceBlockId ? blockById.get(op.sourceBlockId) : undefined) ??
      (sourceSlot?.linkedBlockIds ?? [])
        .map((blockId) => blockById.get(blockId))
        .find(Boolean);
    const frame = getDecorativeOpFrame(op, sourceBlock, sourceSlot, document);
    const zIndex = maxZIndex + createdBlocks.length + 1;

    if (op.type === "create-pattern") {
      createdBlocks.push(
        createPatternBlock("AI Poster Texture", frame, zIndex, {
          patternType: op.patternType ?? "halftone",
          foregroundColor: op.treatment.toLowerCase().includes("white")
            ? "#f8fafc"
            : "#111827",
          backgroundColor: null,
          density: Math.max(0.2, Math.min(0.9, 0.45 + op.riskLevel * 0.35)),
          scale: op.patternType === "line-specimen" ? 10 : 16,
          angle: op.treatment.toLowerCase().includes("diagonal") ? -18 : 0,
          label: op.patternType ?? "poster texture",
        }),
      );
      return;
    }

    if (op.type === "duplicate-text") {
      const sourceText =
        sourceBlock?.type === "text"
          ? sourceBlock.data.content
          : sourceSlot?.content || sourceSlot?.name || "POSTER";
      const repeatCount = Math.max(2, Math.min(12, Math.round(op.count ?? 5)));
      const repeatedText = Array.from({ length: repeatCount }, () => sourceText)
        .join(" / ");
      const textBlock = createTextBlock("AI Text Repeat", frame, zIndex);
      createdBlocks.push({
        ...textBlock,
        showBorder: false,
        opacity: Math.max(0.18, Math.min(0.62, 0.22 + op.riskLevel * 0.35)),
        rotation: op.treatment.toLowerCase().includes("diagonal") ? -12 : 0,
        blendMode: "multiply",
        data: withDefaultTextBlockData({
          ...textBlock.data,
          content: repeatedText,
          fontSize: Math.max(10, Math.min(42, frame.height / 3)),
          fontWeight: 800,
          textColor: "#111827",
          backgroundColor: null,
          letterSpacing: 4,
          lineHeight: 0.82,
        }),
      });
      return;
    }

    if (
      (op.type === "duplicate-image" || op.type === "image-slice") &&
      sourceBlock &&
      (sourceBlock.type === "image" || sourceBlock.type === "ai-generation")
    ) {
      const src =
        sourceBlock.type === "image"
          ? sourceBlock.data.asset?.src
          : sourceBlock.type === "ai-generation"
            ? sourceBlock.data.resultImageUrl ?? sourceBlock.data.resultPreviewUrl
            : undefined;

      if (!src) {
        return;
      }

      const imageBlock = createImageBlock(
        op.type === "image-slice" ? "AI Image Slice" : "AI Image Repeat",
        frame,
        zIndex,
      );
      createdBlocks.push({
        ...imageBlock,
        showBorder: false,
        opacity: Math.max(0.35, Math.min(0.9, 0.55 + op.riskLevel * 0.25)),
        rotation: op.type === "image-slice" ? -6 + opIndex * 3 : 0,
        blendMode: op.type === "image-slice" ? "multiply" : "normal",
        data: withDefaultImageBlockData({
          asset: {
            assetId:
              sourceBlock.type === "image"
                ? sourceBlock.data.asset?.assetId ?? `${sourceBlock.id}_decorative`
                : sourceBlock.data.resultAssetId ?? `${sourceBlock.id}_decorative`,
            kind: "raster",
            src,
            mimeType:
              sourceBlock.type === "image"
                ? sourceBlock.data.asset?.mimeType ?? "image/png"
                : sourceBlock.data.resultMimeType ?? "image/png",
          },
          fitMode: "cover",
          backgroundColor: null,
        }),
      });
    }
  });

  return createdBlocks;
};

const applyDecorativeOpsToDocument = (
  state: EditorState,
  ops: OrchestrationDecorativeOp[],
): EditorState => {
  const decorativeBlocks = createDecorativeBlocksFromOps(state.document, ops);

  if (decorativeBlocks.length === 0) {
    return state;
  }

  return updateHistory({
    ...state,
    document: updateDocumentTimestamp({
      ...state.document,
      blocks: normalizeBlockZIndexes([...state.document.blocks, ...decorativeBlocks]),
    }),
  });
};

const resolveLivePatchTargetBlockIds = (
  blocks: DesignBlock[],
  slots: SemanticSlot[],
  patch: LiveMappingPatch,
) => {
  if (patch.targetBlockId) {
    return blocks.some((block) => block.id === patch.targetBlockId)
      ? [patch.targetBlockId]
      : [];
  }

  if (!patch.targetSlotId) {
    return [];
  }

  const slot = slots.find((candidate) => candidate.id === patch.targetSlotId);
  const existingBlockIds = new Set(blocks.map((block) => block.id));
  const linkedBlockIds = (slot?.linkedBlockIds ?? []).filter((blockId) =>
    existingBlockIds.has(blockId),
  );

  if (linkedBlockIds.length > 0) {
    return linkedBlockIds;
  }

  if (!slot) {
    return [];
  }

  const expectedType =
    patch.mappingType === "text-typography"
      ? "text"
      : patch.mappingType === "image-layout"
        ? "image"
        : undefined;
  const overlappingBlocks = blocks.filter((block) => {
    if (block.locked || block.hidden) {
      return false;
    }

    if (expectedType && block.type !== expectedType) {
      return false;
    }

    const horizontalOverlap =
      Math.min(block.frame.x + block.frame.width, slot.frame.x + slot.frame.width) -
      Math.max(block.frame.x, slot.frame.x);
    const verticalOverlap =
      Math.min(block.frame.y + block.frame.height, slot.frame.y + slot.frame.height) -
      Math.max(block.frame.y, slot.frame.y);
    const overlapArea = Math.max(horizontalOverlap, 0) * Math.max(verticalOverlap, 0);
    const slotArea = Math.max(slot.frame.width * slot.frame.height, 1);

    return overlapArea / slotArea > 0.35;
  });

  return overlappingBlocks.map((block) => block.id);
};

const applyLiveMappingPatchesToDocument = (
  state: EditorState,
  patches: LiveMappingPatch[],
  options?: {
    replaceExisting?: boolean;
    forceReplaceExistingSemanticLiveRules?: boolean;
    liveCaptureId?: string;
    previousPatches?: LiveMappingPatch[];
  },
): EditorState => {
  if (patches.length === 0 && !options?.replaceExisting) {
    return state;
  }

  let nextCanvas = state.document.canvas;
  let nextBlocks = state.document.blocks;
  const semanticSlots = state.document.semanticSlots ?? [];

  if (options?.replaceExisting) {
    const shouldForceReplace = options.forceReplaceExistingSemanticLiveRules === true;
    const previousPatches = options.previousPatches ?? [];
    const previousTargetBlockIds = shouldForceReplace
      ? new Set(nextBlocks.map((block) => block.id))
      : new Set(
          previousPatches.flatMap((patch) =>
            resolveLivePatchTargetBlockIds(nextBlocks, semanticSlots, patch),
          ),
        );
    const shouldClearCanvasMapping =
      shouldForceReplace ||
      previousPatches.some((patch) => patch.mappingType === "canvas-color") ||
      nextCanvas.liveColorMapping?.managedBy === "semantic-live";

    if (shouldClearCanvasMapping) {
      nextCanvas = {
        ...nextCanvas,
        liveColorMapping: undefined,
      };
    }

    nextBlocks = nextBlocks.map((block) => {
      if (block.type === "text") {
        const nextData = { ...block.data };
        let didChange = false;

        if (
          shouldForceReplace ||
          nextData.liveTypography?.managedBy === "semantic-live" ||
          previousTargetBlockIds.has(block.id)
        ) {
          nextData.liveTypography = undefined;
          didChange = true;
        }

        if (
          shouldForceReplace ||
          nextData.liveColorMapping?.managedBy === "semantic-live" ||
          previousTargetBlockIds.has(block.id)
        ) {
          nextData.liveColorMapping = undefined;
          didChange = true;
        }

        return didChange
          ? {
              ...block,
              data: withDefaultTextBlockData(nextData),
            }
          : block;
      }

      if (block.type === "image") {
        const nextData = { ...block.data };
        let didChange = false;

        if (
          shouldForceReplace ||
          nextData.liveLayout?.managedBy === "semantic-live" ||
          previousTargetBlockIds.has(block.id)
        ) {
          nextData.liveLayout = undefined;
          didChange = true;
        }

        if (
          shouldForceReplace ||
          nextData.liveColorMapping?.managedBy === "semantic-live" ||
          previousTargetBlockIds.has(block.id)
        ) {
          nextData.liveColorMapping = undefined;
          didChange = true;
        }

        return didChange
          ? {
              ...block,
              data: withDefaultImageBlockData(nextData),
            }
          : block;
      }

      return block;
    });
  }

  patches.forEach((patch) => {
    if (patch.mappingType === "canvas-color") {
      nextCanvas = {
        ...nextCanvas,
        liveColorMapping: createLiveColorMappingFromPatch({
          current: nextCanvas.liveColorMapping,
          patch,
          fallbackDefaultColor: nextCanvas.backgroundColor,
          liveCaptureId: options?.liveCaptureId,
        }),
      };
      return;
    }

    const targetBlockIds = resolveLivePatchTargetBlockIds(
      nextBlocks,
      semanticSlots,
      patch,
    );

    if (targetBlockIds.length === 0) {
      return;
    }

    const targetBlockIdSet = new Set(targetBlockIds);
    nextBlocks = nextBlocks.map((block) => {
      if (!targetBlockIdSet.has(block.id) || block.locked) {
        return block;
      }

      if (block.type === "text") {
        if (
          patch.mappingType === "text-typography" ||
          patch.mappingType === "live-visual"
        ) {
          return {
            ...block,
            data: withDefaultTextBlockData({
              ...block.data,
              liveTypography: createTextLiveTypographyFromPatch(
                block,
                patch,
                options?.liveCaptureId,
              ),
            }),
          };
        }

        if (patch.mappingType === "block-color") {
          return {
            ...block,
            data: withDefaultTextBlockData({
              ...block.data,
              liveColorMapping: createLiveColorMappingFromPatch({
                current: block.data.liveColorMapping,
                patch,
                fallbackDefaultColor: block.data.backgroundColor ?? "#ffffff",
                liveCaptureId: options?.liveCaptureId,
              }),
            }),
          };
        }
      }

      if (block.type === "image") {
        if (
          patch.mappingType === "image-layout" ||
          patch.mappingType === "live-visual"
        ) {
          return {
            ...block,
            data: withDefaultImageBlockData({
              ...block.data,
              liveLayout: createImageLiveLayoutFromPatch(
                block,
                patch,
                options?.liveCaptureId,
              ),
            }),
          };
        }

        if (patch.mappingType === "block-color") {
          return {
            ...block,
            data: withDefaultImageBlockData({
              ...block.data,
              liveColorMapping: createLiveColorMappingFromPatch({
                current: block.data.liveColorMapping,
                patch,
                fallbackDefaultColor: block.data.backgroundColor ?? "#f8fafc",
                liveCaptureId: options?.liveCaptureId,
              }),
            }),
          };
        }
      }

      return block;
    });
  });

  return updateHistory({
    ...state,
    document: updateDocumentTimestamp({
      ...state.document,
      canvas: nextCanvas,
      blocks: nextBlocks,
    }),
  });
};

const mapAIResponseStatus = (
  status: AIGenerationResponse["status"] | AIVideoGenerationResponse["status"],
): AIGenerationBlockData["status"] => {
  if (status === "running") {
    return "generating";
  }

  return status;
};

export type EditorAction =
  | {
      type: "editor/replace-document";
      document: DesignDocument;
      selectedBlockIds?: string[];
      resetUi?: boolean;
    }
  | {
      type: "editor/set-tool";
      tool: EditorTool;
    }
  | {
      type: "editor/set-canvas-zoom";
      zoom: number;
    }
  | {
      type: "editor/set-left-tab";
      tab: LeftPanelTab;
    }
  | {
      type: "editor/update-grid";
      patch: Partial<GridSettings>;
    }
  | {
      type: "editor/update-canvas";
      patch: Partial<CanvasSettings>;
    }
  | {
      type: "editor/update-selected-text-data";
      patch: Partial<TextBlockData>;
    }
  | {
      type: "editor/update-text-block-content";
      blockId: string;
      content: string;
    }
  | {
      type: "editor/update-text-block-data-by-id";
      blockId: string;
      patch: Partial<TextBlockData>;
    }
  | {
      type: "editor/update-selected-image-data";
      patch: Partial<ImageBlockData>;
    }
  | {
      type: "editor/set-selected-image-source";
      src: string;
      fileName?: string;
      mimeType?: string;
      kind?: ImageAssetKind;
    }
  | {
      type: "editor/update-selected-ai-data";
      patch: Partial<AIGenerationBlockData>;
    }
  | {
      type: "editor/update-ai-data-by-id";
      blockId: string;
      patch: Partial<AIGenerationBlockData>;
    }
  | {
      type: "editor/update-selected-live-data";
      patch: Partial<LiveBlockData>;
    }
  | {
      type: "editor/update-selected-block-appearance";
      patch: Partial<
        Pick<
          DesignBlock,
          "showBorder" | "rotation" | "blendMode" | "clipMode" | "filter"
        >
      >;
    }
  | {
      type: "editor/update-selected-block-name";
      name: string;
    }
  | {
      type: "editor/update-document-name";
      name: string;
    }
  | {
      type: "editor/set-composition-mode";
      mode: CompositionMode;
    }
  | {
      type: "editor/update-semantic-brief";
      patch: Partial<SemanticBrief>;
    }
  | {
      type: "editor/create-semantic-slot";
      point?: Point;
    }
  | {
      type: "editor/update-semantic-slot";
      slotId: string;
      patch: Partial<SemanticSlot>;
    }
  | {
      type: "editor/delete-semantic-slot";
      slotId?: string;
    }
  | {
      type: "editor/move-semantic-slot-layer";
      slotId: string;
      direction: LayerMoveDirection;
    }
  | {
      type: "editor/select-semantic-slot";
      slotId: string;
    }
  | {
      type: "editor/clear-semantic-selection";
    }
  | {
      type: "editor/start-semantic-drag";
      slotId: string;
      pointer: Point;
    }
  | {
      type: "editor/start-semantic-resize";
      slotId: string;
      handle: ResizeHandle;
      pointer: Point;
    }
  | {
      type: "editor/apply-orchestration-plan";
      plan: OrchestrationPlan;
    }
  | {
      type: "editor/sync-semantic-output-block-frames";
    }
  | {
      type: "editor/apply-layout-patches";
      patches: OrchestrationLayoutPatch[];
    }
  | {
      type: "editor/apply-decorative-ops";
      ops: OrchestrationDecorativeOp[];
    }
  | {
      type: "editor/apply-live-mapping-patches";
      patches: LiveMappingPatch[];
      replaceExisting?: boolean;
      forceReplaceExistingSemanticLiveRules?: boolean;
      liveCaptureId?: string;
      previousPatches?: LiveMappingPatch[];
    }
  | {
      type: "editor/set-orchestration-state";
      patch: Partial<DocumentOrchestrationState>;
    }
  | {
      type: "editor/apply-ai-response";
      response: AIGenerationResponse;
    }
  | {
      type: "editor/apply-ai-video-response";
      response: AIVideoGenerationResponse;
    }
  | {
      type: "editor/set-ai-error";
      blockId: string;
      message: string;
    }
  | {
      type: "editor/select-block";
      blockId: string;
    }
  | {
      type: "editor/toggle-block-hidden";
      blockId: string;
    }
  | {
      type: "editor/move-block-layer";
      blockId: string;
      direction: LayerMoveDirection;
    }
  | {
      type: "editor/clear-selection";
    }
  | {
      type: "editor/create-block";
      point?: Point;
    }
  | {
      type: "editor/delete-selected-block";
    }
  | {
      type: "editor/start-drag";
      blockId: string;
      pointer: Point;
    }
  | {
      type: "editor/start-resize";
      blockId: string;
      handle: ResizeHandle;
      pointer: Point;
    }
  | {
      type: "editor/update-interaction";
      pointer: Point;
    }
  | {
      type: "editor/end-interaction";
    };

export const initializeEditorState = (state: EditorState): EditorState => ({
  ...state,
  document: normalizeDocument(state.document),
});

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "editor/replace-document": {
      const nextDocument = normalizeDocument(action.document);
      const nextBlockIds = new Set(nextDocument.blocks.map((block) => block.id));
      const nextSemanticSlotIds = new Set(
        (nextDocument.semanticSlots ?? []).map((slot) => slot.id),
      );
      const nextSelectedBlockIds = (
        action.selectedBlockIds ?? state.selection.selectedBlockIds
      ).filter((blockId) => nextBlockIds.has(blockId));

      return {
        ...state,
        document: nextDocument,
        selection: {
          ...state.selection,
          selectedBlockIds: nextSelectedBlockIds,
          selectedSemanticSlotId:
            state.selection.selectedSemanticSlotId &&
            nextSemanticSlotIds.has(state.selection.selectedSemanticSlotId)
              ? state.selection.selectedSemanticSlotId
              : undefined,
          hoveredBlockId:
            state.selection.hoveredBlockId &&
            nextBlockIds.has(state.selection.hoveredBlockId)
              ? state.selection.hoveredBlockId
              : undefined,
        },
        ui: {
          ...state.ui,
          activeTool: action.resetUi ? "select" : state.ui.activeTool,
          interaction: {
            type: "idle",
          },
        },
        history: {
          version: state.history.version + 1,
          canUndo: false,
          canRedo: false,
        },
      };
    }

    case "editor/set-tool":
      return {
        ...state,
        ui: {
          ...state.ui,
          activeTool: action.tool,
        },
      };

    case "editor/set-canvas-zoom":
      return {
        ...state,
        ui: {
          ...state.ui,
          canvasZoom: clampCanvasZoom(action.zoom),
        },
      };

    case "editor/set-left-tab":
      return {
        ...state,
        ui: {
          ...state.ui,
          leftPanelTab: action.tab,
        },
      };

    case "editor/update-grid": {
      const nextGrid = {
        ...state.document.grid,
        ...action.patch,
      };
      const nextDocument = {
        ...state.document,
        grid: nextGrid,
      };

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...nextDocument,
          blocks: nextDocument.blocks.map((block) => ({
            ...block,
            frame: normalizeFrameToGrid(block.frame, nextDocument),
          })),
        }),
      });
    }

    case "editor/update-canvas": {
      const nextDocument = {
        ...state.document,
        canvas: {
          ...withDefaultCanvasLiveColorMapping(state.document.canvas),
          ...action.patch,
          width:
            typeof action.patch.width === "number"
              ? clampCanvasDimension(action.patch.width)
              : state.document.canvas.width,
          height:
            typeof action.patch.height === "number"
              ? clampCanvasDimension(action.patch.height)
              : state.document.canvas.height,
        },
      };

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...nextDocument,
          blocks: nextDocument.blocks.map((block) => ({
            ...block,
            frame: normalizeFrameToGrid(block.frame, nextDocument),
          })),
        }),
      });
    }

    case "editor/update-selected-text-data":
      return updateSelectedBlockData(
        state,
        (block): block is TextBlock => block.type === "text",
        (block) => ({
          ...block,
          data: withDefaultTextBlockData({
            ...block.data,
            ...action.patch,
          }),
        }),
      );

    case "editor/update-text-block-content":
      return updateBlockById(state, action.blockId, (block) => {
        if (block.type !== "text" || block.locked) {
          return block;
        }

        return {
          ...block,
          data: withDefaultTextBlockData({
            ...block.data,
            content: action.content,
          }),
        };
      });

    case "editor/update-text-block-data-by-id":
      return updateBlockById(state, action.blockId, (block) => {
        if (block.type !== "text" || block.locked) {
          return block;
        }

        return {
          ...block,
          data: withDefaultTextBlockData({
            ...block.data,
            ...action.patch,
          }),
        };
      });

    case "editor/update-selected-image-data":
      return updateSelectedBlockData(
        state,
        (block): block is ImageBlock => block.type === "image",
        (block) => ({
          ...block,
          data: withDefaultImageBlockData({
            ...block.data,
            ...action.patch,
          }),
        }),
      );

    case "editor/set-selected-image-source":
      return updateSelectedBlockData(
        state,
        (block): block is ImageBlock => block.type === "image",
        (block) => ({
          ...block,
          data: withDefaultImageBlockData({
            ...block.data,
            asset: action.src
              ? {
                  assetId: block.data.asset?.assetId ?? createId("asset_image"),
                  kind: action.kind ?? block.data.asset?.kind ?? "raster",
                  src: action.src,
                  mimeType: action.mimeType ?? block.data.asset?.mimeType ?? "image/*",
                  fileName: action.fileName ?? block.data.asset?.fileName,
                }
              : null,
          }),
        }),
      );

    case "editor/update-selected-ai-data":
      return updateSelectedBlockData(
        state,
        (block): block is AIGenerationBlock => block.type === "ai-generation",
        (block) => ({
          ...block,
          data: {
            ...withDefaultAIGenerationBlockData(block.data),
            ...action.patch,
          },
        }),
      );

    case "editor/update-ai-data-by-id":
      return updateBlockById(state, action.blockId, (block) => {
        if (block.type !== "ai-generation") {
          return block;
        }

        return {
          ...block,
          data: {
            ...withDefaultAIGenerationBlockData(block.data),
            ...action.patch,
          },
        };
      });

    case "editor/update-selected-live-data":
      return updateSelectedBlockData(
        state,
        (block): block is LiveBlock => block.type === "live",
        (block) => ({
          ...block,
          data: {
            ...block.data,
            ...action.patch,
          },
        }),
      );

    case "editor/update-selected-block-appearance":
      return updateBlocks(state, (blocks) => {
        const selectedBlockId = getSelectedBlockId(state);

        return blocks.map((block) =>
          block.id === selectedBlockId
            ? withDefaultBlockVisualStyle({
                ...block,
                ...action.patch,
              } as DesignBlock)
            : block,
        );
      });

    case "editor/update-selected-block-name":
      return updateBlocks(state, (blocks) => {
        const selectedBlockId = getSelectedBlockId(state);

        return blocks.map((block) =>
          block.id === selectedBlockId
            ? {
                ...block,
                name: action.name,
              }
            : block,
        );
      });

    case "editor/update-document-name":
      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          name: action.name,
        }),
      });

    case "editor/set-composition-mode":
      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          compositionMode: action.mode,
        }),
        selection: {
          ...state.selection,
          selectedSemanticSlotId:
            action.mode === "manual" ? undefined : state.selection.selectedSemanticSlotId,
          selectedBlockIds:
            action.mode === "semantic" ? state.selection.selectedBlockIds : state.selection.selectedBlockIds,
        },
        ui: {
          ...state.ui,
          activeTool:
            action.mode === "semantic"
              ? state.ui.activeTool === "select"
                ? "add-semantic-slot"
                : state.ui.activeTool === "add-semantic-slot"
                  ? state.ui.activeTool
                  : "add-semantic-slot"
              : state.ui.activeTool === "add-semantic-slot"
                ? "select"
                : state.ui.activeTool,
          interaction: {
            type: "idle",
          },
        },
      });

    case "editor/update-semantic-brief":
      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          semanticBrief: withDefaultSemanticBrief({
            ...state.document.semanticBrief,
            ...action.patch,
          }),
        }),
      });

    case "editor/create-semantic-slot": {
      const nextSlot = createSemanticSlot(state.document, action.point);

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          semanticSlots: [
            ...(state.document.semanticSlots ?? []),
            normalizeSemanticSlotToGrid(nextSlot, state.document),
          ],
        }),
        selection: {
          ...state.selection,
          selectedSemanticSlotId: nextSlot.id,
          selectedBlockIds: [],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "idle",
          },
        },
      });
    }

    case "editor/update-semantic-slot":
      return updateSemanticSlotById(state, action.slotId, (slot) =>
        normalizeSemanticSlotToGrid(
          {
            ...slot,
            ...action.patch,
          },
          state.document,
        ),
      );

    case "editor/delete-semantic-slot": {
      const slotId = action.slotId ?? getSelectedSemanticSlotId(state);

      if (!slotId) {
        return state;
      }

      const slot = (state.document.semanticSlots ?? []).find(
        (item) => item.id === slotId,
      );

      if (!slot || slot.lockedByUser) {
        return state;
      }

      const linkedBlockIds = new Set(slot.linkedBlockIds ?? []);
      const nextBlocks = normalizeBlockZIndexes(
        state.document.blocks.filter(
          (block) => !linkedBlockIds.has(block.id) || block.locked,
        ),
      );

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          blocks: nextBlocks,
          semanticSlots: (state.document.semanticSlots ?? []).filter(
            (item) => item.id !== slotId,
          ),
        }),
        selection: {
          ...state.selection,
          selectedBlockIds: state.selection.selectedBlockIds.filter(
            (blockId) => !linkedBlockIds.has(blockId),
          ),
          selectedSemanticSlotId:
            state.selection.selectedSemanticSlotId === slotId
              ? undefined
              : state.selection.selectedSemanticSlotId,
        },
        ui: {
          ...state.ui,
          interaction: {
            type: "idle",
          },
        },
      });
    }

    case "editor/move-semantic-slot-layer": {
      const currentSlots = state.document.semanticSlots ?? [];
      const nextSlots = moveSemanticSlotLayer(
        currentSlots,
        action.slotId,
        action.direction,
      );

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          semanticSlots: nextSlots.map((slot) =>
            normalizeSemanticSlotToGrid(slot, state.document),
          ),
          blocks: syncLinkedBlockZIndexesWithSemanticSlots(
            state.document.blocks,
            nextSlots,
          ),
        }),
      });
    }

    case "editor/select-semantic-slot":
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedSemanticSlotId: action.slotId,
          selectedBlockIds: [],
        },
      };

    case "editor/clear-semantic-selection":
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedSemanticSlotId: undefined,
        },
      };

    case "editor/start-semantic-drag": {
      const slot = (state.document.semanticSlots ?? []).find(
        (item) => item.id === action.slotId,
      );

      if (!slot) {
        return state;
      }

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedSemanticSlotId: slot.id,
          selectedBlockIds: [],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "semantic-dragging",
            slotId: slot.id,
            pointerStart: action.pointer,
            originFrame: slot.frame,
          },
        },
      };
    }

    case "editor/start-semantic-resize": {
      const slot = (state.document.semanticSlots ?? []).find(
        (item) => item.id === action.slotId,
      );

      if (!slot) {
        return state;
      }

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedSemanticSlotId: slot.id,
          selectedBlockIds: [],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "semantic-resizing",
            slotId: slot.id,
            handle: action.handle,
            pointerStart: action.pointer,
            originFrame: slot.frame,
          },
        },
      };
    }

    case "editor/apply-orchestration-plan":
      return applyOrchestrationPlanToDocument(state, action.plan);

    case "editor/sync-semantic-output-block-frames":
      return updateHistory({
        ...state,
        document: updateDocumentTimestamp(
          createSemanticFrameSynchronizedDocument(state.document),
        ),
      });

    case "editor/apply-layout-patches":
      return applyLayoutPatchesToDocument(state, action.patches);

    case "editor/apply-decorative-ops":
      return applyDecorativeOpsToDocument(state, action.ops);

    case "editor/apply-live-mapping-patches":
      return applyLiveMappingPatchesToDocument(state, action.patches, {
        replaceExisting: action.replaceExisting,
        forceReplaceExistingSemanticLiveRules:
          action.forceReplaceExistingSemanticLiveRules,
        liveCaptureId: action.liveCaptureId,
        previousPatches: action.previousPatches,
      });

    case "editor/set-orchestration-state":
      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          orchestrationState: withDefaultDocumentOrchestrationState({
            ...state.document.orchestrationState,
            ...action.patch,
            autoRefreshIntervalMs: clampOrchestrationAutoRefreshIntervalMs(
              action.patch.autoRefreshIntervalMs ??
                state.document.orchestrationState?.autoRefreshIntervalMs,
            ),
          }),
        }),
      });

    case "editor/apply-ai-response":
      return updateBlockById(state, action.response.blockId, (block) => {
        if (block.type !== "ai-generation") {
          return block;
        }

        const firstImage = action.response.images[0];

        return {
          ...block,
          data: {
            ...withDefaultAIGenerationBlockData(block.data),
            status: mapAIResponseStatus(action.response.status),
            mediaMode: "image",
            provider: action.response.providerId,
            generationId: action.response.generationId,
            resultAssetId: firstImage?.assetId,
            resultImageUrl: firstImage?.url ?? block.data.resultImageUrl,
            resultPreviewUrl:
              firstImage?.previewUrl ?? firstImage?.url ?? block.data.resultPreviewUrl,
            resultMimeType: firstImage?.mimeType ?? block.data.resultMimeType,
            generationProgress: action.response.progress,
            errorMessage: action.response.error?.message,
          },
        };
      });

    case "editor/apply-ai-video-response":
      return updateBlockById(state, action.response.blockId, (block) => {
        if (block.type !== "ai-generation") {
          return block;
        }

        const firstVideo = action.response.videos[0];

        return {
          ...block,
          data: {
            ...withDefaultAIGenerationBlockData(block.data),
            status: mapAIResponseStatus(action.response.status),
            mediaMode: "video",
            provider: action.response.providerId,
            generationId: action.response.generationId,
            resultVideoAssetId:
              firstVideo?.assetId ?? block.data.resultVideoAssetId,
            resultVideoUrl:
              firstVideo?.url ?? block.data.resultVideoUrl,
            resultVideoMimeType:
              firstVideo?.mimeType ?? block.data.resultVideoMimeType,
            resultPosterAssetId:
              firstVideo?.posterAssetId ?? block.data.resultPosterAssetId,
            resultPosterUrl:
              firstVideo?.posterUrl ?? block.data.resultPosterUrl,
            resultPosterMimeType:
              firstVideo?.posterMimeType ?? block.data.resultPosterMimeType,
            resultPreviewImageAssetId:
              firstVideo?.previewImageAssetId ??
              block.data.resultPreviewImageAssetId,
            resultPreviewImageUrl:
              firstVideo?.previewImageUrl ??
              block.data.resultPreviewImageUrl,
            resultPreviewImageMimeType:
              firstVideo?.previewImageMimeType ??
              block.data.resultPreviewImageMimeType,
            resultDurationMs:
              firstVideo?.durationMs ?? block.data.resultDurationMs,
            generationProgress: action.response.progress,
            errorMessage: action.response.error?.message,
          },
        };
      });

    case "editor/set-ai-error":
      return updateBlockById(state, action.blockId, (block) => {
        if (block.type !== "ai-generation") {
          return block;
        }

        return {
          ...block,
          data: {
            ...block.data,
            status: "failed",
            errorMessage: action.message,
          },
        };
      });

    case "editor/select-block":
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedBlockIds: [action.blockId],
        },
      };

    case "editor/toggle-block-hidden":
      return updateBlockById(state, action.blockId, (block) => ({
        ...block,
        hidden: !block.hidden,
      }));

    case "editor/move-block-layer":
      return updateBlocks(state, (blocks) =>
        moveBlockLayer(blocks, action.blockId, action.direction),
      );

    case "editor/clear-selection":
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedBlockIds: [],
          selectedSemanticSlotId: undefined,
        },
      };

    case "editor/create-block": {
      const nextBlock = createBlockAtPosition(
        state.document,
        state.ui.activeTool,
        action.point,
      );

      if (!nextBlock) {
        return state;
      }

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          blocks: normalizeBlockZIndexes([...state.document.blocks, nextBlock]),
        }),
        selection: {
          ...state.selection,
          selectedBlockIds: [nextBlock.id],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "idle",
          },
        },
      });
    }

    case "editor/delete-selected-block": {
      const selectedBlockId = getSelectedBlockId(state);

      if (!selectedBlockId) {
        return state;
      }

      return updateHistory({
        ...state,
        document: updateDocumentTimestamp({
          ...state.document,
          blocks: normalizeBlockZIndexes(
            state.document.blocks.filter((block) => block.id !== selectedBlockId),
          ),
        }),
        selection: {
          ...state.selection,
          selectedBlockIds: [],
        },
        ui: {
          ...state.ui,
          interaction: {
            type: "idle",
          },
        },
      });
    }

    case "editor/start-drag": {
      const block = state.document.blocks.find((item) => item.id === action.blockId);

      if (!block) {
        return state;
      }

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedBlockIds: [block.id],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "dragging",
            blockId: block.id,
            pointerStart: action.pointer,
            originFrame: block.frame,
          },
        },
      };
    }

    case "editor/start-resize": {
      const block = state.document.blocks.find((item) => item.id === action.blockId);

      if (!block) {
        return state;
      }

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedBlockIds: [block.id],
        },
        ui: {
          ...state.ui,
          activeTool: "select",
          interaction: {
            type: "resizing",
            blockId: block.id,
            handle: action.handle,
            pointerStart: action.pointer,
            originFrame: block.frame,
          },
        },
      };
    }

    case "editor/update-interaction": {
      const { interaction } = state.ui;

      if (interaction.type === "idle") {
        return state;
      }

      const deltaX = action.pointer.x - interaction.pointerStart.x;
      const deltaY = action.pointer.y - interaction.pointerStart.y;

      if (interaction.type === "dragging") {
        return updateBlockFrame(state, interaction.blockId, {
          ...interaction.originFrame,
          x: interaction.originFrame.x + deltaX,
          y: interaction.originFrame.y + deltaY,
        });
      }

      if (interaction.type === "semantic-dragging") {
        return updateSemanticSlotById(state, interaction.slotId, (slot) => ({
          ...slot,
          frame: normalizeFrameToGrid(
            {
              ...interaction.originFrame,
              x: interaction.originFrame.x + deltaX,
              y: interaction.originFrame.y + deltaY,
            },
            state.document,
          ),
        }));
      }

      if (interaction.type === "semantic-resizing") {
        return updateSemanticSlotById(state, interaction.slotId, (slot) => ({
          ...slot,
          frame: normalizeFrameToGrid(
            resizeFrame(
              interaction.originFrame,
              interaction.handle,
              deltaX,
              deltaY,
            ),
            state.document,
          ),
        }));
      }

      return updateBlockFrame(
        state,
        interaction.blockId,
        resizeFrame(interaction.originFrame, interaction.handle, deltaX, deltaY),
      );
    }

    case "editor/end-interaction":
      return setInteractionIdle(state);

    default:
      return state;
  }
}
