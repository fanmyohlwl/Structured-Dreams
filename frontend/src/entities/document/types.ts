import type { LiveColorMapping } from "../block/types";
import type { DesignBlock } from "../block/types";
import type { GridSettings } from "../grid/types";
import type {
  CompositionMode,
  DocumentOrchestrationState,
  SemanticBrief,
  SemanticSlot,
} from "../semantic/types";
import type { EntityId, HexColor, Size, TimestampRange } from "../../shared/types/common";

export interface CanvasSettings extends Size {
  backgroundColor: HexColor;
  liveColorMapping?: LiveColorMapping;
}

export interface DesignDocument extends TimestampRange {
  id: EntityId;
  name: string;
  canvas: CanvasSettings;
  grid: GridSettings;
  blocks: DesignBlock[];
  compositionMode?: CompositionMode;
  semanticBrief?: SemanticBrief;
  semanticSlots?: SemanticSlot[];
  orchestrationState?: DocumentOrchestrationState;
}

export interface RenderDocumentSnapshot {
  id: DesignDocument["id"];
  name: DesignDocument["name"];
  canvas: DesignDocument["canvas"];
  grid: DesignDocument["grid"];
  blocks: ReadonlyArray<DesignBlock>;
}
