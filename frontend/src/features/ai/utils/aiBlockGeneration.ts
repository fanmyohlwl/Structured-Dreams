import type {
  AIGenerationBlockData,
  AIGenerationMediaMode,
  AIGenerationRatioMode,
  ImageFitMode,
} from "../../../entities/block/types";
import type { Rect, Size } from "../../../shared/types/common";

const MIN_GENERATION_DIMENSION = 64;
const MAX_GENERATION_DIMENSION = 4096;

export const DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS = 8000;
export const MIN_CONTINUOUS_GENERATION_INTERVAL_MS = 2000;
export const MAX_CONTINUOUS_GENERATION_INTERVAL_MS = 300000;

type FixedRatioOption = {
  value: Exclude<AIGenerationRatioMode, "follow-block">;
  label: string;
  widthUnit: number;
  heightUnit: number;
};

export const DEFAULT_AI_GENERATION_RATIO_MODE: AIGenerationRatioMode =
  "follow-block";

export const DEFAULT_AI_RESULT_FIT_MODE: ImageFitMode = "contain";
export const DEFAULT_AI_MEDIA_MODE: AIGenerationMediaMode = "image";
export const DEFAULT_AI_VIDEO_DURATION_SECONDS = 3;

export const DEFAULT_AI_MATCH_CANVAS_BACKGROUND = false;

export const clampContinuousGenerationIntervalMs = (value: number) =>
  Math.min(
    Math.max(Math.round(value), MIN_CONTINUOUS_GENERATION_INTERVAL_MS),
    MAX_CONTINUOUS_GENERATION_INTERVAL_MS,
  );

export const clampAIVideoDurationSeconds = (value?: number) =>
  Math.min(Math.max(Math.round(value ?? DEFAULT_AI_VIDEO_DURATION_SECONDS), 1), 30);

export const AI_GENERATION_RATIO_OPTIONS: Array<
  | {
      value: "follow-block";
      label: string;
    }
  | FixedRatioOption
> = [
  {
    value: "follow-block",
    label: "Follow Block",
  },
  {
    value: "1:1",
    label: "1:1",
    widthUnit: 1,
    heightUnit: 1,
  },
  {
    value: "4:3",
    label: "4:3",
    widthUnit: 4,
    heightUnit: 3,
  },
  {
    value: "3:4",
    label: "3:4",
    widthUnit: 3,
    heightUnit: 4,
  },
  {
    value: "16:9",
    label: "16:9",
    widthUnit: 16,
    heightUnit: 9,
  },
  {
    value: "9:16",
    label: "9:16",
    widthUnit: 9,
    heightUnit: 16,
  },
];

const clampGenerationDimension = (value: number) =>
  Math.min(
    Math.max(Math.round(value), MIN_GENERATION_DIMENSION),
    MAX_GENERATION_DIMENSION,
  );

const getFixedRatioOption = (
  mode: AIGenerationRatioMode,
): FixedRatioOption | undefined =>
  AI_GENERATION_RATIO_OPTIONS.find(
    (option): option is FixedRatioOption =>
      option.value !== "follow-block" && option.value === mode,
  );

export const withDefaultAIGenerationBlockData = (
  data: AIGenerationBlockData,
): AIGenerationBlockData => ({
  ...data,
  mediaMode: data.mediaMode ?? DEFAULT_AI_MEDIA_MODE,
  durationSeconds: clampAIVideoDurationSeconds(data.durationSeconds),
  generationRatioMode:
    data.generationRatioMode ?? DEFAULT_AI_GENERATION_RATIO_MODE,
  resultFitMode: data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
  matchCanvasBackground:
    data.matchCanvasBackground ?? DEFAULT_AI_MATCH_CANVAS_BACKGROUND,
  continuousGenerationIntervalMs: clampContinuousGenerationIntervalMs(
    data.continuousGenerationIntervalMs ??
      DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS,
  ),
});

export const getAIGenerationPosterFallbackUrl = (
  data: AIGenerationBlockData,
) =>
  data.resultPosterUrl ??
  data.resultPreviewImageUrl ??
  data.resultPreviewUrl ??
  data.resultImageUrl;

export const getAIGenerationPosterFallbackMimeType = (
  data: AIGenerationBlockData,
) =>
  data.resultPosterMimeType ??
  data.resultPreviewImageMimeType ??
  data.resultMimeType;

export const deriveAIGenerationOutputSize = ({
  frame,
  generationRatioMode,
}: {
  frame: Rect;
  generationRatioMode?: AIGenerationRatioMode;
}): Size => {
  const safeWidth = clampGenerationDimension(frame.width);
  const safeHeight = clampGenerationDimension(frame.height);
  const ratioMode =
    generationRatioMode ?? DEFAULT_AI_GENERATION_RATIO_MODE;

  if (ratioMode === "follow-block") {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  const ratioOption = getFixedRatioOption(ratioMode);

  if (!ratioOption) {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  const targetArea = Math.max(
    safeWidth * safeHeight,
    ratioOption.widthUnit * ratioOption.heightUnit,
  );
  const scale = Math.sqrt(
    targetArea / (ratioOption.widthUnit * ratioOption.heightUnit),
  );

  return {
    width: clampGenerationDimension(ratioOption.widthUnit * scale),
    height: clampGenerationDimension(ratioOption.heightUnit * scale),
  };
};

export const hexToRgbString = (hexColor: string) => {
  const normalized = hexColor.trim().replace(/^#/, "");

  if (!/^[\da-f]{3}$/i.test(normalized) && !/^[\da-f]{6}$/i.test(normalized)) {
    return null;
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((segment) => `${segment}${segment}`)
          .join("")
      : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgb(${red}, ${green}, ${blue})`;
};

export const buildCanvasBackgroundPromptSuffix = (canvasBackgroundColor: string) => {
  const rgbValue = hexToRgbString(canvasBackgroundColor);

  if (!rgbValue) {
    return null;
  }

  return `Background color should match canvas color ${rgbValue}. Use a clean solid background.`;
};

export const resolveAIGenerationPrompt = ({
  prompt,
  canvasBackgroundColor,
  matchCanvasBackground,
}: {
  prompt: string;
  canvasBackgroundColor: string;
  matchCanvasBackground?: boolean;
}) => {
  const normalizedPrompt = prompt.trim();

  if (!matchCanvasBackground) {
    return normalizedPrompt;
  }

  const suffix = buildCanvasBackgroundPromptSuffix(canvasBackgroundColor);

  if (!suffix) {
    return normalizedPrompt;
  }

  return normalizedPrompt ? `${normalizedPrompt}\n\n${suffix}` : suffix;
};
