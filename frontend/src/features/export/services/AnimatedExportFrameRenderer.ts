import type {
  AIGenerationBlock,
  DesignBlock,
  ImageBlock,
  ImageFitMode,
  LiveBlock,
  TextBlock,
} from "../../../entities/block/types";
import {
  canvasCompositeOperationFromBlendMode,
  cssFilterFromBlockFilter,
  normalizeBlockClipMode,
  normalizeBlockRotation,
} from "../../../entities/block/visualStyle";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import {
  DEFAULT_AI_MEDIA_MODE,
  DEFAULT_AI_RESULT_FIT_MODE,
  getAIGenerationPosterFallbackUrl,
} from "../../ai/utils/aiBlockGeneration";
import {
  GLOBAL_LIVE_SOURCE_ID,
  acquireSharedCameraForExport,
  getSharedLiveCameraState,
  registerLiveAlias,
  unregisterLiveAlias,
} from "../../live/runtime/sharedLiveCamera";
import { getLiveExpressionSnapshot } from "../../live/runtime/liveExpressionStore";
import { resolveBlockAppearance, resolveLiveMappedAppearance } from "../../live/utils/liveColorMapping";
import {
  resolveImageLiveLayoutInstances,
  withDefaultImageLiveLayout,
} from "../../live/utils/imageLiveLayout";
import { resolveTextLiveTypographyStyle } from "../../live/utils/textLiveTypography";
import { ensureDocumentFontsLoaded } from "../../typography/fontCatalog";
import {
  resolveFittedTextLayout,
  TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER,
  TEXT_BLOCK_PADDING,
  resolveTextBlockPadding,
} from "../../rendering/utils/textLayout";
import { drawPatternToCanvas } from "../../rendering/utils/patternRendering";
import type { AnimatedExportStage, AnimatedExportPayload } from "../types";

const LIVE_BLOCK_VIDEO_FIT_MODE: ImageFitMode = "cover";
const MIN_VIDEO_TIME_EPSILON_SECONDS = 1 / 240;

type SharedCameraExportHandle = Awaited<
  ReturnType<typeof acquireSharedCameraForExport>
>;

interface PreparedMedia {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
}

export interface AnimatedExportFrameRenderer {
  renderFrame: (timestampMs: number) => Promise<void>;
  dispose: () => void;
}

const hasEnabledFlag = (value: unknown): boolean =>
  typeof value === "object" &&
  value != null &&
  "enabled" in value &&
  (value as { enabled?: unknown }).enabled === true;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load export image resource: ${url}`));
    image.src = url;
  });

const waitForVideoReady = (video: HTMLVideoElement, sourceUrl: string) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("error", handleError);
    };

    const handleLoadedData = () => {
      cleanup();
      resolve(video);
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load export video resource: ${sourceUrl}`));
    };

    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.load();
  });

const loadVideo = async (sourceUrl: string) => {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.loop = false;
  video.autoplay = false;
  video.src = sourceUrl;

  return waitForVideoReady(video, sourceUrl);
};

const waitForSeek = (
  video: HTMLVideoElement,
  targetTimeSeconds: number,
) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Failed to seek export video frame."));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = targetTimeSeconds;
  });

const fitMedia = ({
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
  fitMode,
}: {
  containerWidth: number;
  containerHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  fitMode: ImageFitMode;
}) => {
  if (fitMode === "fill" || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
    };
  }

  const scale =
    fitMode === "cover"
      ? Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight)
      : Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
};

const drawFittedMedia = ({
  context,
  blockFrame,
  source,
  sourceWidth,
  sourceHeight,
  fitMode,
  opacity,
  mirrorX = false,
  clipToFrame = true,
}: {
  context: CanvasRenderingContext2D;
  blockFrame: DesignBlock["frame"];
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  fitMode: ImageFitMode;
  opacity: number;
  mirrorX?: boolean;
  clipToFrame?: boolean;
}) => {
  const fitted = fitMedia({
    containerWidth: blockFrame.width,
    containerHeight: blockFrame.height,
    sourceWidth,
    sourceHeight,
    fitMode,
  });

  context.save();
  context.globalAlpha = opacity;

  if (clipToFrame) {
    context.beginPath();
    context.rect(blockFrame.x, blockFrame.y, blockFrame.width, blockFrame.height);
    context.clip();
  }

  if (mirrorX) {
    context.translate(blockFrame.x + blockFrame.width / 2, 0);
    context.scale(-1, 1);
    context.translate(-(blockFrame.x + blockFrame.width / 2), 0);
  }

  context.drawImage(
    source,
    blockFrame.x + fitted.x,
    blockFrame.y + fitted.y,
    fitted.width,
    fitted.height,
  );
  context.restore();
};

