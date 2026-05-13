import type {
  AIGenerationBlock,
  DesignBlock,
  ImageBlock,
  ImageFitMode,
  LiveBlock,
  PatternBlock,
  TextBlock,
} from "../../../entities/block/types";
import {
  cssFilterFromBlockFilter,
  normalizeBlockBlendMode,
  normalizeBlockClipMode,
  normalizeBlockRotation,
} from "../../../entities/block/visualStyle";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import { getGridGeometry } from "../../../entities/grid/geometry";
import {
  DEFAULT_AI_MEDIA_MODE,
  DEFAULT_AI_RESULT_FIT_MODE,
  getAIGenerationPosterFallbackUrl,
} from "../../ai/utils/aiBlockGeneration";
import {
  resolveFittedTextLayout,
  TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER,
  TEXT_BLOCK_PADDING,
  resolveTextBlockPadding,
} from "../utils/textLayout";
import { renderPatternSvgContent } from "../utils/patternRendering";

interface SerializeDocumentToSvgOptions {
  backgroundColor?: string;
  includeGrid?: boolean;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const fitModeToPreserveAspectRatio = (fitMode: ImageFitMode) => {
  if (fitMode === "fill") {
    return "none";
  }

  if (fitMode === "cover") {
    return "xMidYMid slice";
  }

  return "xMidYMid meet";
};

const getSvgBlockGroupAttributes = (block: DesignBlock) => {
  const rotation = normalizeBlockRotation(block.rotation);
  const blendMode = normalizeBlockBlendMode(block.blendMode);
  const filter = cssFilterFromBlockFilter(block.filter);
  const style = [
    blendMode !== "normal" ? `mix-blend-mode:${blendMode}` : "",
    filter ? `filter:${filter}` : "",
  ]
    .filter(Boolean)
    .join(";");

  return [
    `transform="translate(${block.frame.x}, ${block.frame.y}) rotate(${rotation}, ${block.frame.width / 2}, ${block.frame.height / 2})"`,
    `opacity="${block.opacity}"`,
    style ? `style="${escapeXml(style)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const getClipPathAttribute = (block: DesignBlock, clipId: string) =>
  normalizeBlockClipMode(block.clipMode) === "frame"
    ? `clip-path="url(#${clipId})"`
    : "";

const renderGridOverlay = (document: RenderDocumentSnapshot) => {
  if (!document.grid.showGrid) {
    return "";
  }

  const geometry = getGridGeometry(document.canvas, document.grid);
  const gridLineColor = "rgba(31, 41, 51, 0.08)";
  const verticalLines = Array.from({ length: document.grid.columns + 1 }, (_, index) => {
    const x = geometry.left + geometry.columnWidth * index;

    return `<line x1="${x}" y1="${geometry.top}" x2="${x}" y2="${geometry.top + geometry.height}" />`;
  }).join("");
  const horizontalLines = Array.from({ length: document.grid.rows + 1 }, (_, index) => {
    const y = geometry.top + geometry.rowHeight * index;

    return `<line x1="${geometry.left}" y1="${y}" x2="${geometry.left + geometry.width}" y2="${y}" />`;
  }).join("");

  return `
    <g stroke="${gridLineColor}" stroke-width="1" fill="none">
      ${verticalLines}
      ${horizontalLines}
    </g>
  `;
};

let textMeasureContext: CanvasRenderingContext2D | null | undefined;

const getTextMeasureContext = () => {
  if (textMeasureContext !== undefined) {
    return textMeasureContext;
  }

  if (typeof globalThis.document === "undefined") {
    textMeasureContext = null;
    return textMeasureContext;
  }

  textMeasureContext = globalThis.document
    .createElement("canvas")
    .getContext("2d");

  return textMeasureContext;
};

const measureTextWidth = (
  text: string,
  fontFamily: string,
  fontWeight: string,
  fontSize: number,
) => {
  const context = getTextMeasureContext();

  if (!context) {
    return text.length * fontSize * 0.58;
  }

  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
};

const wrapSegmentByWidth = ({
  segment,
  maxWidth,
  fontFamily,
  fontWeight,
  fontSize,
}: {
  segment: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
}) => {
  const lines: string[] = [];
  let currentLine = "";

  for (const character of segment) {
    const candidate = `${currentLine}${character}`;

    if (
      currentLine &&
      measureTextWidth(candidate, fontFamily, fontWeight, fontSize) > maxWidth
    ) {
      lines.push(currentLine);
      currentLine = character;
      continue;
    }

    currentLine = candidate;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const wrapParagraphToWidth = ({
  paragraph,
  maxWidth,
  fontFamily,
  fontWeight,
  fontSize,
}: {
  paragraph: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
}) => {
  if (!paragraph) {
    return [""];
  }

  const segments = paragraph.split(/(\s+)/).filter((segment) => segment.length > 0);
  const lines: string[] = [];
  let currentLine = "";

  const pushCurrentLine = () => {
    lines.push(currentLine.replace(/\s+$/g, "") || " ");
    currentLine = "";
  };

  for (const segment of segments) {
    const candidate = `${currentLine}${segment}`;

    if (
      !currentLine ||
      measureTextWidth(candidate, fontFamily, fontWeight, fontSize) <= maxWidth
    ) {
      currentLine = candidate;
      continue;
    }

    const trimmedSegment = currentLine ? segment.trimStart() : segment;

    if (
      trimmedSegment &&
      measureTextWidth(trimmedSegment, fontFamily, fontWeight, fontSize) <= maxWidth
    ) {
      pushCurrentLine();
      currentLine = trimmedSegment;
      continue;
    }

    if (currentLine) {
      pushCurrentLine();
    }

    const wrappedSegmentLines = wrapSegmentByWidth({
      segment: trimmedSegment || segment,
      maxWidth,
      fontFamily,
      fontWeight,
      fontSize,
    });

    const headLines = wrappedSegmentLines.slice(0, -1);

    lines.push(...headLines);
    currentLine = wrappedSegmentLines[wrappedSegmentLines.length - 1] ?? "";
  }

  if (currentLine) {
    lines.push(currentLine.replace(/\s+$/g, "") || " ");
  }

  return lines.length > 0 ? lines : [" "];
};

const wrapTextBlockLines = (block: TextBlock) => {
  const fontWeight = String(block.data.fontWeight ?? 500);
  const layout = resolveFittedTextLayout({
    text: block.data.content,
    frameWidth: block.frame.width,
    frameHeight: block.frame.height,
    fontFamily: block.data.fontFamily,
    fontWeight,
    requestedFontSize: block.data.fontSize,
    padding: block.data.padding ?? TEXT_BLOCK_PADDING,
    lineHeightMultiplier:
      block.data.lineHeight ?? TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER,
    letterSpacing: block.data.letterSpacing ?? 0,
  });

  return {
    lines: layout.lines,
    lineHeight: layout.lineHeight,
    fontSize: layout.fontSize,
    lineHeightMultiplier: layout.lineHeightMultiplier,
    firstBaselineOffset: layout.firstBaselineOffset,
  };
};

const renderTextBlock = (block: TextBlock) => {
  // Static export intentionally uses the block's stored base text styles.
  // Runtime-only Go Live typography stays in canvas/preview/exhibition for now
  // so SVG export remains stable and deterministic.
  const { lines, lineHeight, fontSize, lineHeightMultiplier, firstBaselineOffset } =
    wrapTextBlockLines(block);
  const fontWeight = String(block.data.fontWeight ?? 500);
  const padding = resolveTextBlockPadding(block.data.padding);
  const textAnchor =
    block.data.textAlign === "center"
      ? "middle"
      : block.data.textAlign === "right"
        ? "end"
        : "start";
  const availableWidth = Math.max(block.frame.width - padding * 2, 0);
  const x =
    block.data.textAlign === "center"
      ? padding + availableWidth / 2
      : block.data.textAlign === "right"
        ? block.frame.width - padding
        : padding;
  const y = padding + firstBaselineOffset;

  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line || " ")}</tspan>`;
    })
    .join("");

