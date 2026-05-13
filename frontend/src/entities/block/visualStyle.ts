import type {
  BlockBlendMode,
  BlockClipMode,
  BlockVisualFilter,
} from "./types";

export const blockBlendModes: BlockBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "difference",
];

export const blockClipModes: BlockClipMode[] = ["frame", "visible"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const normalizeBlockRotation = (rotation?: number) =>
  Number.isFinite(rotation) ? clamp(rotation ?? 0, -180, 180) : 0;

export const normalizeBlockBlendMode = (
  blendMode?: string,
): BlockBlendMode =>
  blockBlendModes.includes(blendMode as BlockBlendMode)
    ? (blendMode as BlockBlendMode)
    : "normal";

export const normalizeBlockClipMode = (clipMode?: string): BlockClipMode =>
  blockClipModes.includes(clipMode as BlockClipMode)
    ? (clipMode as BlockClipMode)
    : "frame";

export const normalizeBlockVisualFilter = (
  filter?: BlockVisualFilter,
): BlockVisualFilter | undefined => {
  if (!filter) {
    return undefined;
  }

  const normalized: BlockVisualFilter = {};

  if (filter.grayscale === true) {
    normalized.grayscale = true;
  }

  if (typeof filter.contrast === "number" && Number.isFinite(filter.contrast)) {
    normalized.contrast = clamp(filter.contrast, 0.2, 3);
  }

  if (typeof filter.blur === "number" && Number.isFinite(filter.blur)) {
    normalized.blur = clamp(filter.blur, 0, 24);
  }

  if (typeof filter.saturate === "number" && Number.isFinite(filter.saturate)) {
    normalized.saturate = clamp(filter.saturate, 0, 3);
  }

  if (filter.dither === true) {
    normalized.dither = true;
  }

  if (filter.halftone === true) {
    normalized.halftone = true;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const cssFilterFromBlockFilter = (filter?: BlockVisualFilter) => {
  const normalized = normalizeBlockVisualFilter(filter);

  if (!normalized) {
    return undefined;
  }

  const filters: string[] = [];

  if (normalized.grayscale) {
    filters.push("grayscale(1)");
  }

  if (typeof normalized.contrast === "number") {
    filters.push(`contrast(${normalized.contrast})`);
  }

  if (typeof normalized.blur === "number" && normalized.blur > 0) {
    filters.push(`blur(${normalized.blur}px)`);
  }

  if (typeof normalized.saturate === "number") {
    filters.push(`saturate(${normalized.saturate})`);
  }

  return filters.length > 0 ? filters.join(" ") : undefined;
};

export const canvasCompositeOperationFromBlendMode = (
  blendMode?: string,
): GlobalCompositeOperation => {
  const normalized = normalizeBlockBlendMode(blendMode);

  if (normalized === "normal") {
    return "source-over";
  }

  return normalized;
};
