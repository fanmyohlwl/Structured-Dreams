import type { EntityId, HexColor, Rect } from "../../shared/types/common";

export type BlockId = EntityId;

export type BlockType =
  | "text"
  | "image"
  | "ai-generation"
  | "live"
  | "pattern";

export type BlockBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "difference";

export type BlockClipMode = "frame" | "visible";

export interface BlockVisualFilter {
  grayscale?: boolean;
  contrast?: number;
  blur?: number;
  saturate?: number;
  dither?: boolean;
  halftone?: boolean;
}

export interface BlockBase {
  id: BlockId;
  type: BlockType;
  name: string;
  frame: Rect;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  opacity: number;
  showBorder: boolean;
  rotation?: number;
  blendMode?: BlockBlendMode;
  clipMode?: BlockClipMode;
  filter?: BlockVisualFilter;
}

export interface TextBlockData {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | string;
  textColor: HexColor;
  backgroundColor?: HexColor | null;
  padding?: number;
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  liveColorMapping?: LiveColorMapping;
  liveTypography?: TextLiveTypography;
}

export interface TextTypographyPropertyMapping {
  enabled: boolean;
  signalKey: string;
  min: number;
  max: number;
}

export interface TextLiveTypography {
  enabled: boolean;
  sourceBlockId?: BlockId;
  transitionMs: number;
  managedBy?: "semantic-live";
  liveCaptureId?: string;
  fontSizeMapping: TextTypographyPropertyMapping;
  letterSpacingMapping: TextTypographyPropertyMapping;
}

export type ImageAssetKind = "raster" | "vector";

export interface ImageAssetRef {
  assetId: EntityId;
  kind: ImageAssetKind;
  src: string;
  mimeType: string;
  fileName?: string;
}

export type ImageFitMode = "cover" | "contain" | "fill";

export type ImageLiveLayoutMode = "grid" | "wave";

export interface ImageLiveLayout {
  enabled: boolean;
  sourceBlockId?: BlockId;
  managedBy?: "semantic-live";
  liveCaptureId?: string;
  countSignalKey: string;
  minCount: number;
  maxCount: number;
  layoutMode: ImageLiveLayoutMode;
  gap: number;
  waveSignalKey: string;
  waveAmplitude: number;
  transitionMs: number;
}

export interface ImageBlockData {
  asset: ImageAssetRef | null;
  fitMode: ImageFitMode;
  backgroundColor?: HexColor | null;
  liveColorMapping?: LiveColorMapping;
  liveLayout?: ImageLiveLayout;
}

export type AIGenerationStatus =
  | "idle"
  | "queued"
  | "generating"
  | "completed"
  | "cancelled"
  | "failed";

export type AIGenerationMediaMode = "image" | "video";

export type AIGenerationRatioMode =
  | "follow-block"
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16";

export interface AIGenerationBlockData {
  prompt: string;
  negativePrompt?: string;
  status: AIGenerationStatus;
  mediaMode?: AIGenerationMediaMode;
  durationSeconds?: number;
  generationRatioMode?: AIGenerationRatioMode;
  resultFitMode?: ImageFitMode;
  matchCanvasBackground?: boolean;
  continuousGenerationIntervalMs?: number;
  backgroundColor?: HexColor | null;
  provider?: string;
  generationId?: string;
  resultAssetId?: EntityId;
  resultImageUrl?: string;
  resultPreviewUrl?: string;
  resultMimeType?: string;
  resultVideoAssetId?: EntityId;
  resultVideoUrl?: string;
  resultVideoMimeType?: string;
  resultPosterAssetId?: EntityId;
  resultPosterUrl?: string;
  resultPosterMimeType?: string;
  resultPreviewImageAssetId?: EntityId;
  resultPreviewImageUrl?: string;
  resultPreviewImageMimeType?: string;
  resultDurationMs?: number;
  generationProgress?: number;
  placeholderLabel?: string;
  errorMessage?: string;
  liveColorMapping?: LiveColorMapping;
}

export interface LiveColorRule {
  id: EntityId;
  expressionKey: string;
  threshold: number;
  color: HexColor;
}

export interface LiveColorMapping {
  enabled: boolean;
  sourceBlockId?: BlockId;
  managedBy?: "semantic-live";
  liveCaptureId?: string;
  defaultColor: HexColor;
  transitionMs: number;
  rules: LiveColorRule[];
}

export type LiveBlockStatus = "idle" | "loading" | "streaming" | "error";

export type LiveDetectorMode = "face" | "hands" | "pose" | "holistic";

export interface LiveBlockData {
  source: "camera";
  detector: LiveDetectorMode;
  status: LiveBlockStatus;
  backgroundColor?: HexColor | null;
  showVideo: boolean;
  showLandmarks: boolean;
  placeholderLabel?: string;
  errorMessage?: string;
}

export type PatternBlockType =
  | "halftone"
  | "dither"
  | "line-specimen"
  | "checker"
  | "stripe"
  | "dot-grid";

export interface PatternBlockData {
  patternType: PatternBlockType;
  foregroundColor: HexColor | string;
  backgroundColor?: HexColor | string | null;
  density: number;
  scale: number;
  angle: number;
  seed?: number;
  label?: string;
}

export interface TextBlock extends BlockBase {
  type: "text";
  data: TextBlockData;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  data: ImageBlockData;
}

export interface AIGenerationBlock extends BlockBase {
  type: "ai-generation";
  data: AIGenerationBlockData;
}

export interface LiveBlock extends BlockBase {
  type: "live";
  data: LiveBlockData;
}

export interface PatternBlock extends BlockBase {
  type: "pattern";
  data: PatternBlockData;
}

export type DesignBlock =
  | TextBlock
  | ImageBlock
  | AIGenerationBlock
  | LiveBlock
  | PatternBlock;
