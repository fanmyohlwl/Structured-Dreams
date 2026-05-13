import type { BlockType } from "../block/types";
import type { EntityId, Rect } from "../../shared/types/common";

export type CompositionMode = "manual" | "semantic";

export type SemanticCompositionFreedom =
  | "preserve"
  | "style-only"
  | "layout-remix"
  | "poster-system";

export type SemanticPosterArchetype =
  | "oversized-type"
  | "collage"
  | "editorial-portrait"
  | "glitch-portrait"
  | "cinematic-crop"
  | "halftone-specimen"
  | "image-led-minimal"
  | "custom";

export type SemanticCopyPolicy = "preserve" | "compress" | "editorialize";

export interface SemanticBrief {
  brandName?: string;
  campaignGoal?: string;
  audience?: string;
  toneKeywords: string[];
  mustIncludeCopy: string[];
  avoidKeywords: string[];
  designNotes?: string;
  allowAIGeneration: boolean;
  references: SemanticReferenceItem[];
  compositionFreedom?: SemanticCompositionFreedom;
  posterArchetype?: SemanticPosterArchetype;
  copyPolicy?: SemanticCopyPolicy;
}

export type SemanticReferenceType = "url" | "image" | "note";

export interface SemanticReferenceItem {
  id: EntityId;
  type: SemanticReferenceType;
  title: string;
  description: string;
  url?: string;
  assetId?: EntityId;
  src?: string;
  mimeType?: string;
  fileName?: string;
  createdAt: string;
}

export type SemanticSlotRole =
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

export type SemanticSlotContentType =
  | "text"
  | "image"
  | "ai-image"
  | "ai-video"
  | "live"
  | "mixed";

export type SemanticSlotKind =
  | "text"
  | "image"
  | "ai-image"
  | "ai-video"
  | "live";

export interface SemanticSlot {
  id: EntityId;
  name: string;
  slotKind?: SemanticSlotKind;
  role: SemanticSlotRole;
  frame: Rect;
  priority: number;
  contentType: SemanticSlotContentType;
  content: string;
  sourceFileName?: string;
  sourceMimeType?: string;
  visualIntent: string;
  allowAIGeneration: boolean;
  preferredBlockType?: BlockType;
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
}

export interface DocumentOrchestrationState {
  lastRunAt?: string;
  lastAppliedPlanId?: string;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMs: number;
  isRunning: boolean;
  lastError?: string;
  lastSummary?: string;
}

export const DEFAULT_ORCHESTRATION_AUTO_REFRESH_INTERVAL_MS = 15000;
export const MIN_ORCHESTRATION_AUTO_REFRESH_INTERVAL_MS = 10000;

export const createEmptySemanticBrief = (): SemanticBrief => ({
  brandName: "",
  campaignGoal: "",
  audience: "",
  toneKeywords: [],
  mustIncludeCopy: [],
  avoidKeywords: [],
  designNotes: "",
  allowAIGeneration: true,
  references: [],
  compositionFreedom: "preserve",
  posterArchetype: "custom",
  copyPolicy: "preserve",
});

export const createDefaultOrchestrationState =
  (): DocumentOrchestrationState => ({
    autoRefreshEnabled: false,
    autoRefreshIntervalMs: DEFAULT_ORCHESTRATION_AUTO_REFRESH_INTERVAL_MS,
    isRunning: false,
    lastError: undefined,
    lastSummary: undefined,
    lastRunAt: undefined,
    lastAppliedPlanId: undefined,
  });

export const clampOrchestrationAutoRefreshIntervalMs = (value?: number) =>
  Math.max(
    MIN_ORCHESTRATION_AUTO_REFRESH_INTERVAL_MS,
    Math.round(value ?? DEFAULT_ORCHESTRATION_AUTO_REFRESH_INTERVAL_MS),
  );

export const withDefaultSemanticBrief = (
  brief?: Partial<SemanticBrief>,
): SemanticBrief => ({
  ...createEmptySemanticBrief(),
  ...brief,
  toneKeywords: [...(brief?.toneKeywords ?? [])],
  mustIncludeCopy: [...(brief?.mustIncludeCopy ?? [])],
  avoidKeywords: [...(brief?.avoidKeywords ?? [])],
  allowAIGeneration: brief?.allowAIGeneration ?? true,
  compositionFreedom: brief?.compositionFreedom ?? "preserve",
  posterArchetype: brief?.posterArchetype ?? "custom",
  copyPolicy: brief?.copyPolicy ?? "preserve",
  references: (brief?.references ?? []).map((reference) => ({
    ...reference,
    id: reference.id,
    type: reference.type,
    title: reference.title ?? "",
    description: reference.description ?? "",
    createdAt: reference.createdAt ?? new Date().toISOString(),
  })),
});

export const semanticSlotKindOptions: Array<{
  value: SemanticSlotKind;
  label: string;
}> = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "ai-image", label: "AI Image" },
  { value: "ai-video", label: "AI Video" },
  { value: "live", label: "Live" },
];

