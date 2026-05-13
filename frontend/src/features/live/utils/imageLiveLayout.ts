import type {
  ImageBlockData,
  ImageLiveLayout,
  ImageLiveLayoutMode,
} from "../../../entities/block/types";
import { GLOBAL_LIVE_SOURCE_ID } from "../runtime/sharedLiveCamera";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clamp01 = (value: number) => clamp(value, 0, 1);

export const IMAGE_LIVE_LAYOUT_INSTANCE_CAP = 36;
export const DEFAULT_IMAGE_LIVE_LAYOUT_MODE: ImageLiveLayoutMode = "grid";

export const IMAGE_LIVE_LAYOUT_MODE_OPTIONS: Array<{
  value: ImageLiveLayoutMode;
  label: string;
}> = [
  { value: "grid", label: "Grid" },
  { value: "wave", label: "Wave" },
];

export const createDefaultImageLiveLayout = (): ImageLiveLayout => ({
  enabled: false,
  sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
  countSignalKey: "smile",
  minCount: 1,
  maxCount: 9,
  layoutMode: DEFAULT_IMAGE_LIVE_LAYOUT_MODE,
  gap: 12,
  waveSignalKey: "handMotion",
  waveAmplitude: 18,
  transitionMs: 220,
});

export const withDefaultImageLiveLayout = (
  liveLayout?: ImageLiveLayout,
): ImageLiveLayout => {
  const defaults = createDefaultImageLiveLayout();
  const minCount = clamp(
    Math.round(liveLayout?.minCount ?? defaults.minCount),
    1,
    IMAGE_LIVE_LAYOUT_INSTANCE_CAP,
  );
  const maxCount = clamp(
    Math.round(liveLayout?.maxCount ?? defaults.maxCount),
    minCount,
    IMAGE_LIVE_LAYOUT_INSTANCE_CAP,
  );

  return {
    ...defaults,
    ...liveLayout,
    minCount,
    maxCount,
    gap: clamp(Math.round(liveLayout?.gap ?? defaults.gap), 0, 96),
    waveAmplitude: clamp(
      Math.round(liveLayout?.waveAmplitude ?? defaults.waveAmplitude),
      0,
      160,
    ),
    transitionMs: clamp(
      Math.round(liveLayout?.transitionMs ?? defaults.transitionMs),
      0,
      5000,
    ),
    sourceBlockId: liveLayout?.sourceBlockId ?? defaults.sourceBlockId,
    countSignalKey: liveLayout?.countSignalKey || defaults.countSignalKey,
    waveSignalKey: liveLayout?.waveSignalKey || defaults.waveSignalKey,
    layoutMode: liveLayout?.layoutMode ?? defaults.layoutMode,
  };
};

export const withDefaultImageBlockData = (
  data: ImageBlockData,
): ImageBlockData => ({
  ...data,
  liveLayout: withDefaultImageLiveLayout(data.liveLayout),
});

export const getLiveExpressionScore = (
  expressions: Record<string, number> | undefined,
  expressionKey: string,
) => clamp01(expressions?.[expressionKey] ?? 0);

export const resolveImageLiveLayoutCount = ({
  liveLayout,
  expressions,
}: {
  liveLayout?: ImageLiveLayout;
  expressions: Record<string, number> | undefined;
}) => {
  const normalizedLayout = withDefaultImageLiveLayout(liveLayout);
  const signalScore = getLiveExpressionScore(
    expressions,
    normalizedLayout.countSignalKey,
  );
  const countRange = normalizedLayout.maxCount - normalizedLayout.minCount;

  return clamp(
    normalizedLayout.minCount + Math.round(signalScore * countRange),
    normalizedLayout.minCount,
    normalizedLayout.maxCount,
  );
};

export interface ImageLiveLayoutInstance {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: string;
}

const resolveGridMetrics = ({
  width,
  height,
  count,
  gap,
}: {
  width: number;
  height: number;
  count: number;
  gap: number;
}) => {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const aspectRatio = safeWidth / safeHeight;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspectRatio)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const totalGapX = gap * Math.max(columns - 1, 0);
  const totalGapY = gap * Math.max(rows - 1, 0);
  const cellWidth = Math.max((safeWidth - totalGapX) / columns, 1);
  const cellHeight = Math.max((safeHeight - totalGapY) / rows, 1);

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
  };
};

export const resolveImageLiveLayoutInstances = ({
  width,
  height,
  liveLayout,
  expressions,
}: {
  width: number;
  height: number;
  liveLayout?: ImageLiveLayout;
  expressions: Record<string, number> | undefined;
}): ImageLiveLayoutInstance[] => {
  const normalizedLayout = withDefaultImageLiveLayout(liveLayout);
  const count = clamp(
    resolveImageLiveLayoutCount({
      liveLayout: normalizedLayout,
      expressions,
    }),
    1,
    IMAGE_LIVE_LAYOUT_INSTANCE_CAP,
  );
  const { columns, rows, cellWidth, cellHeight } = resolveGridMetrics({
    width,
    height,
    count,
    gap: normalizedLayout.gap,
  });
  const waveStrength = getLiveExpressionScore(
    expressions,
    normalizedLayout.waveSignalKey,
  );
  const amplitude =
    normalizedLayout.layoutMode === "wave"
      ? Math.min(normalizedLayout.waveAmplitude, cellHeight * 0.9) * waveStrength
      : 0;
  const phase = waveStrength * Math.PI * 2;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = column * (cellWidth + normalizedLayout.gap);
    const y = row * (cellHeight + normalizedLayout.gap);
    const waveOffsetY =
      normalizedLayout.layoutMode === "wave"
        ? Math.sin(
            (column / Math.max(columns - 1, 1)) * Math.PI * 2 +
              row * 0.65 +
              phase,
          ) * amplitude
        : 0;
    const waveOffsetX =
      normalizedLayout.layoutMode === "wave"
        ? Math.cos(
            (row / Math.max(rows - 1, 1)) * Math.PI +
              index * 0.18 +
              phase,
          ) *
          amplitude *
          0.24
        : 0;

    return {
      id: `image_live_instance_${index}`,
      x,
      y,
      width: cellWidth,
      height: cellHeight,
      transform: `translate(${waveOffsetX.toFixed(2)}px, ${waveOffsetY.toFixed(2)}px)`,
    };
  });
};
