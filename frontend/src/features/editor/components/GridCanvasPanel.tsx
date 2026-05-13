import { useEffect, useMemo, useRef } from "react";
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
} from "react";
import { PanelCard } from "../../../shared/ui/PanelCard";
import { useElementSize } from "../../../shared/hooks/useElementSize";
import { DocumentRenderer } from "../../rendering/components/DocumentRenderer";
import type { EditorAction } from "../state/reducer";
import type { EditorState, ResizeHandle } from "../state/types";

interface GridCanvasPanelProps {
  editorState: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const pointerEventToCanvasPoint = (
  event: PointerEvent | ReactPointerEvent,
  element: HTMLDivElement,
  scale: number,
) => {
  const rect = element.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
};

const getFitScale = (
  viewportWidth: number,
  viewportHeight: number,
  documentWidth: number,
  documentHeight: number,
) => {
  if (!viewportWidth || !viewportHeight) {
    return 1;
  }

  const widthScale = viewportWidth / documentWidth;
  const heightScale = viewportHeight / documentHeight;

  return Math.min(widthScale, heightScale, 1);
};

export function GridCanvasPanel({ editorState, dispatch }: GridCanvasPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(frameRef);
  const { document } = editorState;
  const { interaction, canvasZoom } = editorState.ui;
  const isSemanticMode = (document.compositionMode ?? "manual") === "semantic";
  const fitZoom = useMemo(
    () =>
      getFitScale(
        Math.max(viewportSize.width - 36, 0),
        Math.max(viewportSize.height - 36, 0),
        document.canvas.width,
        document.canvas.height,
      ),
    [document.canvas.height, document.canvas.width, viewportSize.height, viewportSize.width],
  );

  useEffect(() => {
    if (interaction.type === "idle") {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!viewportRef.current) {
        return;
      }

      dispatch({
        type: "editor/update-interaction",
        pointer: pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom),
      });
    };

    const handlePointerUp = () => {
      dispatch({
        type: "editor/end-interaction",
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [canvasZoom, dispatch, interaction]);

  const handleSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();

    const point = pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom);

    if (isSemanticMode) {
      if (editorState.ui.activeTool === "add-semantic-slot") {
        dispatch({
          type: "editor/create-semantic-slot",
          point,
        });
        return;
      }

      dispatch({
        type: "editor/clear-semantic-selection",
      });
      return;
    }

    if (editorState.ui.activeTool === "select") {
      dispatch({
        type: "editor/clear-selection",
      });
      return;
    }

    dispatch({
      type: "editor/create-block",
      point,
    });
  };

  const handleBlockPointerDown = (
    blockId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (isSemanticMode) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dispatch({
      type: "editor/start-drag",
      blockId,
      pointer: pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom),
    });
  };

  const handleResizePointerDown = (
    blockId: string,
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (isSemanticMode) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dispatch({
      type: "editor/start-resize",
      blockId,
      handle,
      pointer: pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom),
    });
  };

  const handleSemanticSlotPointerDown = (
    slotId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dispatch({
      type: "editor/start-semantic-drag",
      slotId,
      pointer: pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom),
    });
  };

  const handleSemanticResizePointerDown = (
    slotId: string,
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dispatch({
      type: "editor/start-semantic-resize",
      slotId,
      handle,
      pointer: pointerEventToCanvasPoint(event, viewportRef.current, canvasZoom),
    });
  };

  return (
    <section className="canvas-panel">
      <PanelCard
        className="panel-card--stretch"
        title="Grid Canvas"
        subtitle={
          isSemanticMode
            ? "Map intent and content zones here, then review the real visual output on the right."
            : "Create, drag, resize, and delete simple blocks"
        }
      >
        <div className="canvas-panel__meta">
          <span>
            {document.grid.columns} cols / {document.grid.rows} rows
          </span>
          <span>
            {document.canvas.width} × {document.canvas.height}
          </span>
        </div>

        <div className="canvas-panel__toolbar">
          <label className="canvas-panel__zoom-control">
            <span>Zoom</span>
            <input
              type="range"
              min={20}
              max={200}
              step={5}
              value={Math.round(canvasZoom * 100)}
              onChange={(event) =>
                dispatch({
                  type: "editor/set-canvas-zoom",
                  zoom: Number(event.target.value) / 100,
                })
              }
            />
            <strong>{Math.round(canvasZoom * 100)}%</strong>
          </label>

          <div className="canvas-panel__toolbar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                dispatch({
                  type: "editor/set-canvas-zoom",
                  zoom: 1,
                })
              }
            >
              100%
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                dispatch({
                  type: "editor/set-canvas-zoom",
                  zoom: fitZoom,
                })
              }
            >
              Fit
            </button>
          </div>
        </div>

        <p className="canvas-panel__hint">
          {isSemanticMode
            ? "Use semantic slots to describe where information and AI-driven elements should live. Add slots, then drag and resize them on the grid."
            : "Choose a placement mode on the left, click empty canvas to create, drag blocks to move, and use corner handles to resize."}
        </p>

        <div ref={frameRef} className="surface-frame surface-frame--canvas">
          <DocumentRenderer
            viewportRef={viewportRef}
            document={document}
            mode="canvas"
            scale={canvasZoom}
            hideBlocks={isSemanticMode}
            selectedBlockIds={editorState.selection.selectedBlockIds}
            semanticSlots={editorState.document.semanticSlots}
            selectedSemanticSlotId={editorState.selection.selectedSemanticSlotId}
            showSemanticSlots={isSemanticMode}
            onSurfacePointerDown={handleSurfacePointerDown}
            onBlockPointerDown={handleBlockPointerDown}
            onResizeHandlePointerDown={handleResizePointerDown}
            onSemanticSlotPointerDown={handleSemanticSlotPointerDown}
            onSemanticResizeHandlePointerDown={handleSemanticResizePointerDown}
          />
        </div>
      </PanelCard>
    </section>
  );
}
