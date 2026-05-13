import type {
  TextBlockData,
  TextLiveTypography,
  TextTypographyPropertyMapping,
} from "../../../entities/block/types";
import { normalizeLiveSignalKey } from "../config/liveSignalRegistry";
import { GLOBAL_LIVE_SOURCE_ID } from "../runtime/sharedLiveCamera";

type LegacyTextLiveTypography = {
  enabled?: boolean;
  sourceBlockId?: string;
  signalKey?: string;
  minFontSize?: number;
  maxFontSize?: number;
  minLetterSpacing?: number;
  maxLetterSpacing?: number;
  transitionMs?: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clamp01 = (value: number) => clamp(value, 0, 1);

const createDefaultFontSizeMapping = (): TextTypographyPropertyMapping => ({
  enabled: true,
  signalKey: "smile",
  min: 24,
  max: 64,
});

const createDefaultLetterSpacingMapping = (): TextTypographyPropertyMapping => ({
  enabled: true,
  signalKey: "smile",
  min: 0,
  max: 10,
});

const withDefaultFontSizeMapping = (
  mapping?: Partial<TextTypographyPropertyMapping>,
): TextTypographyPropertyMapping => {
  const defaults = createDefaultFontSizeMapping();
  const min = clamp(
    Math.round(mapping?.min ?? defaults.min),
    8,
    240,
  );
  const max = clamp(
    Math.round(mapping?.max ?? defaults.max),
    min,
    320,
  );

  return {
    ...defaults,
    ...mapping,
    signalKey: mapping?.signalKey || defaults.signalKey,
    min,
    max,
  };
};

const withDefaultLetterSpacingMapping = (
  mapping?: Partial<TextTypographyPropertyMapping>,
): TextTypographyPropertyMapping => {
  const defaults = createDefaultLetterSpacingMapping();
  const min = clamp(
    Number(mapping?.min ?? defaults.min),
    -8,
    40,
  );
  const max = clamp(
    Number(mapping?.max ?? defaults.max),
    min,
    48,
  );

  return {
    ...defaults,
    ...mapping,
    signalKey: mapping?.signalKey || defaults.signalKey,
    min,
    max,
  };
};

export const createDefaultTextLiveTypography = (): TextLiveTypography => ({
  enabled: false,
  sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
  transitionMs: 220,
  fontSizeMapping: createDefaultFontSizeMapping(),
  letterSpacingMapping: createDefaultLetterSpacingMapping(),
});

const getLegacyConfig = (
  liveTypography?: TextLiveTypography | LegacyTextLiveTypography,
): LegacyTextLiveTypography | undefined => {
  if (!liveTypography) {
    return undefined;
  }

  if ("fontSizeMapping" in liveTypography || "letterSpacingMapping" in liveTypography) {
    return undefined;
  }

  return liveTypography;
};

export const withDefaultTextLiveTypography = (
  liveTypography?: TextLiveTypography | LegacyTextLiveTypography,
): TextLiveTypography => {
  const defaults = createDefaultTextLiveTypography();
  const legacyConfig = getLegacyConfig(liveTypography);
  const nextLiveTypography: Partial<TextLiveTypography> | undefined = legacyConfig
    ? {
        enabled: legacyConfig.enabled ?? defaults.enabled,
        sourceBlockId: legacyConfig.sourceBlockId ?? defaults.sourceBlockId,
        transitionMs: legacyConfig.transitionMs ?? defaults.transitionMs,
        fontSizeMapping: {
          enabled: true,
          signalKey:
            legacyConfig.signalKey ?? defaults.fontSizeMapping.signalKey,
          min: legacyConfig.minFontSize ?? defaults.fontSizeMapping.min,
          max: legacyConfig.maxFontSize ?? defaults.fontSizeMapping.max,
        },
        letterSpacingMapping: {
          enabled: true,
          signalKey:
            legacyConfig.signalKey ?? defaults.letterSpacingMapping.signalKey,
          min:
            legacyConfig.minLetterSpacing ??
            defaults.letterSpacingMapping.min,
          max:
            legacyConfig.maxLetterSpacing ??
            defaults.letterSpacingMapping.max,
        },
      }
    : (liveTypography as TextLiveTypography | undefined);

  return {
    ...defaults,
    ...nextLiveTypography,
    sourceBlockId:
      nextLiveTypography?.sourceBlockId ?? defaults.sourceBlockId,
    transitionMs: clamp(
      Math.round(nextLiveTypography?.transitionMs ?? defaults.transitionMs),
      0,
      5000,
    ),
    fontSizeMapping: withDefaultFontSizeMapping(
      nextLiveTypography?.fontSizeMapping,
    ),
    letterSpacingMapping: withDefaultLetterSpacingMapping(
      nextLiveTypography?.letterSpacingMapping,
    ),
  };
};

export const withDefaultTextBlockData = (data: TextBlockData): TextBlockData => ({
  ...data,
  padding: data.padding ?? 0,
  letterSpacing: data.letterSpacing ?? 0,
  lineHeight: data.lineHeight ?? 0.95,
  liveTypography: withDefaultTextLiveTypography(data.liveTypography),
});

const getSignalScore = (
  expressions: Record<string, number> | undefined,
  signalKey: string,
) => {
  if (!expressions) {
    return 0;
  }

  const normalizedSignalKey = normalizeLiveSignalKey(signalKey);
  const directScore =
    typeof expressions[normalizedSignalKey] === "number"
      ? expressions[normalizedSignalKey]
      : undefined;

  if (directScore != null) {
    return clamp01(directScore);
  }

  if (typeof expressions.smile === "number") {
    return clamp01(expressions.smile);
  }

  const maxScore = Math.max(
    0,
    ...Object.values(expressions).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ),
  );

  return clamp01(maxScore);
};

const interpolate = (min: number, max: number, value: number) =>
  min + (max - min) * value;

export const resolveTextLiveTypographyStyle = ({
  blockData,
  expressions,
}: {
  blockData: TextBlockData;
  expressions: Record<string, number> | undefined;
}) => {
  const liveTypography = withDefaultTextLiveTypography(blockData.liveTypography);

  if (!liveTypography.enabled) {
    return {
      fontSize: blockData.fontSize,
      letterSpacing: blockData.letterSpacing ?? 0,
      transition: undefined as string | undefined,
    };
  }

  const nextFontSize = liveTypography.fontSizeMapping.enabled
    ? interpolate(
        liveTypography.fontSizeMapping.min,
        liveTypography.fontSizeMapping.max,
        getSignalScore(expressions, liveTypography.fontSizeMapping.signalKey),
      )
    : blockData.fontSize;
  const nextLetterSpacing = liveTypography.letterSpacingMapping.enabled
    ? interpolate(
        liveTypography.letterSpacingMapping.min,
        liveTypography.letterSpacingMapping.max,
        getSignalScore(
          expressions,
          liveTypography.letterSpacingMapping.signalKey,
        ),
      )
    : blockData.letterSpacing ?? 0;
  const transitionParts = [
    liveTypography.fontSizeMapping.enabled
      ? `font-size ${liveTypography.transitionMs}ms ease`
      : null,
    liveTypography.letterSpacingMapping.enabled
      ? `letter-spacing ${liveTypography.transitionMs}ms ease`
      : null,
  ].filter(Boolean);

  return {
    fontSize: nextFontSize,
    letterSpacing: nextLetterSpacing,
    transition:
      transitionParts.length > 0 ? transitionParts.join(", ") : undefined,
  };
};
