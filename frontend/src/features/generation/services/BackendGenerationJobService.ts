import type { SemanticBrief } from "../../../entities/semantic/types";
import type {
  MediaGenerationSpec,
  VisualStyleProfile,
} from "../../orchestration/types";

export type GenerationJobStatus = "pending" | "running" | "success" | "error";

export interface CreateGenerationJobRequest {
  mediaGenerationSpec: MediaGenerationSpec;
  providerHint?: string;
  targetBlockId?: string;
  documentId?: string;
  slotId?: string;
  semanticBrief?: SemanticBrief;
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
  payload: CreateGenerationJobRequest;
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

interface GenerationJobResponse {
  job: GenerationJob;
}

interface GenerationJobListResponse {
  jobs: GenerationJob[];
}

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api/generation-jobs").replace(/\/+$/, "");

export class BackendGenerationJobService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async createGenerationJob(
    payload: CreateGenerationJobRequest,
  ): Promise<GenerationJob> {
    const response = await this.request<GenerationJobResponse>("", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return response.job;
  }

  async getGenerationJob(jobId: string): Promise<GenerationJob> {
    const response = await this.request<GenerationJobResponse>(
      `/${encodeURIComponent(jobId)}`,
    );

    return response.job;
  }

  async retryGenerationJob(jobId: string): Promise<GenerationJob> {
    const response = await this.request<GenerationJobResponse>(
      `/${encodeURIComponent(jobId)}/retry`,
      {
        method: "POST",
      },
    );

    return response.job;
  }

  async listGenerationJobs(documentId?: string): Promise<GenerationJob[]> {
    const query = documentId
      ? `?documentId=${encodeURIComponent(documentId)}`
      : "";
    const response = await this.request<GenerationJobListResponse>(query);

    return response.jobs;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new Error(
        payload.error?.message ??
          `Generation job request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }
}

export const backendGenerationJobService = new BackendGenerationJobService();
