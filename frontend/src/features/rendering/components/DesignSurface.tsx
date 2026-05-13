import { useEffect, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import type { DesignBlock } from "../../../entities/block/types";
import {
  cssFilterFromBlockFilter,
  normalizeBlockBlendMode,
  normalizeBlockClipMode,
  normalizeBlockRotation,
} from "../../../entities/block/visualStyle";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import type { SemanticSlot } from "../../../entities/semantic/types";
import {
  getSemanticSlotKindLabel,
  getSemanticSlotPurposeLabel,
  inferSemanticSlotKind,
} from "../../../entities/semantic/types";
import { getGridGeometry } from "../../../entities/grid/geometry";
import {
  DEFAULT_AI_MEDIA_MODE,
  DEFAULT_AI_RESULT_FIT_MODE,
  getAIGenerationPosterFallbackUrl,
} from "../../ai/utils/aiBlockGeneration";
import { LiveMediaBlock } from "../../live/components/LiveMediaBlock";
import { useLiveExpressionSnapshot } from "../../live/runtime/liveExpressionStore";
import { GLOBAL_LIVE_SOURCE_ID } from "../../live/runtime/sharedLiveCamera";
import {
  resolveBlockAppearance,
  resolveLiveMappedAppearance,
  type ResolvedBlockAppearance,
} from "../../live/utils/liveColorMapping";
import {
  resolveImageLiveLayoutInstances,
  withDefaultImageLiveLayout,
} from "../../live/utils/imageLiveLayout";
import { resolveTextLiveTypographyStyle } from "../../live/utils/textLiveTypography";
import { resolveFittedTextLayout, resolveTextBlockPadding } from "../utils/textLayout";
import { getPatternCssBackground } from "../utils/patternRendering";
import { loadOnlineFontForFamily } from "../../typography/onlineFontCatalog";
import type { ResizeHandle } from "../../editor/state/types";

interface DesignSurfaceProps {
  document: RenderDocumentSnapshot;
  mode: "canvas" | "preview";
  hideBlocks?: boolean;
  selectedBlockIds?: readonly string[];
  showGrid?: boolean;
  surfaceRef?: Ref<HTMLDivElement>;
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

const getSurfaceBlockClassName = (block: DesignBlock, selected: boolean) => {
  const classNames = ["design-surface__block", `design-surface__block--${block.type}`];

  if (selected) {
    classNames.push("design-surface__block--selected");
  }

  return classNames.join(" ");
};

const summarizeSemanticSlotField = (
  value: string | undefined,
  fallback: string,
) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 88 ? `${trimmed.slice(0, 85)}...` : trimmed;
};

function renderBlockContent(
  block: DesignBlock,
  mode: "canvas" | "preview",
  appearance: ResolvedBlockAppearance,
  layoutExpressions: Record<string, number> | undefined,
  typographyExpressions: Record<string, number> | undefined,
) {
  if (block.type === "text") {
    const typographyStyle = resolveTextLiveTypographyStyle({
      blockData: block.data,
      expressions: typographyExpressions,
    });
    const fontWeight = String(block.data.fontWeight ?? 500);
    const fittedTextLayout = resolveFittedTextLayout({
      text: block.data.content,
      frameWidth: block.frame.width,
      frameHeight: block.frame.height,
      fontFamily: block.data.fontFamily,
      fontWeight,
      requestedFontSize: typographyStyle.fontSize,
      padding: block.data.padding ?? 0,
      letterSpacing: typographyStyle.letterSpacing,
      lineHeightMultiplier: block.data.lineHeight ?? 0.95,
    });
    const padding = resolveTextBlockPadding(block.data.padding);

    return (
      <div
        className="design-surface__text-content"
        style={
          {
            "--text-block-padding-top": `${padding + fittedTextLayout.topInset}px`,
            "--text-block-padding-right": `${padding}px`,
            "--text-block-padding-bottom": `${padding}px`,
            "--text-block-padding-left": `${padding}px`,
            color: block.data.textColor,
            fontFamily: block.data.fontFamily,
            fontSize: fittedTextLayout.fontSize,
            fontWeight,
            textAlign: block.data.textAlign ?? "left",
            letterSpacing: `${typographyStyle.letterSpacing}px`,
            lineHeight: fittedTextLayout.lineHeightMultiplier,
            transition: [appearance.transition, typographyStyle.transition]
              .filter(Boolean)
              .join(", "),
          } as CSSProperties
        }
      >
        {block.data.content}
      </div>
    );
  }

  if (block.type === "image") {
    if (block.data.asset) {
      const assetSrc = block.data.asset.src;
      const liveLayout = withDefaultImageLiveLayout(block.data.liveLayout);

      if (liveLayout.enabled) {
        const instances = resolveImageLiveLayoutInstances({
          width: block.frame.width,
          height: block.frame.height,
          liveLayout,
          expressions: layoutExpressions,
        });

        return (
          <div className="design-surface__image-layout">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="design-surface__image-instance"
                style={{
                  left: instance.x,
                  top: instance.y,
                  width: instance.width,
                  height: instance.height,
                  transform: instance.transform,
                  transition: `transform ${liveLayout.transitionMs}ms ease`,
                }}
              >
                <img
                  className="design-surface__image"
                  src={assetSrc}
                  alt={block.name}
                  style={{
                    objectFit: block.data.fitMode,
                  }}
                />
              </div>
            ))}
          </div>
        );
      }

      return (
        <img
          className="design-surface__image"
          src={assetSrc}
          alt={block.name}
          style={{
            objectFit: block.data.fitMode,
          }}
        />
      );
    }

    return (
      <div
        className="design-surface__image-placeholder"
        style={{
          border: block.showBorder ? "1px dashed rgba(31, 41, 51, 0.18)" : "0",
          transition: appearance.transition,
        }}
      >
        <span>Image Asset</span>
        <small>Upload raster or vector</small>
      </div>
    );
  }

  if (block.type === "pattern") {
    const patternStyle = getPatternCssBackground(block.data);

    return (
      <div
        className="design-surface__pattern"
        style={{
          ...patternStyle,
          transform: `rotate(${block.data.angle}deg)`,
          transformOrigin: "center center",
        }}
      >
        {block.data.label ? (
          <span className="design-surface__pattern-label">
            {block.data.label}
          </span>
        ) : null}
      </div>
    );
  }

  const aiMediaMode = block.type === "ai-generation"
    ? block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE
    : undefined;

  if (block.type === "ai-generation" && aiMediaMode === "video" && block.data.resultVideoUrl) {
    return (
      <div
        className="design-surface__ai-result"
        style={{
          border: block.showBorder ? "1px dashed rgba(31, 41, 51, 0.22)" : "0",
          transition: appearance.transition,
        }}
      >
        <video
          className="design-surface__video"
          src={block.data.resultVideoUrl}
          poster={getAIGenerationPosterFallbackUrl(block.data)}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{
            objectFit: block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
          }}
        />
        {mode === "canvas" ? (
          <span className="design-surface__ai-badge">
            {block.data.status === "completed"
              ? "Generated Video"
              : block.data.status}
          </span>
        ) : null}
      </div>
    );
  }

  if (
    block.type === "ai-generation" &&
    aiMediaMode === "video" &&
    getAIGenerationPosterFallbackUrl(block.data)
  ) {
    return (
      <div
        className="design-surface__ai-result"
        style={{
          border: block.showBorder ? "1px dashed rgba(31, 41, 51, 0.22)" : "0",
          transition: appearance.transition,
        }}
      >
        <img
          className="design-surface__image"
          src={getAIGenerationPosterFallbackUrl(block.data) ?? undefined}
          alt={block.name}
          style={{
            objectFit: block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
          }}
        />
        {mode === "canvas" ? (
          <span className="design-surface__ai-badge">
            {block.data.status === "completed"
              ? "Generated Video"
              : block.data.status}
          </span>
        ) : null}
      </div>
    );
  }

  if (block.type === "ai-generation" && (block.data.resultPreviewUrl || block.data.resultImageUrl)) {
    return (
      <div
        className="design-surface__ai-result"
        style={{
          border: block.showBorder ? "1px dashed rgba(31, 41, 51, 0.22)" : "0",
          transition: appearance.transition,
        }}
      >
        <img
          className="design-surface__image"
          src={block.data.resultPreviewUrl ?? block.data.resultImageUrl}
          alt={block.name}
          style={{
            objectFit: block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
          }}
        />
        {mode === "canvas" ? (
          <span className="design-surface__ai-badge">
            {block.data.status === "completed"
              ? "Generated Photo"
              : block.data.status}
          </span>
        ) : null}
      </div>
    );
  }

  if (block.type === "ai-generation") {
    return (
      <div
        className="design-surface__ai-placeholder"
        style={{
          transition: appearance.transition,
        }}
      >
        <span>
          {aiMediaMode === "video"
            ? block.data.placeholderLabel ?? "AI video area"
            : block.data.placeholderLabel ?? "AI photo area"}
        </span>
        <small>
          {aiMediaMode === "video"
            ? block.data.prompt || "Video prompt not set"
            : block.data.prompt || "Prompt not set"}
        </small>
      </div>
    );
  }

  return (
    <LiveMediaBlock
      block={block}
      active={mode === "canvas" || mode === "preview"}
      showOverlay={mode === "canvas"}
    />
  );
}

