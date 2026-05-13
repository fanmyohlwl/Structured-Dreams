import type { PointerEvent as ReactPointerEvent, Ref } from "react";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import type { SemanticSlot } from "../../../entities/semantic/types";
import type { ResizeHandle } from "../../editor/state/types";
import { DesignSurface } from "./DesignSurface";

interface DocumentRendererProps {
  document: RenderDocumentSnapshot;
  mode: "canvas" | "preview";
  scale: number;
  showGrid?: boolean;
  hideBlocks?: boolean;
  selectedBlockIds?: readonly string[];
  viewportRef?: Ref<HTMLDivElement>;
  surfaceRef?: Ref<HTMLDivElement>;
  viewportClassName?: string;
  scaledClassName?: string;
  onSurfacePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBlockPointerDown?: (
    blockId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onResizeHandlePointerDown?: (
    blockId: string,
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  semanticSlots?: readonly SemanticSlot[];
  selectedSemanticSlotId?: string;
  showSemanticSlots?: boolean;
  onSemanticSlotPointerDown?: (
    slotId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onSemanticResizeHandlePointerDown?: (
    slotId: string,
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}

export function DocumentRenderer({
  document,
  mode,
  scale,
  showGrid = true,
  hideBlocks = false,
  selectedBlockIds = [],
  viewportRef,
  surfaceRef,
  viewportClassName,
  scaledClassName,
  onSurfacePointerDown,
  onBlockPointerDown,
  onResizeHandlePointerDown,
  semanticSlots,
  selectedSemanticSlotId,
  showSemanticSlots,
  onSemanticSlotPointerDown,
  onSemanticResizeHandlePointerDown,
}: DocumentRendererProps) {
  return (
    <div
      ref={viewportRef}
      className={viewportClassName ?? "document-renderer__viewport"}
      style={{
        width: document.canvas.width * scale,
        height: document.canvas.height * scale,
      }}
    >
      <div
        className={scaledClassName ?? "document-renderer__scaled"}
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <DesignSurface
          surfaceRef={surfaceRef}
          document={document}
          mode={mode}
          showGrid={showGrid}
          hideBlocks={hideBlocks}
          selectedBlockIds={selectedBlockIds}
          semanticSlots={semanticSlots}
          selectedSemanticSlotId={selectedSemanticSlotId}
          showSemanticSlots={showSemanticSlots}
          onSurfacePointerDown={onSurfacePointerDown}
          onBlockPointerDown={onBlockPointerDown}
          onResizeHandlePointerDown={onResizeHandlePointerDown}
          onSemanticSlotPointerDown={onSemanticSlotPointerDown}
          onSemanticResizeHandlePointerDown={onSemanticResizeHandlePointerDown}
        />
      </div>
    </div>
  );
}