  return `
    <g ${getSvgBlockGroupAttributes(block)}>
      <clipPath id="clip-text-${block.id}">
        <rect width="${block.frame.width}" height="${block.frame.height}" rx="0" />
      </clipPath>
      ${
        block.data.backgroundColor
          ? `<rect width="${block.frame.width}" height="${block.frame.height}" rx="0" fill="${escapeXml(block.data.backgroundColor)}" />`
          : ""
      }
      <text
        x="${x}"
        y="${y}"
        text-anchor="${textAnchor}"
        fill="${escapeXml(block.data.textColor)}"
        font-family="${escapeXml(block.data.fontFamily)}"
        font-size="${fontSize}"
        font-weight="${escapeXml(fontWeight)}"
        letter-spacing="${block.data.letterSpacing ?? 0}"
        line-height="${lineHeightMultiplier}"
        ${getClipPathAttribute(block, `clip-text-${block.id}`)}
        xml:space="preserve"
      >
        ${tspans}
      </text>
    </g>
  `;
};

const renderImageBlock = (block: ImageBlock) => {
  const background = block.data.backgroundColor;

  if (!block.data.asset?.src) {
    return `
      <g ${getSvgBlockGroupAttributes(block)}>
        ${
          background
            ? `<rect width="${block.frame.width}" height="${block.frame.height}" rx="0" fill="${escapeXml(background)}" />`
            : ""
        }
        ${
          block.showBorder
            ? `<rect
                x="1"
                y="1"
                width="${Math.max(block.frame.width - 2, 0)}"
                height="${Math.max(block.frame.height - 2, 0)}"
                rx="0"
                fill="none"
                stroke="rgba(31, 41, 51, 0.18)"
                stroke-dasharray="6 4"
              />`
            : ""
        }
        <text
          x="${block.frame.width / 2}"
          y="${block.frame.height / 2 - 6}"
          text-anchor="middle"
          fill="#475467"
          font-family="IBM Plex Sans, Arial, sans-serif"
          font-size="16"
          font-weight="700"
        >
          Image Asset
        </text>
        <text
          x="${block.frame.width / 2}"
          y="${block.frame.height / 2 + 18}"
          text-anchor="middle"
          fill="#667085"
          font-family="IBM Plex Sans, Arial, sans-serif"
          font-size="12"
        >
          Upload raster or vector
        </text>
      </g>
    `;
  }

  return `
    <g ${getSvgBlockGroupAttributes(block)}>
      <clipPath id="clip-${block.id}">
        <rect width="${block.frame.width}" height="${block.frame.height}" rx="0" />
      </clipPath>
      ${
        background
          ? `<rect width="${block.frame.width}" height="${block.frame.height}" rx="0" fill="${escapeXml(background)}" />`
          : ""
      }
      <image
        href="${escapeXml(block.data.asset.src)}"
        width="${block.frame.width}"
        height="${block.frame.height}"
        preserveAspectRatio="${fitModeToPreserveAspectRatio(block.data.fitMode)}"
        ${getClipPathAttribute(block, `clip-${block.id}`)}
      />
    </g>
  `;
};

