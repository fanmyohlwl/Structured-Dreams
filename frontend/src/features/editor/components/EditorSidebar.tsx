import type {
  AIGenerationBlockData,
  DesignBlock,
  ImageAssetKind,
  ImageBlockData,
  LiveBlock,
  LiveBlockData,
  TextBlockData,
} from "../../../entities/block/types";
import type { CanvasSettings } from "../../../entities/document/types";
import type { GridSettings } from "../../../entities/grid/types";
import type { CompositionMode } from "../../../entities/semantic/types";
import type { EditorTool, LayerMoveDirection } from "../state/types";
import type { ContinuousAIGenerationSessionState } from "../../ai/runtime/continuousGeneration";
import { PanelCard } from "../../../shared/ui/PanelCard";
import { SelectedBlockInspector } from "./SelectedBlockInspector";
import { LiveColorMappingControls } from "../../live/components/LiveColorMappingControls";

interface EditorSidebarProps {
  compositionMode: CompositionMode;
  activeTool: EditorTool;
  canvas: CanvasSettings;
  grid: GridSettings;
  blocks: DesignBlock[];
  continuousAIGenerationSession: ContinuousAIGenerationSessionState;
  selectedBlock?: DesignBlock;
  onToolChange: (tool: EditorTool) => void;
  onSetCompositionMode: (mode: CompositionMode) => void;
  onSelectBlock: (blockId: string) => void;
  onCanvasChange: (patch: Partial<CanvasSettings>) => void;
  onGridChange: (patch: Partial<GridSettings>) => void;
  onDeleteSelectedBlock: () => void;
  onUpdateSelectedBlockName: (name: string) => void;
  onUpdateTextBlock: (patch: Partial<TextBlockData>) => void;
  onUpdateImageBlock: (patch: Partial<ImageBlockData>) => void;
  onSetImageSource: (payload: {
    src: string;
    fileName?: string;
    mimeType?: string;
    kind?: ImageAssetKind;
  }) => void;
  onUpdateAIGenerationBlock: (patch: Partial<AIGenerationBlockData>) => void;
  onUpdateLiveBlock: (patch: Partial<LiveBlockData>) => void;
  onUpdateSelectedBlockAppearance: (
    patch: Partial<
      Pick<
        DesignBlock,
        "showBorder" | "rotation" | "blendMode" | "clipMode" | "filter"
      >
    >,
  ) => void;
  onToggleBlockHidden: (blockId: string) => void;
  onMoveBlockLayer: (
    blockId: string,
    direction: LayerMoveDirection,
  ) => void;
  onGenerateAI: () => void | Promise<void>;
  onCancelAI: () => void | Promise<void>;
  onStartContinuousAI: () => void | Promise<void>;
  onStopContinuousAI: () => void | Promise<void>;
}

const tools: Array<{ id: EditorTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "add-text", label: "Add Text" },
  { id: "add-image", label: "Add Image" },
  { id: "add-ai", label: "Add AI" },
  { id: "add-live", label: "Add Live" },
];

const toolLabels: Record<EditorTool, string> = {
  select: "Select",
  "add-text": "Add Text",
  "add-image": "Add Image",
  "add-ai": "Add AI",
  "add-live": "Add Live",
  "add-semantic-slot": "Add Slot",
};

const canvasPresets = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "4:3", width: 1440, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
];

const blockTypeLabels: Record<DesignBlock["type"], string> = {
  text: "Text",
  image: "Image",
  "ai-generation": "AI",
  live: "Live",
  pattern: "Pattern",
};

