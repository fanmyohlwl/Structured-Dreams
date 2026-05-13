import type {
  DesignBlock,
  ImageBlock,
  LiveColorMapping,
  TextBlock,
} from "../../entities/block/types";
import type { DesignDocument } from "../../entities/document/types";
import { liveSignalKeySet, normalizeLiveSignalKey } from "../live/config/liveSignalRegistry";
import type { LiveMappingPatch } from "./types";

export interface LiveMappingRuleSummary {
  id: string;
  title: string;
  signal: string;
  effect: string;
  target?: string;
}

const formatSignal = (expressionKey: string, threshold?: number) =>
  threshold == null
    ? expressionKey
    : `${expressionKey} >= ${Number(threshold.toFixed(2))}`;

const getBlockLabel = (block: DesignBlock) => block.name || block.type;

const getSignalStatus = (signalKey: string) =>
  liveSignalKeySet.has(signalKey)
    ? "numeric signal"
    : `fallbacks to ${normalizeLiveSignalKey(signalKey)}`;

export const summarizeLiveSignalStatus = getSignalStatus;

const summarizeLiveColorMapping = (
  mapping: LiveColorMapping | undefined,
  title: string,
  idPrefix: string,
) => {
  if (!mapping?.enabled || mapping.rules.length === 0) {
    return [];
  }

  return mapping.rules.map((rule, index) => ({
    id: `${idPrefix}_${rule.id || index}`,
    title,
    signal: formatSignal(rule.expressionKey, rule.threshold),
    effect: `background shifts to ${rule.color} over ${mapping.transitionMs}ms (${getSignalStatus(rule.expressionKey)})`,
  }));
};

const summarizeTextTypography = (block: TextBlock) => {
  const liveTypography = block.data.liveTypography;

  if (!liveTypography?.enabled) {
    return [];
  }

  const summaries: LiveMappingRuleSummary[] = [];
  const title = `${getBlockLabel(block)} Typography`;

  if (liveTypography.fontSizeMapping?.enabled) {
    const mapping = liveTypography.fontSizeMapping;
    summaries.push({
      id: `${block.id}_font_size`,
      title,
      signal: mapping.signalKey,
      effect: `font size ${mapping.min} -> ${mapping.max} (${getSignalStatus(mapping.signalKey)})`,
      target: block.id,
    });
  }

  if (liveTypography.letterSpacingMapping?.enabled) {
    const mapping = liveTypography.letterSpacingMapping;
    summaries.push({
      id: `${block.id}_letter_spacing`,
      title,
      signal: mapping.signalKey,
      effect: `letter spacing ${mapping.min} -> ${mapping.max} (${getSignalStatus(mapping.signalKey)})`,
      target: block.id,
    });
  }

  return summaries;
};

const summarizeImageLayout = (block: ImageBlock) => {
  const liveLayout = block.data.liveLayout;

  if (!liveLayout?.enabled) {
    return [];
  }

  return [
    {
      id: `${block.id}_image_layout`,
      title: `${getBlockLabel(block)} Layout`,
      signal: liveLayout.countSignalKey,
      effect: `${liveLayout.layoutMode} layout, ${liveLayout.minCount} -> ${liveLayout.maxCount} instances${
        liveLayout.layoutMode === "wave"
          ? `, amplitude ${liveLayout.waveAmplitude}`
          : ""
      } (${getSignalStatus(liveLayout.countSignalKey)})`,
      target: block.id,
    },
  ];
};

export const summarizeActiveLiveMappingRules = (
  document: DesignDocument,
): LiveMappingRuleSummary[] => [
  ...summarizeLiveColorMapping(
    document.canvas.liveColorMapping,
    "Canvas Color",
    "canvas_color",
  ),
  ...document.blocks.flatMap((block) => {
    if (block.hidden) {
      return [];
    }

    if (block.type === "text") {
      return [
        ...summarizeLiveColorMapping(
          block.data.liveColorMapping,
          `${getBlockLabel(block)} Color`,
          `${block.id}_color`,
        ),
        ...summarizeTextTypography(block),
      ];
    }

    if (block.type === "image") {
      return [
        ...summarizeLiveColorMapping(
          block.data.liveColorMapping,
          `${getBlockLabel(block)} Color`,
          `${block.id}_color`,
        ),
        ...summarizeImageLayout(block),
      ];
    }

    return [];
  }),
];

export const summarizeLiveMappingPatchTarget = (
  document: DesignDocument,
  patch: LiveMappingPatch,
) => {
  if (patch.targetBlockId) {
    const block = document.blocks.find((candidate) => candidate.id === patch.targetBlockId);

    return block ? getBlockLabel(block) : patch.targetBlockId;
  }

  if (patch.targetSlotId) {
    const slot = (document.semanticSlots ?? []).find(
      (candidate) => candidate.id === patch.targetSlotId,
    );

    return slot ? slot.name || slot.role : patch.targetSlotId;
  }

  return "Canvas";
};

export const isLiveMappingPatchTargetResolved = (
  document: DesignDocument,
  patch: LiveMappingPatch,
) => {
  if (patch.mappingType === "canvas-color") {
    return true;
  }

  if (patch.targetBlockId) {
    return document.blocks.some(
      (block) => block.id === patch.targetBlockId && !block.locked && !block.hidden,
    );
  }

  if (!patch.targetSlotId) {
    return false;
  }

  const slot = (document.semanticSlots ?? []).find(
    (candidate) => candidate.id === patch.targetSlotId,
  );

  if (
    slot?.linkedBlockIds?.some((blockId) =>
      document.blocks.some(
        (block) => block.id === blockId && !block.locked && !block.hidden,
      ),
    )
  ) {
    return true;
  }

  if (!slot) {
    return false;
  }

  const expectedType =
    patch.mappingType === "text-typography"
      ? "text"
      : patch.mappingType === "image-layout"
        ? "image"
        : undefined;

  return document.blocks.some((block) => {
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
};