const renderAIPlaceholder = (block: AIGenerationBlock) => `
  <g ${getSvgBlockGroupAttributes(block)}>
    ${
      block.showBorder
        ? `<rect
            x="1"
            y="1"
            width="${Math.max(block.frame.width - 2, 0)}"
            height="${Math.max(block.frame.height - 2, 0)}"
            rx="0"
            fill="none"
            stroke="rgba(31, 41, 51, 0.22)"
            stroke-dasharray="6 4"
          />`
        : ""
    }
    <text
      x="${block.frame.width / 2}"
      y="${block.frame.height / 2 - 8}"
      text-anchor="middle"
      fill="#334155"
      font-family="IBM Plex Sans, Arial, sans-serif"
      font-size="16"
      font-weight="700"
    >
      ${escapeXml(
        block.data.placeholderLabel ??
          ((block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE) === "video"
            ? "AI video area"
            : "AI photo area"),
      )}
    </text>
    <text
      x="${block.frame.width / 2}"
      y="${block.frame.height / 2 + 18}"
      text-anchor="middle"
      fill="#475467"
      font-family="IBM Plex Sans, Arial, sans-serif"
      font-size="12"
    >
      ${escapeXml(
        block.data.prompt ||
          ((block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE) === "video"
            ? "Video prompt not set"
            : "Prompt not set"),
      )}
    </text>
  </g>
`;

