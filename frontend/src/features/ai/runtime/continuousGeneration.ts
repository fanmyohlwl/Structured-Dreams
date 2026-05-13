import type {
  AIGenerationBlock,
  AIGenerationRatioMode,
  ImageFitMode,
} from "../../../entities/block/types";
import type { Rect } from "../../../shared/types/common";
import type { AIGenerationService } from "../services/AIGenerationService";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIServiceResult,
} from "../types";
import type { JsonValue } from "../../../shared/types/common";
import {
  clampContinuousGenerationIntervalMs,
  DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS,
  deriveAIGenerationOutputSize,
  resolveAIGenerationPrompt,
} from "../utils/aiBlockGeneration";

const wait = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const AI_GENERATION_POLL_INTERVAL_MS = 1500;
const AI_GENERATION_MAX_POLL_ATTEMPTS = 40;

export type ContinuousAIGenerationStatus = "idle" | "running" | "stopping";

export interface ContinuousAIGenerationSessionState {
  activeBlockId?: string;
  status: ContinuousAIGenerationStatus;
  iterationCount: number;
  activeGenerationId?: string;
  startedAt?: string;
  lastErrorMessage?: string;
}

export interface ContinuousAIGenerationSnapshot {
  blockId: string;
  prompt: string;
  frame: Rect;
  generationRatioMode?: AIGenerationRatioMode;
  resultFitMode?: ImageFitMode;
  matchCanvasBackground?: boolean;
  canvasBackgroundColor: string;
  intervalMs: number;
  metadata?: Record<string, JsonValue>;
  referenceAssets?: AIGenerationRequest["referenceAssets"];
}

interface RunSingleAIGenerationCycleOptions {
  aiGenerationService: AIGenerationService;
  snapshot: ContinuousAIGenerationSnapshot;
  providerId?: AIProviderId;
  onQueued?: () => void;
  onResponse?: (response: AIGenerationResponse) => void;
}

const isTerminalAIGenerationStatus = (status: AIGenerationResponse["status"]) =>
  status === "completed" || status === "failed" || status === "cancelled";

export const createIdleContinuousAIGenerationSession =
  (): ContinuousAIGenerationSessionState => ({
    status: "idle",
    iterationCount: 0,
  });

export const createContinuousAIGenerationSnapshot = ({
  block,
  canvasBackgroundColor,
}: {
  block: AIGenerationBlock;
  canvasBackgroundColor: string;
}): ContinuousAIGenerationSnapshot => ({
  blockId: block.id,
  prompt: block.data.prompt,
  frame: block.frame,
  generationRatioMode: block.data.generationRatioMode,
  resultFitMode: block.data.resultFitMode,
  matchCanvasBackground: block.data.matchCanvasBackground,
  canvasBackgroundColor,
  intervalMs: clampContinuousGenerationIntervalMs(
    block.data.continuousGenerationIntervalMs ??
      DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS,
  ),
});

export const buildAIGenerationRequestFromSnapshot = (
  snapshot: ContinuousAIGenerationSnapshot,
): AIGenerationRequest => ({
  blockId: snapshot.blockId,
  prompt: resolveAIGenerationPrompt({
    prompt: snapshot.prompt,
    canvasBackgroundColor: snapshot.canvasBackgroundColor,
    matchCanvasBackground: snapshot.matchCanvasBackground,
  }),
  outputSize: deriveAIGenerationOutputSize({
    frame: snapshot.frame,
    generationRatioMode: snapshot.generationRatioMode,
  }),
  format: "png",
  background: snapshot.matchCanvasBackground ? "solid" : undefined,
  metadata: snapshot.metadata,
  referenceAssets: snapshot.referenceAssets,
});

export const runSingleAIGenerationCycle = async ({
  aiGenerationService,
  snapshot,
  providerId = "backend",
  onQueued,
  onResponse,
}: RunSingleAIGenerationCycleOptions): Promise<
  AIServiceResult<AIGenerationResponse>
> => {
  onQueued?.();

  const initialResult = await aiGenerationService.generateImage(
    buildAIGenerationRequestFromSnapshot(snapshot),
    providerId,
  );

  if (!initialResult.ok) {
    return initialResult;
  }

  onResponse?.(initialResult.data);

  if (isTerminalAIGenerationStatus(initialResult.data.status)) {
    return initialResult;
  }

  for (let attempt = 0; attempt < AI_GENERATION_MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(AI_GENERATION_POLL_INTERVAL_MS);

    const polledResult = await aiGenerationService.getGenerationResult(
      initialResult.data.generationId,
      providerId,
    );

    if (!polledResult.ok) {
      return polledResult;
    }

    onResponse?.(polledResult.data);

    if (isTerminalAIGenerationStatus(polledResult.data.status)) {
      return polledResult;
    }
  }

  return {
    ok: false,
    error: {
      code: "PROVIDER_ERROR",
      message:
        "Image generation is still running. The provider did not finish within 60 seconds.",
      providerId,
      retryable: true,
    },
  };
};

export const waitForContinuousGenerationDelay = async (
  intervalMs: number,
  signal: AbortSignal,
) => {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, intervalMs);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
};
