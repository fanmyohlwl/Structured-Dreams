import type { VisualStyleProfile } from "./types";

export const VISUAL_STYLE_PROFILE_STORAGE_KEY =
  "promptblocks.visualStyleProfiles.v1";

export const ACTIVE_VISUAL_STYLE_PROFILE_IDS_STORAGE_KEY =
  "promptblocks.activeVisualStyleProfileIds.v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 16)
    : [];

export const sanitizeVisualStyleProfile = (
  value: unknown,
): VisualStyleProfile | null => {
  if (!isRecord(value)) {
    return null;
  }

  const assetId = asString(value.assetId);

  if (!assetId) {
    return null;
  }

  return {
    id: asString(value.id, `style_${assetId}`),
    assetId,
    title: asString(value.title, "Visual reference"),
    createdAt: asString(value.createdAt, new Date().toISOString()),
    summary: asString(value.summary, "Visual style reference."),
    composition: asString(value.composition, ""),
    typography: asString(value.typography, ""),
    color: asString(value.color, ""),
    imageTreatment: asString(value.imageTreatment, ""),
    spatialRules: asStringArray(value.spatialRules),
    layoutRules: asStringArray(value.layoutRules),
    avoid: asStringArray(value.avoid),
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? clamp(value.confidence, 0, 1)
        : 0.6,
  };
};

export const loadVisualStyleProfiles = () => {
  try {
    const raw = window.localStorage.getItem(VISUAL_STYLE_PROFILE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];

    return Array.isArray(parsed)
      ? parsed
          .map(sanitizeVisualStyleProfile)
          .filter((profile): profile is VisualStyleProfile => Boolean(profile))
      : [];
  } catch {
    return [];
  }
};

export const persistVisualStyleProfiles = (profiles: VisualStyleProfile[]) => {
  window.localStorage.setItem(
    VISUAL_STYLE_PROFILE_STORAGE_KEY,
    JSON.stringify(profiles),
  );
};

export const loadActiveVisualStyleProfileIds = () => {
  try {
    const raw = window.localStorage.getItem(
      ACTIVE_VISUAL_STYLE_PROFILE_IDS_STORAGE_KEY,
    );
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export const persistActiveVisualStyleProfileIds = (ids: string[]) => {
  window.localStorage.setItem(
    ACTIVE_VISUAL_STYLE_PROFILE_IDS_STORAGE_KEY,
    JSON.stringify([...new Set(ids)]),
  );
};
