import type { RenderDocumentSnapshot } from "../../entities/document/types";

export type StaticExportFormat = "png" | "jpeg";
export type AnimatedExportFormat = "gif" | "mp4" | "webm";

export interface ExportRenderSource {
  document: RenderDocumentSnapshot;
}

export interface StaticImageExportOptions {
  format: StaticExportFormat;
  pixelRatio?: number;
  quality?: number;
  backgroundColor?: string;
}

export interface StaticImageExportPayload extends ExportRenderSource {
  options: StaticImageExportOptions;
}

export interface StaticImageExportResult {
  mimeType: string;
  fileName: string;
  blob: Blob;
}

export interface StaticImageExporter {
  export(payload: StaticImageExportPayload): Promise<StaticImageExportResult>;
}

export interface AnimationFrameSnapshot extends ExportRenderSource {
  timestampMs: number;
}

export type AnimatedExportStage =
  | "preparing-assets"
  | "starting-live-camera"
  | "rendering-webm"
  | "transcoding";

export interface AnimatedExportOptions {
  format: AnimatedExportFormat;
  frameRate: number;
  durationMs: number;
  backgroundColor?: string;
  onStageChange?: (stage: AnimatedExportStage) => void;
}

export interface AnimatedExportPayload extends ExportRenderSource {
  options: AnimatedExportOptions;
}

export interface AnimatedExportResult {
  mimeType: string;
  fileName: string;
  blob: Blob;
}

export interface AnimatedMediaExporter {
  export(payload: AnimatedExportPayload): Promise<AnimatedExportResult>;
}