const renderAIBlock = (block: AIGenerationBlock) => {
  const mediaMode = block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE;

  if (mediaMode === "video") {
    const videoFallbackUrl = getAIGenerationPosterFallbackUrl(block.data);

    if (videoFallbackUrl) {
      return `
        <g ${getSvgBlockGroupAttributes(block)}>
          <clipPath id="clip-${block.id}">
            <rect width="${block.frame.width}" height="${block.frame.height}" rx="0" />
          </clipPath>
          <image
            href="${escapeXml(videoFallbackUrl)}"
            width="${block.frame.width}"
            height="${block.frame.height}"
            preserveAspectRatio="${fitModeToPreserveAspectRatio(
              block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
            )}"
            ${getClipPathAttribute(block, `clip-${block.id}`)}
          />
        </g>
      `;
    }

    return renderAIPlaceholder(block);
  }

  if (block.data.resultPreviewUrl || block.data.resultImageUrl) {
    const resultUrl = block.data.resultPreviewUrl ?? block.data.resultImageUrl;

    return `
      <g ${getSvgBlockGroupAttributes(block)}>
        <clipPath id="clip-${block.id}">
          <rect width="${block.frame.width}" height="${block.frame.height}" rx="0" />
        </clipPath>
        <image
          href="${escapeXml(resultUrl ?? "")}"
          width="${block.frame.width}"
          height="${block.frame.height}"
          preserveAspectRatio="${fitModeToPreserveAspectRatio(
            block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
          )}"
          ${getClipPathAttribute(block, `clip-${block.id}`)}
        />
      </g>
    `;
  }

  return renderAIPlaceholder(block);
};

const renderLiveBlock = (block: LiveBlock) => `
  <g ${getSvgBlockGroupAttributes(block)}>
    ${
      block.data.backgroundColor
        ? `<rect width="${block.frame.width}" height="${block.frame.height}" rx="0" fill="${escapeXml(block.data.backgroundColor)}" />`
        : ""
    }
    ${
      block.showBorder
        ? `<rect
            x="1"
            y="1"
            width="${Math.max(block.frame.width - 2, 0)}"
            height="${Math.max(block.frame.height - 2, 0)}"
            rx="0"
            fill="none"
            stroke="rgba(248, 250, 252, 0.42)"
            stroke-dasharray="6 4"
          />`
        : ""
    }
    <text
      x="${block.frame.width / 2}"
      y="${block.frame.height / 2 - 8}"
      text-anchor="middle"
      fill="#f8fafc"
      font-family="IBM Plex Sans, Arial, sans-serif"
      font-size="16"
      font-weight="700"
    >
      ${escapeXml(block.data.placeholderLabel ?? "Live Block")}
    </text>
    <text
      x="${block.frame.width / 2}"
      y="${block.frame.height / 2 + 18}"
      text-anchor="middle"
      fill="#cbd5e1"
      font-family="IBM Plex Sans, Arial, sans-serif"
      font-size="12"
    >
      MediaPipe live source is not embedded in static export
    </text>
  </g>
`;

const renderPatternBlock = (block: PatternBlock) => `
  <g ${getSvgBlockGroupAttributes(block)}>
    ${renderPatternSvgContent({
      data: block.data,
      width: block.frame.width,
      height: block.frame.height,
      id: block.id,
    })}
  </g>
`;

const renderBlock = (block: DesignBlock) => {
  if (block.type === "text") {
    return renderTextBlock(block);
  }

  if (block.type === "image") {
    return renderImageBlock(block);
  }

  if (block.type === "live") {
    return renderLiveBlock(block);
  }

  if (block.type === "pattern") {
    return renderPatternBlock(block);
  }

  return renderAIBlock(block);
};

export const serializeDocumentToSvg = (
  document: RenderDocumentSnapshot,
  options: SerializeDocumentToSvgOptions = {},
) => {
  // Export intentionally follows presentation rendering rules:
  // no selection outlines, resize handles, or editor-only overlays.
  const backgroundColor = options.backgroundColor ?? document.canvas.backgroundColor;
  const blocks = [...document.blocks]
    .filter((block) => !block.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((block) => renderBlock(block))
    .join("");

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${document.canvas.width}"
      height="${document.canvas.height}"
      viewBox="0 0 ${document.canvas.width} ${document.canvas.height}"
    >
      <rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}" />
      ${options.includeGrid ? renderGridOverlay(document) : ""}
      ${blocks}
    </svg>
  `.trim();
};
