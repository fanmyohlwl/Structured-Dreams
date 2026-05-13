import type { DesignBlock } from "../../../entities/block/types";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import {
  inferSemanticSlotKind,
  type SemanticSlot,
} from "../../../entities/semantic/types";
import type { EditorState } from "./types";

const getRenderableBlocks = (state: EditorState) => {
  if ((state.document.compositionMode ?? "manual") !== "semantic") {
    return state.document.blocks;
  }

  const linkedBlockIds = new Set(
    (state.document.semanticSlots ?? [])
      .filter((slot) => !slot.hidden)
      .flatMap((slot) => slot.linkedBlockIds ?? []),
  );

  return state.document.blocks.filter((block) => linkedBlockIds.has(block.id));
};

export const selectRenderDocumentSnapshot = (
  state: EditorState,
): RenderDocumentSnapshot => ({
  id: state.document.id,
  name: state.document.name,
  canvas: state.document.canvas,
  grid: state.document.grid,
  blocks: getRenderableBlocks(state),
});

export const selectPreviewDocumentSnapshot = (
  state: EditorState,
): RenderDocumentSnapshot => selectRenderDocumentSnapshot(state);

const DEFAULT_TEMPLATE_BLOCK_IDS = new Set([
  "block_text_brand",
  "block_image_symbol",
  "block_ai_texture",
  "block_live_camera",
]);

const doesBlockTypeMatchSlot = (block: DesignBlock, slot: SemanticSlot) => {
  const slotKind = inferSemanticSlotKind(slot);

  if (slotKind === "text") {
    return block.type === "text";
  }

  if (slotKind === "image") {
    return block.type === "image";
  }

  if (slotKind === "ai-image" || slotKind === "ai-video") {
    return block.type === "ai-generation";
  }

  return block.type === "live";
};

const getFrameOverlapRatio = (block: DesignBlock, slot: SemanticSlot) => {
  const left = Math.max(block.frame.x, slot.frame.x);
  const top = Math.max(block.frame.y, slot.frame.y);
  const right = Math.min(
    block.frame.x + block.frame.width,
    slot.frame.x + slot.frame.width,
  );
  const bottom = Math.min(
    block.frame.y + block.frame.height,
    slot.frame.y + slot.frame.height,
  );
  const overlapWidth = Math.max(right - left, 0);
  const overlapHeight = Math.max(bottom - top, 0);
  const overlapArea = overlapWidth * overlapHeight;
  const slotArea = Math.max(slot.frame.width * slot.frame.height, 1);

  return overlapArea / slotArea;
};

const isDefaultOrEmptyOutputBlock = (block: DesignBlock) => {
  if (DEFAULT_TEMPLATE_BLOCK_IDS.has(block.id)) {
    return true;
  }

  if (block.type === "text") {
    const content = block.data.content.trim().toLowerCase();
    return content === "type your text here" || content === "place your text";
  }

  if (block.type === "image") {
    return !block.data.asset?.src;
  }

  if (block.type === "ai-generation") {
    const hasImageResult = Boolean(
      block.data.resultImageUrl ||
        block.data.resultPreviewUrl ||
        block.data.resultPosterUrl ||
        block.data.resultPreviewImageUrl,
    );

    return !hasImageResult;
  }

  return false;
};

const resolveFallbackBlockForSlot = (
  slot: SemanticSlot,
  blocks: DesignBlock[],
  usedBlockIds: Set<string>,
) =>
  blocks
    .filter((block) => !block.hidden)
    .filter((block) => !usedBlockIds.has(block.id))
    .filter((block) => doesBlockTypeMatchSlot(block, slot))
    .filter((block) => !isDefaultOrEmptyOutputBlock(block))
    .map((block) => ({
      block,
      overlapRatio: getFrameOverlapRatio(block, slot),
    }))
    .filter((candidate) => candidate.overlapRatio >= 0.6)
    .sort((left, right) => {
      if (right.overlapRatio !== left.overlapRatio) {
        return right.overlapRatio - left.overlapRatio;
      }

      return right.block.zIndex - left.block.zIndex;
    })[0]?.block;

export const selectExportDocumentSnapshot = (
  state: EditorState,
): RenderDocumentSnapshot => {
  if ((state.document.compositionMode ?? "manual") !== "semantic") {
    return selectRenderDocumentSnapshot(state);
  }

  const blocksById = new Map(
    state.document.blocks
      .filter((block) => !block.hidden)
      .map((block) => [block.id, block]),
  );
  const usedBlockIds = new Set<string>();
  const exportBlocks: DesignBlock[] = [];

  (state.document.semanticSlots ?? [])
    .filter((slot) => !slot.hidden)
    .sort((left, right) => left.priority - right.priority)
    .forEach((slot) => {
      const linkedBlocks = (slot.linkedBlockIds ?? [])
        .map((blockId) => blocksById.get(blockId))
        .filter((block): block is DesignBlock => Boolean(block));

      if (linkedBlocks.length > 0) {
        linkedBlocks.forEach((block) => {
          if (!usedBlockIds.has(block.id)) {
            usedBlockIds.add(block.id);
            exportBlocks.push(block);
          }
        });
        return;
      }

      const fallbackBlock = resolveFallbackBlockForSlot(
        slot,
        state.document.blocks,
        usedBlockIds,
      );

      if (fallbackBlock) {
        usedBlockIds.add(fallbackBlock.id);
        exportBlocks.push(fallbackBlock);
      }
    });

  return {
    id: state.document.id,
    name: state.document.name,
    canvas: state.document.canvas,
    grid: state.document.grid,
    blocks: exportBlocks,
  };
};
