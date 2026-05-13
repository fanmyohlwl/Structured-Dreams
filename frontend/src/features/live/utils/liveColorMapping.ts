import type {
  DesignBlock,
  LiveColorMapping,
  LiveColorRule,
} from "../../../entities/block/types";
import { GLOBAL_LIVE_SOURCE_ID } from "../runtime/sharedLiveCamera";

export interface ResolvedBlockAppearance {
  backgroundColor?: string;
  transition?: string;
  hasBackground: boolean;
}

type LiveMappableColorConfig = {
  backgroundColor?: string | null;
  liveColorMapping?: LiveColorMapping;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const createDefaultLiveColorRule = (): LiveColorRule => ({
  id: "live_rule_default",
  expressionKey: "smile",
  threshold: 0.35,
  color: "#fff2b8",
});

export const withDefaultLiveColorMapping = (
  mapping?: LiveColorMapping,
  fallbackDefaultColor = "#ffffff",
): LiveColorMapping => {
  const defaultRule = createDefaultLiveColorRule();
  const rules =
    mapping?.rules && mapping.rules.length > 0 ? mapping.rules : [defaultRule];

  return {
    enabled: mapping?.enabled ?? false,
    sourceBlockId: mapping?.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID,
    defaultColor: mapping?.defaultColor ?? fallbackDefaultColor,
    transitionMs: clamp(Math.round(mapping?.transitionMs ?? 600), 0, 5000),
    rules: rules.map((rule, index) => ({
      id: rule.id || `live_rule_${index}`,
      expressionKey: rule.expressionKey || defaultRule.expressionKey,
      threshold: clamp(rule.threshold, 0, 1),
      color: rule.color || defaultRule.color,
    })),
  };
};

export const getExpressionScore = (
  expressions: Record<string, number> | undefined,
  expressionKey: string,
) => {
  if (!expressions) {
    return 0;
  }

  return expressions[expressionKey] ?? 0;
};

export const resolveLiveMappedAppearance = (
  config: LiveMappableColorConfig,
  expressions: Record<string, number> | undefined,
): ResolvedBlockAppearance => {
  const explicitBackground = config.backgroundColor ?? undefined;
  const mapping = config.liveColorMapping;

  if (!mapping?.enabled) {
    return {
      backgroundColor: explicitBackground,
      hasBackground: explicitBackground != null,
    };
  }

  const activeRule = mapping.rules
    .map((rule) => ({
      rule,
      score: getExpressionScore(expressions, rule.expressionKey),
    }))
    .filter(({ rule, score }) => score >= rule.threshold)
    .sort((left, right) => right.score - left.score)[0];

  return {
    backgroundColor: activeRule?.rule.color ?? mapping.defaultColor,
    transition: `background-color ${Math.max(mapping.transitionMs, 0)}ms ease`,
    hasBackground: true,
  };
};

export const resolveBlockAppearance = (
  block: DesignBlock,
  expressions: Record<string, number> | undefined,
): ResolvedBlockAppearance => {
  if (block.type === "live") {
    return {
      backgroundColor: block.data.backgroundColor ?? undefined,
      hasBackground: block.data.backgroundColor != null,
    };
  }

  if (block.type === "ai-generation") {
    return {
      hasBackground: false,
    };
  }

  if (block.type === "pattern") {
    return {
      hasBackground: false,
    };
  }

  return resolveLiveMappedAppearance(
    {
      backgroundColor: block.data.backgroundColor,
      liveColorMapping: block.data.liveColorMapping,
    },
    expressions,
  );
};
