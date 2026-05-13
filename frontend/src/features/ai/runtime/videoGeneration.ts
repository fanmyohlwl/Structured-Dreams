import type {
  AIGenerationBlock,
  AIGenerationMediaMode,
  AIGenerationRatioMode,
  ImageFitMode,
} from "../../../entities/block/types";
import type { Rect } from "../../../shared/types/common";
import type { AIProviderId, AIServiceResult } from "../types";
import type {
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
} from "../videoTypes";
import { AIVideoGenerationService } from "../services/AIVideoGenerationService";
import {
  clampAIVideoDurationSeconds,
  deriveAIGenerationOutputSize,
  resolveAIGenerationPrompt,
} from "../utils/aiBlockGeneration";

const wait = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const AI_VIDEO_GENERATION_POLL_INTERVAL_MS = 2000;
const AI_VIDEO_GENERATION_MAX_POLL_ATTEMPTS = 60;

export interface AIVideoGenerationSnapshot {
  blockId: string;
  mediaMode: AIGenerationMediaMode;
  prompt: string;
  negativePrompt?: string;
  frame: Rect;
  generationRatioMode?: AIGenerationRatioMode;
  resultFitMode?: ImageFitMode;
  matchCanvasBackground?: boolean;
  canvasBackgroundColor: string;
  durationSeconds: number;
}

interface RunSingleAIVideoGenerationCycleOptions {
  aiVideoGenerationService: AIVideoGenerationService;
  snapshot: AIVideoGenerationSnapshot;
  providerId?: AIProviderId;
  onQueued?: () => void;
  onResponse?: (response: AIVideoGenerationResponse) => void;
}

const isTerminalAIVideoGenerationStatus = (
  status: AIVideoGenerationResponse["status"],
) => status === "completed" || status === "failed" || status === "cancelled";

export const createAIVideoGenerationSnapshot = ({
  block,
  canvasBackgroundColor,
}: {
  block: AIGenerationBlock;
  canvasBackgroundColor: string;
}): AIVideoGenerationSnapshot => ({
  blockId: block.id,
  mediaMode: block.data.mediaMode ?? "image",
  prompt: block.data.prompt,
  negativePrompt: block.data.negativePrompt,
  frame: block.frame,
  generationRatioMode: block.data.generationRatioMode,
  resultFitMode: block.data.resultFitMode,
  matchCanvasBackground: block.data.matchCanvasBackground,
  canvasBackgroundColor,
  durationSeconds: clampAIVideoDurationSeconds(
    block.data.durationSeconds,
  ),
});

export const buildAIVideoGenerationRequestFromSnapshot = (
  snapshot: AIVideoGenerationSnapshot,
): AIVideoGenerationRequest => ({
  blockId: snapshot.blockId,
  prompt: resolveAIGenerationPrompt({
    prompt: snapshot.prompt,
    canvasBackgroundColor: snapshot.canvasBackgroundColor,
    matchCanvasBackground: snapshot.matchCanvasBackground,
  }),
  negativePrompt: snapshot.negativePrompt,
  outputSize: deriveAIGenerationOutputSize({
    frame: snapshot.frame,
    generationRatioMode: snapshot.generationRatioMode,
  }),
  durationSeconds: snapshot.durationSeconds,
  aspectRatio:
    snapshot.generationRatioMode &&
    snapshot.generationRatioMode !== "follow-block"
      ? snapshot.generationRatioMode
      : undefined,
  metadata: snapshot.matchCanvasBackground
    ? {
        background: "solid",
      }
    : undefined,
});

export const runSingleAIVideoGenerationCycle = async ({
  aiVideoGenerationService,
  snapshot,
  providerId = "backend",
  onQueued,
  onResponse,
}: RunSingleAIVideoGenerationCycleOptions): Promise<
  AIServiceResult<AIVideoGenerationResponse>
> => {
  onQueued?.();

  const initialResult = await aiVideoGenerationService.generateVideo(
    buildAIVideoGenerationRequestFromSnapshot(snapshot),
    providerId,
  );

  if (!initialResult.ok) {
    return initialResult;
  }

  onResponse?.(initialResult.data);

  if (isTerminalAIVideoGenerationStatus(initialResult.data.status)) {
    return initialResult;
  }

  for (
    let attempt = 0;
    attempt < AI_VIDEO_GENERATION_MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    await wait(AI_VIDEO_GENERATION_POLL_INTERVAL_MS);

    const polledResult = await aiVideoGenerationService.getVideoGenerationResult(
      initialResult.data.generationId,
      providerId,
    );

    if (!polledResult.ok) {
      return polledResult;
    }

    onResponse?.(polledResult.data);

    if (isTerminalAIVideoGenerationStatus(polledResult.data.status)) {
      return polledResult;
    }
  }

  return {
    ok: false,
    error: {
      code: "PROVIDER_ERROR",
      message:
        "Video generation is still running. The provider did not finish within 120 seconds.",
      providerId,
      retryable: true,
    },
  };
};