const getMediaSourceDimensions = (source: CanvasImageSource) => {
  if ("videoWidth" in source && typeof source.videoWidth === "number") {
    return {
      width: source.videoWidth || 0,
      height: source.videoHeight || 0,
    };
  }

  if ("naturalWidth" in source && typeof source.naturalWidth === "number") {
    return {
      width: source.naturalWidth || 0,
      height: source.naturalHeight || 0,
    };
  }

  return {
    width: 0,
    height: 0,
  };
};

const getSourceExpressions = (sourceBlockId?: string) =>
  getLiveExpressionSnapshot(sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID)?.expressions;

const getSourceAliasIds = (document: RenderDocumentSnapshot) => {
  const aliases = new Set<string>();
  const maybeAdd = (sourceBlockId?: string) => {
    if (sourceBlockId && sourceBlockId !== GLOBAL_LIVE_SOURCE_ID) {
      aliases.add(sourceBlockId);
    }
  };

  maybeAdd(document.canvas.liveColorMapping?.sourceBlockId);

  for (const block of document.blocks) {
    if (block.type === "live") {
      aliases.add(block.id);
      continue;
    }

    if (block.type === "text") {
      maybeAdd(block.data.liveColorMapping?.sourceBlockId);
      maybeAdd(block.data.liveTypography?.sourceBlockId);
      continue;
    }

    if (block.type === "image") {
      maybeAdd(block.data.liveColorMapping?.sourceBlockId);
      maybeAdd(block.data.liveLayout?.sourceBlockId);
      continue;
    }

    if (block.type === "ai-generation") {
      maybeAdd(block.data.liveColorMapping?.sourceBlockId);
    }
  }

  return [...aliases];
};

const documentUsesLiveRuntime = (document: RenderDocumentSnapshot) => {
  if (hasEnabledFlag(document.canvas.liveColorMapping)) {
    return true;
  }

  return document.blocks.some((block) => {
    if (block.type === "live") {
      return true;
    }

    if (block.type === "text") {
      return (
        hasEnabledFlag(block.data.liveColorMapping) ||
        hasEnabledFlag(block.data.liveTypography)
      );
    }

    if (block.type === "image") {
      return (
        hasEnabledFlag(block.data.liveColorMapping) ||
        hasEnabledFlag(block.data.liveLayout)
      );
    }

    if (block.type === "ai-generation") {
      return hasEnabledFlag(block.data.liveColorMapping);
    }

    return false;
  });
};

const getTextMeasureContext = (() => {
  let context: CanvasRenderingContext2D | null | undefined;

  return () => {
    if (context !== undefined) {
      return context;
    }

    context = document.createElement("canvas").getContext("2d");
    return context;
  };
})();

const drawTextLine = ({
  context,
  text,
  x,
  y,
  letterSpacing,
}: {
  context: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  letterSpacing: number;
}) => {
  if (letterSpacing === 0 || text.length <= 1) {
    context.fillText(text, x, y);
    return;
  }

  let currentX = x;

  for (const character of text) {
    context.fillText(character, currentX, y);
    currentX += context.measureText(character).width + letterSpacing;
  }
};

const measureTextWidth = ({
  text,
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing,
}: {
  text: string;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing: number;
}) => {
  const context = getTextMeasureContext();

  if (!context) {
    return text.length * fontSize * 0.58 + Math.max(text.length - 1, 0) * letterSpacing;
  }

  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const width = context.measureText(text).width;
  return width + Math.max(text.length - 1, 0) * letterSpacing;
};

