export const TEXT_BLOCK_PADDING = 0;
export const TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER = 0.95;
export const TEXT_BLOCK_MIN_FIT_FONT_SIZE = 8;
export const TEXT_BLOCK_MAX_PADDING = 96;
export const TEXT_BLOCK_MIN_TOP_INSET_FACTOR = 0.12;
export const TEXT_BLOCK_FALLBACK_ASCENT_FACTOR = 0.84;
export const TEXT_BLOCK_FALLBACK_DESCENT_FACTOR = 0.24;

export const resolveTextBlockPadding = (padding?: number) =>
  typeof padding === "number" && Number.isFinite(padding)
    ? Math.max(0, Math.min(TEXT_BLOCK_MAX_PADDING, padding))
    : TEXT_BLOCK_PADDING;

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

export const measureTextVerticalMetrics = ({
  fontFamily,
  fontWeight,
  fontSize,
}: {
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
}) => {
  const fallback = {
    ascent: fontSize * TEXT_BLOCK_FALLBACK_ASCENT_FACTOR,
    descent: fontSize * TEXT_BLOCK_FALLBACK_DESCENT_FACTOR,
  };
  const context = getTextMeasureContext();

  if (!context) {
    return fallback;
  }

  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = context.measureText("HgAy");
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;

  return {
    ascent:
      typeof ascent === "number" && Number.isFinite(ascent) && ascent > 0
        ? ascent
        : fallback.ascent,
    descent:
      typeof descent === "number" && Number.isFinite(descent) && descent >= 0
        ? descent
        : fallback.descent,
  };
};

export const resolveTextTopInset = ({
  fontSize,
  fontFamily,
  fontWeight,
}: {
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}) => {
  const metrics = measureTextVerticalMetrics({
    fontFamily,
    fontWeight,
    fontSize,
  });
  const minimumTopInset = Math.max(2, fontSize * TEXT_BLOCK_MIN_TOP_INSET_FACTOR);

  return {
    topInset: minimumTopInset,
    ascent: metrics.ascent,
    descent: metrics.descent,
    firstBaselineOffset: minimumTopInset + metrics.ascent,
  };
};

export const measureTextWidth = ({
  text,
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing = 0,
}: {
  text: string;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing?: number;
}) => {
  const context = getTextMeasureContext();

  if (!context) {
    return text.length * fontSize * 0.58 +
      Math.max(text.length - 1, 0) * letterSpacing;
  }

  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return context.measureText(text).width +
    Math.max(text.length - 1, 0) * letterSpacing;
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

export const wrapParagraphToWidth = ({
  paragraph,
  maxWidth,
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing = 0,
}: {
  paragraph: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing?: number;
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

    lines.push(...wrappedSegmentLines.slice(0, -1));
    currentLine = wrappedSegmentLines[wrappedSegmentLines.length - 1] ?? "";
  }

  if (currentLine) {
    lines.push(currentLine.replace(/\s+$/g, "") || " ");
  }

  return lines.length > 0 ? lines : [" "];
};

const resolveLinesForFontSize = ({
  text,
  maxWidth,
  fontFamily,
  fontWeight,
  fontSize,
  letterSpacing,
}: {
  text: string;
  maxWidth: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  letterSpacing: number;
}) =>
  text.split("\n").flatMap((paragraph) =>
    wrapParagraphToWidth({
      paragraph,
      maxWidth,
      fontFamily,
      fontWeight,
      fontSize,
      letterSpacing,
    }),
  );

export const resolveFittedTextLayout = ({
  text,
  frameWidth,
  frameHeight,
  fontFamily,
  fontWeight,
  requestedFontSize,
  padding = TEXT_BLOCK_PADDING,
  lineHeightMultiplier = TEXT_BLOCK_LINE_HEIGHT_MULTIPLIER,
  letterSpacing = 0,
  minFontSize = TEXT_BLOCK_MIN_FIT_FONT_SIZE,
}: {
  text: string;
  frameWidth: number;
  frameHeight: number;
  fontFamily: string;
  fontWeight: string;
  requestedFontSize: number;
  padding?: number;
  lineHeightMultiplier?: number;
  letterSpacing?: number;
  minFontSize?: number;
}) => {
  const resolvedPadding = resolveTextBlockPadding(padding);
  const availableWidth = Math.max(frameWidth - resolvedPadding * 2, 0);
  const availableHeight = Math.max(frameHeight - resolvedPadding * 2, 0);
  const maxFontSize = Math.max(minFontSize, Math.round(requestedFontSize));

  if (availableWidth <= 0 || availableHeight <= 0) {
    const topMetrics = resolveTextTopInset({
      fontSize: minFontSize,
      fontFamily,
      fontWeight,
    });
    return {
      fontSize: minFontSize,
      lineHeight: minFontSize * lineHeightMultiplier,
      lineHeightMultiplier,
      topInset: topMetrics.topInset,
      firstBaselineOffset: topMetrics.firstBaselineOffset,
      lines: [] as string[],
      didFit: false,
      wasReduced: maxFontSize > minFontSize,
    };
  }

  let fallbackLines: string[] = [];

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = resolveLinesForFontSize({
      text,
      maxWidth: availableWidth,
      fontFamily,
      fontWeight,
      fontSize,
      letterSpacing,
    });
    const lineHeight = fontSize * lineHeightMultiplier;
    const topMetrics = resolveTextTopInset({
      fontSize,
      fontFamily,
      fontWeight,
    });
    const requiredHeight =
      lines.length === 0
        ? 0
        : topMetrics.firstBaselineOffset +
          topMetrics.descent +
          (lines.length - 1) * lineHeight;

    fallbackLines = lines;

    if (requiredHeight <= availableHeight + 0.5) {
      return {
        fontSize,
        lineHeight,
        lineHeightMultiplier,
        topInset: topMetrics.topInset,
        firstBaselineOffset: topMetrics.firstBaselineOffset,
        lines,
        didFit: true,
        wasReduced: fontSize < maxFontSize,
      };
    }
  }

  // If the physical frame cannot contain the text even at the minimum size,
  // keep the minimum rather than hiding content or destabilizing the renderer.
  return {
    fontSize: minFontSize,
    lineHeight: minFontSize * lineHeightMultiplier,
    lineHeightMultiplier,
    topInset: resolveTextTopInset({
      fontSize: minFontSize,
      fontFamily,
      fontWeight,
    }).topInset,
    firstBaselineOffset: resolveTextTopInset({
      fontSize: minFontSize,
      fontFamily,
      fontWeight,
    }).firstBaselineOffset,
    lines: fallbackLines,
    didFit: false,
    wasReduced: maxFontSize > minFontSize,
  };
};
