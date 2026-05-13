import type { DesignDocument } from "../../../entities/document/types";
import type { BlockId } from "../../../entities/block/types";
import type { Point, Rect } from "../../../shared/types/common";

export type EditorTool =
  | "select"
  | "add-text"
  | "add-image"
  | "add-ai"
  | "add-live"
  | "add-semantic-slot";

export type LeftPanelTab = "insert" | "inspect" | "document" | "export";

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export type LayerMoveDirection = "up" | "down";

export type EditorInteraction =
  | {
      type: "idle";
    }
  | {
      type: "dragging";
      blockId: BlockId;
      pointerStart: Point;
      originFrame: Rect;
    }
  | {
      type: "resizing";
      blockId: BlockId;
      handle: ResizeHandle;
      pointerStart: Point;
      originFrame: Rect;
    }
  | {
      type: "semantic-dragging";
      slotId: string;
      pointerStart: Point;
      originFrame: Rect;
    }
  | {
      type: "semantic-resizing";
      slotId: string;
      handle: ResizeHandle;
      pointerStart: Point;
      originFrame: Rect;
    };

export interface SelectionState {
  selectedBlockIds: BlockId[];
  hoveredBlockId?: BlockId;
  selectedSemanticSlotId?: string;
}

export interface EditorUiState {
  activeTool: EditorTool;
  leftPanelTab: LeftPanelTab;
  interaction: EditorInteraction;
  canvasZoom: number;
}

export interface EditorHistoryState {
  version: number;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorState {
  document: DesignDocument;
  selection: SelectionState;
  ui: EditorUiState;
  history: EditorHistoryState;
}