const wrapSegmentByWidth = ({
  segment,
  maxWidth,
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing,
}: {
  segment: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing: number;
}) => {
  const lines: string[] = [];
  let currentLine = "";

  for (const character of segment) {
    const candidate = `${currentLine}${character}`;

    if (
      currentLine &&
      measureTextWidth({
        text: candidate,
        fontFamily,
        fontWeight,
        fontSize,
        letterSpacing,
      }) > maxWidth
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
  letterSpacing,
}: {
  paragraph: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing: number;
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
      measureTextWidth({
        text: candidate,
        fontFamily,
        fontWeight,
        fontSize,
        letterSpacing,
      }) <= maxWidth
    ) {
      currentLine = candidate;
      continue;
    }

    const trimmedSegment = currentLine ? segment.trimStart() : segment;

    if (
      trimmedSegment &&
      measureTextWidth({
        text: trimmedSegment,
        fontFamily,
        fontWeight,
        fontSize,
        letterSpacing,
      }) <= maxWidth
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
      letterSpacing,
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

const resolveWrappedTextLines = ({
  block,
  fontSize,
  letterSpacing,
}: {
  block: TextBlock;
  fontSize: number;
  letterSpacing: number;
}) => {
  const fontWeight = String(block.data.fontWeight ?? 500);
  const layout = resolveFittedTextLayout({
    text: block.data.content,
    frameWidth: block.frame.width,
    frameHeight: block.frame.height,
    fontFamily: block.data.fontFamily,
    fontWeight,
    requestedFontSize: fontSize,
    padding: block.data.padding ?? TEXT_BLOCK_PADDING,
    lineHeightMultiplier:
      block.data.lineHeight ?? TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER,
    letterSpacing,
  });

  return {
    lines: layout.lines,
    lineHeight: layout.lineHeight,
    fontSize: layout.fontSize,
    lineHeightMultiplier: layout.lineHeightMultiplier,
    firstBaselineOffset: layout.firstBaselineOffset,
  };
};

const parseTranslate = (transform: string) => {
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);

  return {
    x: match ? Number(match[1]) : 0,
    y: match ? Number(match[2]) : 0,
  };
};

const drawLandmarks = ({
  context,
  block,
  mirrorX,
}: {
  context: CanvasRenderingContext2D;
  block: LiveBlock;
  mirrorX: boolean;
}) => {
  const frame = getSharedLiveCameraState().frame;

  if (!frame?.landmarks.length) {
    return;
  }

  context.save();
  context.globalAlpha = block.opacity;
  if (normalizeBlockClipMode(block.clipMode) === "frame") {
    context.beginPath();
    context.rect(block.frame.x, block.frame.y, block.frame.width, block.frame.height);
    context.clip();
  }

  for (const point of frame.landmarks) {
    const px = block.frame.x + (mirrorX ? 1 - point.x : point.x) * block.frame.width;
    const py = block.frame.y + point.y * block.frame.height;
    const radius =
      point.region === "face" ? 2.2 : point.region === "hand" ? 3.2 : 3.8;

    context.fillStyle =
      point.region === "face"
        ? "#38f8b7"
        : point.region === "hand"
          ? "#fbbf24"
          : "#60a5fa";
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
};

const prepareMedia = async (document: RenderDocumentSnapshot) => {
  const imageUrls = new Set<string>();
  const videoUrls = new Set<string>();

  for (const block of document.blocks) {
    if (block.hidden) {
      continue;
    }

    if (block.type === "image" && block.data.asset?.src) {
      imageUrls.add(block.data.asset.src);
      continue;
    }

    if (block.type === "ai-generation") {
      if ((block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE) === "video") {
        if (block.data.resultVideoUrl) {
          videoUrls.add(block.data.resultVideoUrl);
        }

        const fallbackUrl = getAIGenerationPosterFallbackUrl(block.data);

        if (fallbackUrl) {
          imageUrls.add(fallbackUrl);
        }

        continue;
      }

      if (block.data.resultPreviewUrl ?? block.data.resultImageUrl) {
        imageUrls.add(block.data.resultPreviewUrl ?? block.data.resultImageUrl!);
      }
    }
  }

  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();

  await Promise.all(
    [...imageUrls].map(async (url) => {
      images.set(url, await loadImage(url));
    }),
  );

  await Promise.all(
    [...videoUrls].map(async (url) => {
      videos.set(url, await loadVideo(url));
    }),
  );

  return {
    images,
    videos,
  } satisfies PreparedMedia;
};

const syncVideoToTimestamp = async (
  video: HTMLVideoElement,
  timestampMs: number,
  frameRate: number,
) => {
  const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;

  if (durationSeconds <= 0) {
    return false;
  }

  const loopedTimeSeconds =
    ((timestampMs % (durationSeconds * 1000)) / 1000) %
    Math.max(durationSeconds, MIN_VIDEO_TIME_EPSILON_SECONDS);

  if (
    Math.abs(video.currentTime - loopedTimeSeconds) >
    Math.max(1 / frameRate, MIN_VIDEO_TIME_EPSILON_SECONDS)
  ) {
    await waitForSeek(
      video,
      Math.min(
        loopedTimeSeconds,
        Math.max(durationSeconds - MIN_VIDEO_TIME_EPSILON_SECONDS, 0),
      ),
    );
  }

  return true;
};

const drawTextBlock = ({
  context,
  block,
  expressions,
}: {
  context: CanvasRenderingContext2D;
  block: TextBlock;
  expressions: Record<string, number> | undefined;
}) => {
  const appearance = resolveBlockAppearance(block, expressions);
  const typographyStyle = resolveTextLiveTypographyStyle({
    blockData: block.data,
    expressions: getSourceExpressions(
      block.data.liveTypography?.enabled
        ? block.data.liveTypography.sourceBlockId
        : undefined,
    ),
  });
  const letterSpacing = typographyStyle.letterSpacing;
  const fontWeight = String(block.data.fontWeight ?? 500);
  const { lines, lineHeight, fontSize, firstBaselineOffset } = resolveWrappedTextLines({
    block,
    fontSize: typographyStyle.fontSize,
    letterSpacing,
  });

  context.save();
  context.globalAlpha = block.opacity;

  if (appearance.hasBackground && appearance.backgroundColor) {
    context.fillStyle = appearance.backgroundColor;
    context.fillRect(
      block.frame.x,
      block.frame.y,
      block.frame.width,
      block.frame.height,
    );
  }

  context.beginPath();
  context.rect(block.frame.x, block.frame.y, block.frame.width, block.frame.height);
  context.clip();

  context.fillStyle = block.data.textColor;
  context.font = `${fontWeight} ${fontSize}px ${block.data.fontFamily}`;
  context.textAlign = block.data.textAlign ?? "left";
  context.textBaseline = "alphabetic";
  const padding = resolveTextBlockPadding(block.data.padding);

  const availableWidth = Math.max(block.frame.width - padding * 2, 0);
  const x =
    block.data.textAlign === "center"
      ? block.frame.x + padding + availableWidth / 2
      : block.data.textAlign === "right"
        ? block.frame.x + block.frame.width - padding
        : block.frame.x + padding;
  const y = block.frame.y + padding + firstBaselineOffset;

  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight;

    if ((block.data.textAlign ?? "left") === "left") {
      drawTextLine({
        context,
        text: line || " ",
        x,
        y: lineY,
        letterSpacing,
      });
      return;
    }

    if ((block.data.textAlign ?? "left") === "center") {
      const width = measureTextWidth({
        text: line || " ",
        fontFamily: block.data.fontFamily,
        fontWeight,
        fontSize,
        letterSpacing,
      });
      drawTextLine({
        context,
        text: line || " ",
        x: x - width / 2,
        y: lineY,
        letterSpacing,
      });
      return;
    }

    const width = measureTextWidth({
      text: line || " ",
      fontFamily: block.data.fontFamily,
      fontWeight,
      fontSize,
      letterSpacing,
    });
    drawTextLine({
      context,
      text: line || " ",
      x: x - width,
      y: lineY,
      letterSpacing,
    });
  });

  context.restore();
};

const drawImageBlock = ({
  context,
  block,
  media,
}: {
  context: CanvasRenderingContext2D;
  block: ImageBlock;
  media: PreparedMedia;
}) => {
  const colorExpressions = getSourceExpressions(block.data.liveColorMapping?.sourceBlockId);
  const layoutExpressions = getSourceExpressions(
    block.data.liveLayout?.enabled ? block.data.liveLayout.sourceBlockId : undefined,
  );
  const appearance = resolveBlockAppearance(block, colorExpressions);

  context.save();
  context.globalAlpha = block.opacity;

  if (appearance.hasBackground && appearance.backgroundColor) {
    context.fillStyle = appearance.backgroundColor;
    context.fillRect(
      block.frame.x,
      block.frame.y,
      block.frame.width,
      block.frame.height,
    );
  }
  context.restore();

  if (!block.data.asset?.src) {
    return;
  }

  const image = media.images.get(block.data.asset.src);

  if (!image) {
    return;
  }

  const liveLayout = withDefaultImageLiveLayout(block.data.liveLayout);

  if (liveLayout.enabled) {
    const instances = resolveImageLiveLayoutInstances({
      width: block.frame.width,
      height: block.frame.height,
      liveLayout,
      expressions: layoutExpressions,
    });

    for (const instance of instances) {
      const offset = parseTranslate(instance.transform);
      drawFittedMedia({
        context,
        blockFrame: {
          x: block.frame.x + instance.x + offset.x,
          y: block.frame.y + instance.y + offset.y,
          width: instance.width,
          height: instance.height,
        },
        source: image,
        sourceWidth: image.naturalWidth || block.frame.width,
        sourceHeight: image.naturalHeight || block.frame.height,
        fitMode: block.data.fitMode,
        opacity: block.opacity,
        clipToFrame: normalizeBlockClipMode(block.clipMode) === "frame",
      });
    }

    return;
  }

  drawFittedMedia({
    context,
    blockFrame: block.frame,
    source: image,
    sourceWidth: image.naturalWidth || block.frame.width,
    sourceHeight: image.naturalHeight || block.frame.height,
    fitMode: block.data.fitMode,
    opacity: block.opacity,
    clipToFrame: normalizeBlockClipMode(block.clipMode) === "frame",
  });
};

const drawAIMediaBlock = async ({
  context,
  block,
  timestampMs,
  frameRate,
  media,
}: {
  context: CanvasRenderingContext2D;
  block: AIGenerationBlock;
  timestampMs: number;
  frameRate: number;
  media: PreparedMedia;
}) => {
  const aiMediaMode = block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE;

  if (aiMediaMode === "video" && block.data.resultVideoUrl) {
    const video = media.videos.get(block.data.resultVideoUrl);

    if (video) {
      const synced = await syncVideoToTimestamp(video, timestampMs, frameRate);

      if (synced) {
        const dimensions = getMediaSourceDimensions(video);
        drawFittedMedia({
          context,
          blockFrame: block.frame,
          source: video,
          sourceWidth: dimensions.width || block.frame.width,
          sourceHeight: dimensions.height || block.frame.height,
          fitMode: block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
          opacity: block.opacity,
          clipToFrame: normalizeBlockClipMode(block.clipMode) === "frame",
        });
        return;
      }
    }
  }

  const fallbackUrl =
    aiMediaMode === "video"
      ? getAIGenerationPosterFallbackUrl(block.data)
      : block.data.resultPreviewUrl ?? block.data.resultImageUrl;

  if (!fallbackUrl) {
    return;
  }

  const fallbackImage = media.images.get(fallbackUrl);

  if (!fallbackImage) {
    return;
  }

  drawFittedMedia({
    context,
    blockFrame: block.frame,
    source: fallbackImage,
    sourceWidth: fallbackImage.naturalWidth || block.frame.width,
    sourceHeight: fallbackImage.naturalHeight || block.frame.height,
    fitMode: block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
    opacity: block.opacity,
    clipToFrame: normalizeBlockClipMode(block.clipMode) === "frame",
  });
};

const drawLiveBlock = ({
  context,
  block,
  liveVideoElement,
}: {
  context: CanvasRenderingContext2D;
  block: LiveBlock;
  liveVideoElement: HTMLVideoElement | null;
}) => {
  context.save();
  context.globalAlpha = block.opacity;
  context.fillStyle = block.data.backgroundColor ?? "#0f172a";
  context.fillRect(
    block.frame.x,
    block.frame.y,
    block.frame.width,
    block.frame.height,
  );
  context.restore();

  if (block.data.showVideo && liveVideoElement) {
    const dimensions = getMediaSourceDimensions(liveVideoElement);
    drawFittedMedia({
      context,
      blockFrame: block.frame,
      source: liveVideoElement,
      sourceWidth: dimensions.width || block.frame.width,
      sourceHeight: dimensions.height || block.frame.height,
      fitMode: LIVE_BLOCK_VIDEO_FIT_MODE,
      opacity: block.opacity,
      mirrorX: true,
      clipToFrame: normalizeBlockClipMode(block.clipMode) === "frame",
    });
  }

  if (block.data.showLandmarks) {
    drawLandmarks({
      context,
      block,
      mirrorX: true,
    });
  }
};

const drawPatternBlock = ({
  context,
  block,
}: {
  context: CanvasRenderingContext2D;
  block: Extract<DesignBlock, { type: "pattern" }>;
}) => {
  drawPatternToCanvas({
    context,
    data: block.data,
    x: block.frame.x,
    y: block.frame.y,
    width: block.frame.width,
    height: block.frame.height,
  });
};

const drawBlock = async ({
  context,
  block,
  timestampMs,
  frameRate,
  media,
  liveVideoElement,
}: {
  context: CanvasRenderingContext2D;
  block: DesignBlock;
  timestampMs: number;
  frameRate: number;
  media: PreparedMedia;
  liveVideoElement: HTMLVideoElement | null;
}) => {
  if (block.hidden) {
    return;
  }

  context.save();
  const rotation = normalizeBlockRotation(block.rotation);
  const centerX = block.frame.x + block.frame.width / 2;
  const centerY = block.frame.y + block.frame.height / 2;
  context.translate(centerX, centerY);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-centerX, -centerY);
  context.globalCompositeOperation = canvasCompositeOperationFromBlendMode(
    block.blendMode,
  );
  context.filter = cssFilterFromBlockFilter(block.filter) ?? "none";

  if (normalizeBlockClipMode(block.clipMode) === "frame") {
    context.beginPath();
    context.rect(block.frame.x, block.frame.y, block.frame.width, block.frame.height);
    context.clip();
  }

  try {
    switch (block.type) {
      case "text":
        drawTextBlock({
          context,
          block,
          expressions: getSourceExpressions(block.data.liveColorMapping?.sourceBlockId),
        });
        return;
      case "image":
        drawImageBlock({
          context,
          block,
          media,
        });
        return;
      case "ai-generation":
        await drawAIMediaBlock({
          context,
          block,
          timestampMs,
          frameRate,
          media,
        });
        return;
      case "live":
        drawLiveBlock({
          context,
          block,
          liveVideoElement,
        });
        return;
      case "pattern":
        drawPatternBlock({
          context,
          block,
        });
    }
  } finally {
    context.restore();
  }
};