interface DesignSurfaceBlockProps {
  block: DesignBlock;
  mode: "canvas" | "preview";
  selected: boolean;
  onBlockPointerDown?: (
    blockId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onResizeHandlePointerDown?: (
    blockId: string,
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}

function DesignSurfaceBlock({
  block,
  mode,
  selected,
  onBlockPointerDown,
  onResizeHandlePointerDown,
}: DesignSurfaceBlockProps) {
  const colorSnapshot = useLiveExpressionSnapshot(
    block.type === "live"
      ? undefined
      : block.type === "pattern"
        ? undefined
        : block.data.liveColorMapping?.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
  );
  const imageLayoutSnapshot = useLiveExpressionSnapshot(
    block.type === "image"
      ? block.data.liveLayout?.enabled
        ? block.data.liveLayout?.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID
        : undefined
      : undefined,
  );
  const textTypographySnapshot = useLiveExpressionSnapshot(
    block.type === "text"
      ? block.data.liveTypography?.enabled
        ? block.data.liveTypography?.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID
        : undefined
      : undefined,
  );
  const appearance = resolveBlockAppearance(block, colorSnapshot?.expressions);
  const rotation = normalizeBlockRotation(block.rotation);

  return (
    <div
      className={getSurfaceBlockClassName(block, selected)}
      style={
        {
          left: block.frame.x,
          top: block.frame.y,
          width: block.frame.width,
          height: block.frame.height,
          opacity: block.opacity,
          zIndex: block.zIndex,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center center",
          mixBlendMode: normalizeBlockBlendMode(block.blendMode),
          overflow:
            normalizeBlockClipMode(block.clipMode) === "visible"
              ? "visible"
              : "hidden",
          filter: cssFilterFromBlockFilter(block.filter),
          border: block.showBorder ? "1px solid rgba(31, 41, 51, 0.12)" : "0",
          cursor: mode === "canvas" ? "pointer" : "default",
          backgroundColor: appearance.hasBackground
            ? appearance.backgroundColor
            : "transparent",
          transition: appearance.transition,
        } as CSSProperties
      }
      onPointerDown={
        mode === "canvas"
          ? (event) => onBlockPointerDown?.(block.id, event)
          : undefined
      }
    >
      {renderBlockContent(
        block,
        mode,
        appearance,
        block.type === "image" ? imageLayoutSnapshot?.expressions : undefined,
        block.type === "text" ? textTypographySnapshot?.expressions : undefined,
      )}
      {mode === "canvas" && selected ? (
        <>
          {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
            <div
              key={handle}
              className={`design-surface__resize-handle design-surface__resize-handle--${handle}`}
              onPointerDown={(event) =>
                onResizeHandlePointerDown?.(block.id, handle, event)
              }
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function DesignSurface({
  document,
  mode,
  hideBlocks = false,
  selectedBlockIds = [],
  showGrid = true,
  surfaceRef,
  semanticSlots = [],
  selectedSemanticSlotId,
  showSemanticSlots = false,
  onSurfacePointerDown,
  onBlockPointerDown,
  onResizeHandlePointerDown,
  onSemanticSlotPointerDown,
  onSemanticResizeHandlePointerDown,
}: DesignSurfaceProps) {
  const canvasSnapshot = useLiveExpressionSnapshot(
    document.canvas.liveColorMapping?.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
  );
  const canvasAppearance = resolveLiveMappedAppearance(
    {
      backgroundColor: document.canvas.backgroundColor,
      liveColorMapping: document.canvas.liveColorMapping,
    },
    canvasSnapshot?.expressions,
  );
  const gridGeometry = getGridGeometry(document.canvas, document.grid);
  useEffect(() => {
    const fontFamilies = document.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.data.fontFamily);

    fontFamilies.forEach((fontFamily) => {
      void loadOnlineFontForFamily(fontFamily);
    });
  }, [document.blocks]);
  const gridOverlayStyle: CSSProperties = {
    left: gridGeometry.left,
    top: gridGeometry.top,
    width: gridGeometry.width,
    height: gridGeometry.height,
    backgroundImage: `
      linear-gradient(to right, rgba(31, 41, 51, 0.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(31, 41, 51, 0.08) 1px, transparent 1px)
    `,
    backgroundSize: `${gridGeometry.columnWidth}px ${gridGeometry.rowHeight}px`,
  };

  return (
    <div
      ref={surfaceRef}
      className={`design-surface design-surface--${mode}${
        hideBlocks ? " design-surface--semantic-canvas" : ""
      }`}
      style={{
        width: document.canvas.width,
        height: document.canvas.height,
        backgroundColor:
          canvasAppearance.backgroundColor ?? document.canvas.backgroundColor,
        transition: canvasAppearance.transition,
      }}
      onPointerDown={mode === "canvas" ? onSurfacePointerDown : undefined}
    >
      {showGrid && document.grid.showGrid ? (
        <div className="design-surface__grid-overlay" style={gridOverlayStyle} />
      ) : null}

      {hideBlocks
        ? null
        : document.blocks
            .filter((block) => !block.hidden)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((block) => {
              const selected = selectedBlockIds.includes(block.id);

              return (
                <DesignSurfaceBlock
                  key={block.id}
                  block={block}
                  mode={mode}
                  selected={selected}
                  onBlockPointerDown={onBlockPointerDown}
                  onResizeHandlePointerDown={onResizeHandlePointerDown}
                />
              );
            })}
      {mode === "canvas" && showSemanticSlots
        ? semanticSlots
            .filter((slot) => !slot.hidden)
            .map((slot) => (
              <div
                key={slot.id}
                className={`design-surface__semantic-slot${
                  selectedSemanticSlotId === slot.id
                    ? " design-surface__semantic-slot--selected"
                    : ""
                }${slot.lockedByUser ? " design-surface__semantic-slot--locked" : ""}`}
                style={{
                  left: slot.frame.x,
                  top: slot.frame.y,
                  width: slot.frame.width,
                  height: slot.frame.height,
                  zIndex: 1000 + slot.priority,
                }}
                onPointerDown={(event) =>
                  onSemanticSlotPointerDown?.(slot.id, event)
                }
              >
                <div className="design-surface__semantic-slot-header">
                  <strong>{getSemanticSlotKindLabel(inferSemanticSlotKind(slot))}</strong>
                  <span>{getSemanticSlotPurposeLabel(slot.role)}</span>
                </div>
                <div className="design-surface__semantic-slot-body">
                  <div className="design-surface__semantic-slot-section">
                    <small>Content</small>
                    <p>
                      {summarizeSemanticSlotField(
                        slot.content,
                        "No content specified yet.",
                      )}
                    </p>
                  </div>
                </div>
                {slot.lockedByUser ? (
                  <div className="design-surface__semantic-slot-meta">
                    <span>Locked</span>
                  </div>
                ) : null}
                {selectedSemanticSlotId === slot.id
                  ? (["nw", "ne", "sw", "se"] as ResizeHandle[]).map(
                      (handle) => (
                        <div
                          key={handle}
                          className={`design-surface__semantic-resize-handle design-surface__semantic-resize-handle--${handle}`}
                          onPointerDown={(event) =>
                            onSemanticResizeHandlePointerDown?.(
                              slot.id,
                              handle,
                              event,
                            )
                          }
                        />
                      ),
                    )
                  : null}
              </div>
            ))
        : null}
    </div>
  );
}
