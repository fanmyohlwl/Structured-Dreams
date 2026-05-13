import type { StoredAssetRecord } from "../assets/types.js";

export type StoredDocumentVisibility = "private" | "unlisted" | "public";
export type StoredDocumentPrimaryMediaKind =
  | "image"
  | "video"
  | "mixed"
  | "live"
  | "empty";

export interface StoredDocumentCapabilities {
  hasAIGeneration: boolean;
  hasLiveBlock: boolean;
  usesLiveSignals: boolean;
  requiresCameraPermission: boolean;
  hasImageMedia: boolean;
  hasVideoMedia: boolean;
}

export interface StoredImageAssetRef {
  assetId?: string;
  kind?: "raster" | "vector" | string;
  src: string;
  mimeType?: string;
  fileName?: string;
}

export interface StoredTextLiveTypographyMapping {
  enabled?: boolean;
  signalKey?: string;
  min?: number;
  max?: number;
}

export interface StoredTextLiveTypography {
  enabled?: boolean;
  sourceBlockId?: string;
  transitionMs?: number;
  fontSizeMapping?: StoredTextLiveTypographyMapping;
  letterSpacingMapping?: StoredTextLiveTypographyMapping;
}

export interface StoredTextBlockData {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | string;
  textColor: string;
  backgroundColor?: string | null;
  padding?: number;
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  liveColorMapping?: Record<string, unknown>;
  liveTypography?: StoredTextLiveTypography;
  [key: string]: unknown;
}

export interface StoredImageBlockData {
  asset: StoredImageAssetRef | null;
  fitMode: "cover" | "contain" | "fill";
  backgroundColor?: string | null;
  liveColorMapping?: Record<string, unknown>;
  liveLayout?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoredAIGenerationBlockData {
  prompt: string;
  status: string;
  mediaMode?: "image" | "video";
  durationSeconds?: number;
  resultAssetId?: string;
  resultImageUrl?: string;
  resultPreviewUrl?: string;
  resultMimeType?: string;
  resultVideoAssetId?: string;
  resultVideoUrl?: string;
  resultVideoMimeType?: string;
  resultPosterAssetId?: string;
  resultPosterUrl?: string;
  resultPosterMimeType?: string;
  resultPreviewImageAssetId?: string;
  resultPreviewImageUrl?: string;
  resultPreviewImageMimeType?: string;
  resultDurationMs?: number;
  provider?: string;
  generationId?: string;
  [key: string]: unknown;
}

export interface StoredLiveBlockData {
  source: string;
  detector: string;
  status: string;
  backgroundColor?: string | null;
  showVideo: boolean;
  showLandmarks: boolean;
  [key: string]: unknown;
}

export interface StoredPatternBlockData {
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
  [key: string]: unknown;
}

export interface StoredBlockBase {
  id: string;
  type: string;
  name: string;
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  opacity: number;
  showBorder: boolean;
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
    [key: string]: unknown;
  };
}

export interface StoredTextBlock extends StoredBlockBase {
  type: "text";
  data: StoredTextBlockData;
}

export interface StoredImageBlock extends StoredBlockBase {
  type: "image";
  data: StoredImageBlockData;
}

export interface StoredAIGenerationBlock extends StoredBlockBase {
  type: "ai-generation";
  data: StoredAIGenerationBlockData;
}

export interface StoredLiveBlock extends StoredBlockBase {
  type: "live";
  data: StoredLiveBlockData;
}

export interface StoredPatternBlock extends StoredBlockBase {
  type: "pattern";
  data: StoredPatternBlockData;
}

export type StoredDesignBlock =
  | StoredTextBlock
  | StoredImageBlock
  | StoredAIGenerationBlock
  | StoredLiveBlock
  | StoredPatternBlock;

export interface StoredDesignDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
    liveColorMapping?: Record<string, unknown>;
    [key: string]: unknown;
  };
  grid: {
    columns: number;
    rows: number;
    padding: number;
    showGrid: boolean;
    snapToGrid: boolean;
    [key: string]: unknown;
  };
  blocks: StoredDesignBlock[];
  compositionMode?: "manual" | "semantic";
  semanticBrief?: {
    brandName?: string;
    campaignGoal?: string;
    audience?: string;
    toneKeywords?: string[];
    mustIncludeCopy?: string[];
    avoidKeywords?: string[];
    designNotes?: string;
    allowAIGeneration?: boolean;
    compositionFreedom?:
      | "preserve"
      | "style-only"
      | "layout-remix"
      | "poster-system";
    posterArchetype?:
      | "oversized-type"
      | "collage"
      | "editorial-portrait"
      | "glitch-portrait"
      | "cinematic-crop"
      | "halftone-specimen"
      | "image-led-minimal"
      | "custom";
    copyPolicy?: "preserve" | "compress" | "editorialize";
    references?: Array<{
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
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  semanticSlots?: Array<{
    id: string;
    name: string;
    slotKind?: "text" | "image" | "ai-image" | "ai-video" | "live";
    role:
      | "headline"
      | "subheadline"
      | "body"
      | "brand-mark"
      | "hero-image"
      | "supporting-image"
      | "cta"
      | "ambient-visual"
      | "live-visual"
      | "custom";
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    priority: number;
    contentType:
      | "text"
      | "image"
      | "ai-image"
      | "ai-video"
      | "live"
      | "mixed";
    content: string;
    sourceFileName?: string;
    sourceMimeType?: string;
    visualIntent: string;
    allowAIGeneration: boolean;
    preferredBlockType?: "text" | "image" | "ai-generation" | "live";
    lockedByUser: boolean;
    hidden: boolean;
    linkedBlockIds?: string[];
    required?: boolean;
    canMove?: boolean;
    canResize?: boolean;
    canRotate?: boolean;
    canOverlap?: boolean;
    canCrop?: boolean;
    canDuplicate?: boolean;
    minReadableSize?: number;
    readingOrder?: number;
    groupId?: string;
    [key: string]: unknown;
  }>;
  orchestrationState?: {
    lastRunAt?: string;
    lastAppliedPlanId?: string;
    autoRefreshEnabled?: boolean;
    autoRefreshIntervalMs?: number;
    isRunning?: boolean;
    lastError?: string;
    lastSummary?: string;
    [key: string]: unknown;
  };
}

export interface StoredDocumentRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
  visibility: StoredDocumentVisibility;
  shareSlug: string | null;
  document: StoredDesignDocument;
}

export interface StoredDocumentSummary {
  id: string;
  name: string;
  updatedAt: string;
  visibility: StoredDocumentVisibility;
  primaryMediaKind: StoredDocumentPrimaryMediaKind;
  coverAssetId: string | null;
  coverUrl: string | null;
  capabilities: StoredDocumentCapabilities;
}

export interface DocumentAssetNormalizationResult {
  document: StoredDesignDocument;
  importedAssets: StoredAssetRecord[];
}
