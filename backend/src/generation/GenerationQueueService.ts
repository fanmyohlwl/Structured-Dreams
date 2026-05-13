import { randomUUID } from "node:crypto";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  JsonValue,
} from "../ai/types.js";
import type { AIGenerationService } from "../ai/services/AIGenerationService.js";
import type { StoredDesignDocument } from "../documents/types.js";
import type {
  MediaGenerationSpec,
  VisualStyleProfile,
} from "../orchestration/types.js";

export type GenerationJobStatus = "pending" | "running" | "success" | "error";

export interface CreateGenerationJobPayload {
  mediaGenerationSpec: MediaGenerationSpec;
  providerHint?: AIProviderId;
  targetBlockId?: string;
  documentId?: string;
  slotId?: string;
  semanticBrief?: StoredDesignDocument["semanticBrief"];
  visualStyleProfiles?: VisualStyleProfile[];
  transientReferenceAssets?: Array<{
    assetId?: string;
    url: string;
    mimeType?: string;
    role: "live-capture" | "previous-ai-result";
  }>;
  liveCaptureId?: string;
  fuseCapturedPortrait?: boolean;
}

export interface GenerationJob {
  id: string;
  provider: string;
  model: string;
  mediaType: "image" | "video";
  payload: CreateGenerationJobPayload;
  status: GenerationJobStatus;
  resultAssetId?: string;
  resultUrl?: string;
  resultMimeType?: string;
  providerGenerationId?: string;
  error?: string;
  warnings?: string[];
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  documentId?: string;
  slotId?: string;
  targetBlockId?: string;
  progress?: number;
}

type InternalGenerationJob = GenerationJob & {
  providerHint?: AIProviderId;
};

const parseIntegerEnv = ({
  name,
  fallback,
  min,
  max,
}: {
  name: string;
  fallback: number;
  min: number;
  max: number;
}) => {
  const rawValue = process.env[name];
  const parsedValue =
    rawValue && rawValue.trim() ? Number.parseInt(rawValue, 10) : fallback;
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : fallback;

  return Math.min(Math.max(safeValue, min), max);
};

const JOB_POLL_INTERVAL_MS = parseIntegerEnv({
  name: "GENERATION_QUEUE_POLL_INTERVAL_MS",
  fallback: 1500,
  min: 500,
  max: 30_000,
});
const JOB_MAX_POLL_ATTEMPTS = parseIntegerEnv({
  name: "GENERATION_QUEUE_MAX_POLL_ATTEMPTS",
  fallback: 400,
  min: 1,
  max: 5000,
});
const DEFAULT_IMAGE_OUTPUT_SIZE = {
  width: 1024,
  height: 1024,
};