export const semanticSlotPurposeOptions: Array<{
  value: SemanticSlotRole;
  label: string;
}> = [
  { value: "headline", label: "Headline" },
  { value: "body", label: "Body" },
  { value: "hero-image", label: "Hero Visual" },
  { value: "supporting-image", label: "Supporting Visual" },
  { value: "cta", label: "CTA" },
  { value: "brand-mark", label: "Brand Mark" },
  { value: "ambient-visual", label: "Ambient" },
  { value: "live-visual", label: "Live Visual" },
  { value: "custom", label: "Custom" },
];

export const getSemanticSlotKindLabel = (kind: SemanticSlotKind) =>
  semanticSlotKindOptions.find((option) => option.value === kind)?.label ?? "Text";

export const getSemanticSlotPurposeLabel = (role: SemanticSlotRole) =>
  semanticSlotPurposeOptions.find((option) => option.value === role)?.label ?? "Custom";

export const isSemanticSlotRequiredByDefault = (role: SemanticSlotRole) =>
  role === "headline" || role === "brand-mark" || role === "cta";

export const inferSemanticSlotKind = (
  slot: Pick<
    SemanticSlot,
    "slotKind" | "contentType" | "preferredBlockType" | "allowAIGeneration"
  >,
): SemanticSlotKind => {
  if (slot.slotKind) {
    return slot.slotKind;
  }

  if (slot.contentType === "ai-video") {
    return "ai-video";
  }

  if (slot.contentType === "ai-image") {
    return "ai-image";
  }

  if (slot.contentType === "live" || slot.preferredBlockType === "live") {
    return "live";
  }

  if (slot.contentType === "image" || slot.preferredBlockType === "image") {
    return "image";
  }

  if (
    slot.preferredBlockType === "ai-generation" ||
    slot.allowAIGeneration
  ) {
    return "ai-image";
  }

  return "text";
};

export const deriveSemanticSlotKindPatch = (
  slotKind: SemanticSlotKind,
): Pick<
  SemanticSlot,
  "slotKind" | "contentType" | "preferredBlockType" | "allowAIGeneration"
> => {
  if (slotKind === "image") {
    return {
      slotKind,
      contentType: "image",
      preferredBlockType: "image",
      allowAIGeneration: false,
    };
  }

  if (slotKind === "ai-image") {
    return {
      slotKind,
      contentType: "ai-image",
      preferredBlockType: "ai-generation",
      allowAIGeneration: true,
    };
  }

  if (slotKind === "ai-video") {
    return {
      slotKind,
      contentType: "ai-video",
      preferredBlockType: "ai-generation",
      allowAIGeneration: true,
    };
  }

  if (slotKind === "live") {
    return {
      slotKind,
      contentType: "live",
      preferredBlockType: "live",
      allowAIGeneration: false,
    };
  }

  return {
    slotKind,
    contentType: "text",
    preferredBlockType: "text",
    allowAIGeneration: false,
  };
};

export const withDefaultSemanticSlot = (
  slot: SemanticSlot,
): SemanticSlot => {
  const slotKind = inferSemanticSlotKind(slot);
  const kindDefaults = deriveSemanticSlotKindPatch(slotKind);

  return {
    ...slot,
    ...kindDefaults,
    name: slot.name || getSemanticSlotKindLabel(slotKind),
    role: slot.role ?? "custom",
    priority: Math.max(1, Math.round(slot.priority ?? 1)),
    contentType: slot.contentType ?? kindDefaults.contentType,
    content: slot.content ?? "",
    sourceFileName: slot.sourceFileName,
    sourceMimeType: slot.sourceMimeType,
    visualIntent: slot.visualIntent ?? "",
    allowAIGeneration:
      slot.allowAIGeneration ?? kindDefaults.allowAIGeneration,
    preferredBlockType: slot.preferredBlockType ?? kindDefaults.preferredBlockType,
    lockedByUser: slot.lockedByUser ?? false,
    hidden: slot.hidden ?? false,
    linkedBlockIds: [...(slot.linkedBlockIds ?? [])],
    required: slot.required ?? isSemanticSlotRequiredByDefault(slot.role ?? "custom"),
    canMove: slot.canMove ?? false,
    canResize: slot.canResize ?? false,
    canRotate: slot.canRotate ?? false,
    canOverlap: slot.canOverlap ?? false,
    canCrop: slot.canCrop ?? false,
    canDuplicate: slot.canDuplicate ?? false,
    minReadableSize:
      typeof slot.minReadableSize === "number" ? slot.minReadableSize : undefined,
    readingOrder:
      typeof slot.readingOrder === "number" ? slot.readingOrder : undefined,
    groupId: slot.groupId,
  };
};

export const withDefaultDocumentOrchestrationState = (
  state?: Partial<DocumentOrchestrationState>,
): DocumentOrchestrationState => ({
  ...createDefaultOrchestrationState(),
  ...state,
  autoRefreshEnabled: state?.autoRefreshEnabled ?? false,
  autoRefreshIntervalMs: clampOrchestrationAutoRefreshIntervalMs(
    state?.autoRefreshIntervalMs,
  ),
});
