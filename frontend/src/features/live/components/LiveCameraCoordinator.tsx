import type { DesignBlock } from "../../../entities/block/types";
import type { DesignDocument } from "../../../entities/document/types";
import { useSharedLiveCamera } from "../runtime/sharedLiveCamera";

interface LiveCameraCoordinatorProps {
  document: DesignDocument;
  forceActive?: boolean;
}

const shouldActivateSharedCamera = (
  canvasLiveEnabled: boolean,
  blocks: DesignBlock[],
) =>
  canvasLiveEnabled ||
  blocks.some((block) => {
    if (block.type === "live") {
      return true;
    }

    if (block.type === "image") {
      return (
        Boolean(block.data.liveColorMapping?.enabled) ||
        Boolean(block.data.liveLayout?.enabled)
      );
    }

    if (block.type === "text") {
      return (
        Boolean(block.data.liveColorMapping?.enabled) ||
        Boolean(block.data.liveTypography?.enabled)
      );
    }

    if (block.type === "ai-generation") {
      return Boolean(block.data.liveColorMapping?.enabled);
    }

    return false;
  });

export function LiveCameraCoordinator({
  document,
  forceActive = false,
}: LiveCameraCoordinatorProps) {
  useSharedLiveCamera(
    forceActive ||
      shouldActivateSharedCamera(
        Boolean(document.canvas.liveColorMapping?.enabled),
        document.blocks,
      ),
  );
  return null;
}