const wait = (durationMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const isFinitePositiveDimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const getOutputSize = (spec: MediaGenerationSpec) => {
  if (
    isFinitePositiveDimension(spec.outputSize?.width) &&
    isFinitePositiveDimension(spec.outputSize?.height)
  ) {
    return {
      width: Math.round(spec.outputSize.width),
      height: Math.round(spec.outputSize.height),
    };
  }

  return DEFAULT_IMAGE_OUTPUT_SIZE;
};

const createJobError = (message: string) =>
  message.trim() || "Generation job failed.";

const getGenerationProviderModel = (metadata?: Record<string, JsonValue>) => {
  const model = metadata?.model;

  return typeof model === "string" && model.trim()
    ? model
    : "provider-default";
};

export class GenerationQueueService {
  private readonly jobs = new Map<string, InternalGenerationJob>();

  private isProcessing = false;

  constructor(private readonly aiGenerationService: AIGenerationService) {}

  createJob(payload: CreateGenerationJobPayload): GenerationJob {
    const spec = payload.mediaGenerationSpec;

    if (!spec?.id || !spec.mediaType) {
      throw new Error("Missing media generation spec.");
    }

    if (spec.mediaType !== "image") {
      throw new Error(
        "Generation queue MVP currently supports image jobs only.",
      );
    }

    const now = new Date().toISOString();
    const targetBlockId =
      payload.targetBlockId ?? spec.targetBlockId ?? spec.imageIntent?.targetBlockId;
    const slotId = payload.slotId ?? spec.targetSlotId;
    const providerHint = payload.providerHint ?? spec.providerHint;
    const job: InternalGenerationJob = {
      id: `generation_job_${randomUUID()}`,
      provider: providerHint ?? "default",
      model: "provider-default",
      mediaType: spec.mediaType,
      payload: {
        ...payload,
        targetBlockId,
        slotId,
      },
      status: "pending",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      documentId: payload.documentId,
      slotId,
      targetBlockId,
      providerHint,
      progress: 0,
    };

    this.jobs.set(job.id, job);
    this.scheduleProcessing();
    return this.toPublicJob(this.jobs.get(job.id) ?? job);
  }

  getJob(jobId: string): GenerationJob | null {
    const job = this.jobs.get(jobId);

    if (job?.status === "pending" && !this.isProcessing) {
      this.scheduleProcessing();
    }

    return job ? this.toPublicJob(job) : null;
  }

  listJobs(documentId?: string): GenerationJob[] {
    return [...this.jobs.values()]
      .filter((job) => !documentId || job.documentId === documentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((job) => this.toPublicJob(job));
  }

  retryJob(jobId: string): GenerationJob | null {
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    const now = new Date().toISOString();
    const nextJob: InternalGenerationJob = {
      ...job,
      status: "pending",
      resultAssetId: undefined,
      resultUrl: undefined,
      resultMimeType: undefined,
      providerGenerationId: undefined,
      error: undefined,
      warnings: undefined,
      retryCount: job.retryCount + 1,
      progress: 0,
      updatedAt: now,
    };

    this.jobs.set(jobId, nextJob);
    this.scheduleProcessing();
    return this.toPublicJob(nextJob);
  }

  private scheduleProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    void this.processQueue();
  }

  private async processQueue() {
    try {
      while (true) {
        const nextJob = [...this.jobs.values()]
          .filter((job) => job.status === "pending")
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];

        if (!nextJob) {
          break;
        }

        await this.runJob(nextJob.id);
      }
    } finally {
      this.isProcessing = false;

      if ([...this.jobs.values()].some((job) => job.status === "pending")) {
        this.scheduleProcessing();
      }
    }
  }

  private async runJob(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job || job.status !== "pending") {
      return;
    }

    this.patchJob(jobId, {
      status: "running",
      error: undefined,
      progress: 0,
    });

    try {
      const request = this.createImageRequest(job);
      const initialResult = await this.aiGenerationService.generateImage(
        request,
        job.providerHint,
      );

      if (!initialResult.ok) {
        this.patchJob(jobId, {
          status: "error",
          error: createJobError(initialResult.error.message),
          progress: 0,
        });
        return;
      }

      await this.resolveImageResponse(jobId, initialResult.data);
    } catch (error) {
      this.patchJob(jobId, {
        status: "error",
        error:
          error instanceof Error
            ? createJobError(error.message)
            : "Generation job failed unexpectedly.",
      });
    }
  }

  private createImageRequest(job: InternalGenerationJob): AIGenerationRequest {
    const spec = job.payload.mediaGenerationSpec;
    const imageIntent = spec.imageIntent;
    const targetBlockId =
      job.targetBlockId ?? spec.targetBlockId ?? imageIntent?.targetBlockId;

    if (!targetBlockId) {
      throw new Error("Generation job is missing a target block id.");
    }

    const metadata: Record<string, JsonValue> = {
      mediaGenerationSpec: spec as unknown as JsonValue,
    };
    const specMetadata =
      spec.metadata &&
      typeof spec.metadata === "object" &&
      !Array.isArray(spec.metadata)
        ? spec.metadata
        : undefined;

    if (specMetadata?.frameSource && typeof specMetadata.frameSource === "string") {
      metadata.frameSource = specMetadata.frameSource;
    }

    if (specMetadata?.layoutContext) {
      metadata.layoutContext = specMetadata.layoutContext as unknown as JsonValue;
    }

    if (imageIntent) {
      metadata.imageIntent = imageIntent as unknown as JsonValue;
    }

    if (job.payload.semanticBrief) {
      metadata.semanticBrief = job.payload.semanticBrief as unknown as JsonValue;
      metadata.references = (job.payload.semanticBrief.references ?? []) as unknown as JsonValue;
    }

    if (job.payload.visualStyleProfiles?.length) {
      metadata.visualStyleProfiles =
        job.payload.visualStyleProfiles as unknown as JsonValue;
    }

    if (job.payload.liveCaptureId) {
      metadata.liveCaptureId = job.payload.liveCaptureId;
    }

    const fuseCapturedPortrait = Boolean(
      job.payload.fuseCapturedPortrait === true ||
        (specMetadata &&
          "fuseCapturedPortrait" in specMetadata &&
          specMetadata.fuseCapturedPortrait === true),
    );
    metadata.fuseCapturedPortrait = fuseCapturedPortrait;

    const frameSummary =
      specMetadata && "liveFrame" in specMetadata
        ? specMetadata.liveFrame
        : undefined;

    const safeTransientReferenceAssets =
      job.payload.transientReferenceAssets?.filter(
        (asset) => asset.role !== "live-capture" || fuseCapturedPortrait,
      ) ?? [];

    const liveCaptureReference = safeTransientReferenceAssets.find(
      (asset) => asset.role === "live-capture",
    );
    const previousImageReference = safeTransientReferenceAssets.find(
      (asset) => asset.role === "previous-ai-result",
    );

    if (frameSummary || job.payload.liveCaptureId || liveCaptureReference) {
      metadata.liveContextGuidance = this.createLiveContextGuidance(
        frameSummary,
        Boolean(previousImageReference),
        fuseCapturedPortrait,
      );
    }

    return {
      blockId: targetBlockId,
      prompt:
        spec.compiledPrompt ??
        imageIntent?.subject ??
        "Create a brand-ready semantic visual.",
      negativePrompt: imageIntent?.avoid?.join(", "),
      outputSize: getOutputSize(spec),
      format: spec.format,
      background: spec.background,
      referenceAssets: safeTransientReferenceAssets.map((asset) => ({
        assetId: asset.assetId,
        url: asset.url,
        mimeType: asset.mimeType,
        role: asset.role,
      })),
      metadata,
    };
  }

  private createLiveContextGuidance(
    frameSummary: unknown,
    hasPreviousImageReference: boolean,
    fuseCapturedPortrait: boolean,
  ) {
    const frame =
      typeof frameSummary === "object" && frameSummary !== null
        ? (frameSummary as Record<string, unknown>)
        : {};
    const expressions =
      typeof frame.expressions === "object" && frame.expressions !== null
        ? (frame.expressions as Record<string, unknown>)
        : {};
    const strongestExpressions = Object.entries(expressions)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([key, value]) => `${key} ${Math.round(value * 100)}%`);

    return [
      "Live moment regeneration context:",
      `Faces: ${typeof frame.faceCount === "number" ? frame.faceCount : 0}`,
      `Hands: ${typeof frame.handCount === "number" ? frame.handCount : 0}`,
      `Pose detections: ${typeof frame.poseCount === "number" ? frame.poseCount : 0}`,
      typeof frame.primaryExpression === "string"
        ? `Primary expression: ${frame.primaryExpression}`
        : undefined,
      strongestExpressions.length
        ? `Strongest signals: ${strongestExpressions.join(", ")}`
        : undefined,
      fuseCapturedPortrait
        ? "Captured portrait may be used as visual reference."
        : "Use live moment as environment/expression/action guidance only. Avoid portrait likeness.",
      hasPreviousImageReference
        ? "Use the previous AI result as continuity reference while responding to the live moment."
        : "Respond to the live camera frame while preserving semantic slot and brand intent.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async resolveImageResponse(
    jobId: string,
    response: AIGenerationResponse,
  ) {
    if (response.status === "completed") {
      this.markImageJobSuccess(jobId, response);
      return;
    }

    if (response.status === "failed" || response.status === "cancelled") {
      this.patchJob(jobId, {
        status: "error",
        error:
          response.error?.message ??
          `Image generation ended with status ${response.status}.`,
        provider: response.providerId,
        providerGenerationId: response.generationId,
        progress: response.progress ?? 0,
      });
      return;
    }

    this.patchJob(jobId, {
      provider: response.providerId,
      providerGenerationId: response.generationId,
      progress: response.progress ?? 0,
    });

    for (let attempt = 0; attempt < JOB_MAX_POLL_ATTEMPTS; attempt += 1) {
      await wait(JOB_POLL_INTERVAL_MS);

      const currentJob = this.jobs.get(jobId);

      if (!currentJob || currentJob.status !== "running") {
        return;
      }

      const pollResult = await this.aiGenerationService.getGenerationResult(
        response.generationId,
        response.providerId,
      );

      if (!pollResult.ok) {
        this.patchJob(jobId, {
          status: "error",
          error: createJobError(pollResult.error.message),
        });
        return;
      }

      if (pollResult.data.status === "completed") {
        this.markImageJobSuccess(jobId, pollResult.data);
        return;
      }

      if (
        pollResult.data.status === "failed" ||
        pollResult.data.status === "cancelled"
      ) {
        this.patchJob(jobId, {
          status: "error",
          error:
            pollResult.data.error?.message ??
            `Image generation ended with status ${pollResult.data.status}.`,
          provider: pollResult.data.providerId,
          providerGenerationId: pollResult.data.generationId,
          progress: pollResult.data.progress ?? 0,
        });
        return;
      }

      this.patchJob(jobId, {
        provider: pollResult.data.providerId,
        providerGenerationId: pollResult.data.generationId,
        progress: pollResult.data.progress ?? 0,
      });
    }

    this.patchJob(jobId, {
      status: "error",
      error:
        "Provider polling timed out before completion. The provider may still be processing remotely.",
    });
  }

  private markImageJobSuccess(
    jobId: string,
    response: AIGenerationResponse,
  ) {
    const firstImage = response.images[0];

    if (!firstImage) {
      this.patchJob(jobId, {
        status: "error",
        error: "Image generation completed without an image result.",
        provider: response.providerId,
        providerGenerationId: response.generationId,
      });
      return;
    }

    this.patchJob(jobId, {
      status: "success",
      provider: response.providerId,
      model: getGenerationProviderModel(firstImage.providerMetadata),
      resultAssetId: firstImage.assetId,
      resultUrl: firstImage.url,
      resultMimeType: firstImage.mimeType,
      providerGenerationId: response.generationId,
      progress: 100,
      warnings: response.warnings,
    });
  }

  private patchJob(jobId: string, patch: Partial<InternalGenerationJob>) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return;
    }

    this.jobs.set(jobId, {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  private toPublicJob(job: InternalGenerationJob): GenerationJob {
    const { providerHint: _providerHint, ...publicJob } = job;
    return publicJob;
  }
}