export function EditorSidebar({
  compositionMode,
  activeTool,
  canvas,
  grid,
  blocks,
  continuousAIGenerationSession,
  selectedBlock,
  onToolChange,
  onSetCompositionMode,
  onSelectBlock,
  onCanvasChange,
  onGridChange,
  onDeleteSelectedBlock,
  onUpdateSelectedBlockName,
  onUpdateTextBlock,
  onUpdateImageBlock,
  onSetImageSource,
  onUpdateAIGenerationBlock,
  onUpdateLiveBlock,
  onUpdateSelectedBlockAppearance,
  onToggleBlockHidden,
  onMoveBlockLayer,
  onGenerateAI,
  onCancelAI,
  onStartContinuousAI,
  onStopContinuousAI,
}: EditorSidebarProps) {
  const liveBlocks = blocks.filter(
    (block): block is LiveBlock => block.type === "live",
  );
  const orderedLayers = [...blocks].sort((left, right) => right.zIndex - left.zIndex);
  const selectedBlockId = selectedBlock?.id;

  return (
    <aside className="editor-sidebar">
      <PanelCard
        title="Compose Mode"
        subtitle="Switch between direct block editing and semantic art direction"
      >
        <div className="toolbar-grid">
          <button
            type="button"
            className={`toolbar-button toolbar-button--wide${
              compositionMode === "manual" ? " is-active" : ""
            }`}
            onClick={() => onSetCompositionMode("manual")}
          >
            Manual
          </button>
          <button
            type="button"
            className={`toolbar-button toolbar-button--wide${
              compositionMode === "semantic" ? " is-active" : ""
            }`}
            onClick={() => onSetCompositionMode("semantic")}
          >
            Semantic Compose
          </button>
        </div>
      </PanelCard>

      <PanelCard title="Workbench" subtitle="Choose a block type, then click the canvas">
        <div className="toolbar-grid">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={[
                "toolbar-button",
                tool.id === "select" ? "toolbar-button--wide" : "",
                activeTool === tool.id ? "is-active" : "",
              ].join(" ")}
              onClick={() => onToolChange(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <p className="empty-copy">
          Current mode: <strong>{toolLabels[activeTool]}</strong>
        </p>
      </PanelCard>

      <PanelCard title="Canvas Size" subtitle="Pick a format before tuning the grid">
        <div className="preset-grid">
          {canvasPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="secondary-button"
              onClick={() =>
                onCanvasChange({
                  width: preset.width,
                  height: preset.height,
                })
              }
            >
              {preset.label}
              <span>
                {preset.width} × {preset.height}
              </span>
            </button>
          ))}
        </div>

        <div className="canvas-size-row">
          <label className="field field--compact">
            <span>Width</span>
            <input
              className="text-input"
              type="number"
              min={320}
              max={4096}
              value={canvas.width}
              onChange={(event) =>
                onCanvasChange({ width: Number(event.target.value) || canvas.width })
              }
            />
          </label>

          <button
            type="button"
            className="secondary-button canvas-size-row__swap"
            onClick={() =>
              onCanvasChange({
                width: canvas.height,
                height: canvas.width,
              })
            }
            aria-label="Swap canvas width and height"
          >
            <svg
              className="canvas-size-row__swap-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7l-2.5 2.5M7 17l2.5-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
          </button>

          <label className="field field--compact">
            <span>Height</span>
            <input
              className="text-input"
              type="number"
              min={320}
              max={4096}
              value={canvas.height}
              onChange={(event) =>
                onCanvasChange({ height: Number(event.target.value) || canvas.height })
              }
            />
          </label>
        </div>

        <label className="field canvas-color-field">
          <span>Canvas Color</span>
          <input
            className="color-input"
            type="color"
            value={canvas.backgroundColor}
            onChange={(event) =>
              onCanvasChange({ backgroundColor: event.target.value })
            }
          />
        </label>

        <LiveColorMappingControls
          mapping={canvas.liveColorMapping}
          liveBlocks={liveBlocks}
          onChange={(liveColorMapping) => onCanvasChange({ liveColorMapping })}
          title="Canvas Go Live"
          subtitle="Map camera signals to the canvas background"
        />
      </PanelCard>

      <PanelCard title="Grid Controls" subtitle="Adjust the editable canvas grid">
        <label className="field">
          <span>Columns</span>
          <input
            type="range"
            min={4}
            max={18}
            value={grid.columns}
            onChange={(event) =>
              onGridChange({ columns: Number(event.target.value) })
            }
          />
          <strong>{grid.columns}</strong>
        </label>

        <label className="field">
          <span>Rows</span>
          <input
            type="range"
            min={6}
            max={24}
            value={grid.rows}
            onChange={(event) => onGridChange({ rows: Number(event.target.value) })}
          />
          <strong>{grid.rows}</strong>
        </label>

        <label className="field">
          <span>Grid Margin</span>
          <input
            type="range"
            min={0}
            max={160}
            value={grid.padding}
            onChange={(event) =>
              onGridChange({ padding: Number(event.target.value) })
            }
          />
          <strong>{grid.padding}px</strong>
        </label>

        <label className="toggle-field">
          <span>Show Grid</span>
          <input
            type="checkbox"
            checked={grid.showGrid}
            onChange={(event) =>
              onGridChange({ showGrid: event.target.checked })
            }
          />
        </label>

        <label className="toggle-field">
          <span>Snap to Grid</span>
          <input
            type="checkbox"
            checked={grid.snapToGrid}
            onChange={(event) =>
              onGridChange({ snapToGrid: event.target.checked })
            }
          />
        </label>
      </PanelCard>

      <PanelCard title="Layers" subtitle="Select, reorder, and hide document blocks">
        <div className="layers-list">
          {orderedLayers.map((block, index) => {
            const isSelected = selectedBlockId === block.id;
            const isTopLayer = index === 0;
            const isBottomLayer = index === orderedLayers.length - 1;

            return (
              <div
                key={block.id}
                className={`layers-list__item${
                  isSelected ? " is-selected" : ""
                }${block.hidden ? " is-hidden" : ""}`}
              >
                <button
                  type="button"
                  className="layers-list__select"
                  onClick={() => onSelectBlock(block.id)}
                >
                  <span className="layers-list__type">
                    {blockTypeLabels[block.type]}
                  </span>
                  <strong className="layers-list__name">{block.name}</strong>
                </button>

                <div className="layers-list__actions">
                  <button
                    type="button"
                    className="layers-list__action-button"
                    onClick={() => onToggleBlockHidden(block.id)}
                  >
                    {block.hidden ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    className="layers-list__action-button"
                    disabled={isTopLayer}
                    onClick={() => onMoveBlockLayer(block.id, "up")}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="layers-list__action-button"
                    disabled={isBottomLayer}
                    onClick={() => onMoveBlockLayer(block.id, "down")}
                  >
                    Down
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard title="Inspector" subtitle="Selected block details">
        <SelectedBlockInspector
          blocks={blocks}
          canvasBackgroundColor={canvas.backgroundColor}
          continuousAIGenerationSession={continuousAIGenerationSession}
          selectedBlock={selectedBlock}
          onDeleteSelectedBlock={onDeleteSelectedBlock}
          onUpdateSelectedBlockName={onUpdateSelectedBlockName}
          onUpdateTextBlock={onUpdateTextBlock}
          onUpdateImageBlock={onUpdateImageBlock}
          onSetImageSource={onSetImageSource}
          onUpdateAIGenerationBlock={onUpdateAIGenerationBlock}
          onUpdateLiveBlock={onUpdateLiveBlock}
          onUpdateSelectedBlockAppearance={onUpdateSelectedBlockAppearance}
          onGenerateAI={onGenerateAI}
          onCancelAI={onCancelAI}
          onStartContinuousAI={onStartContinuousAI}
          onStopContinuousAI={onStopContinuousAI}
        />
      </PanelCard>
    </aside>
  );
}