const cleanupMedia = (media: PreparedMedia) => {
  media.videos.forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
};

export const createAnimatedExportFrameRenderer = async ({
  payload,
  canvas,
}: {
  payload: AnimatedExportPayload;
  canvas: HTMLCanvasElement;
}): Promise<AnimatedExportFrameRenderer> => {
  const { document, options } = payload;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas context is not available for animated export.");
  }

  options.onStageChange?.("preparing-assets");
  await ensureDocumentFontsLoaded(document);

  const usesLiveRuntime = documentUsesLiveRuntime(document);
  const aliasIds = getSourceAliasIds(document);
  let sharedCameraHandle: SharedCameraExportHandle | null = null;

  if (usesLiveRuntime) {
    options.onStageChange?.("starting-live-camera");
    aliasIds.forEach((aliasId) => registerLiveAlias(aliasId));
    sharedCameraHandle = await acquireSharedCameraForExport();
  }

  const media = await prepareMedia(document);
  const sortedBlocks = [...document.blocks]
    .filter((block) => !block.hidden)
    .sort((left, right) => left.zIndex - right.zIndex);

  canvas.width = document.canvas.width;
  canvas.height = document.canvas.height;

  return {
    renderFrame: async (timestampMs: number) => {
      const canvasAppearance = resolveLiveMappedAppearance(
        {
          backgroundColor: document.canvas.backgroundColor,
          liveColorMapping: document.canvas.liveColorMapping,
        },
        getSourceExpressions(document.canvas.liveColorMapping?.sourceBlockId),
      );

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle =
        canvasAppearance.backgroundColor ?? document.canvas.backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (const block of sortedBlocks) {
        await drawBlock({
          context,
          block,
          timestampMs,
          frameRate: options.frameRate,
          media,
          liveVideoElement: sharedCameraHandle?.videoElement ?? null,
        });
      }
    },
    dispose: () => {
      cleanupMedia(media);
      sharedCameraHandle?.release();
      aliasIds.forEach((aliasId) => unregisterLiveAlias(aliasId));
    },
  };
};
