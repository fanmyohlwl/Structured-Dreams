import type { AIProviderId, AIProviderRuntimeConfig } from "../types";
import type {
  AIVideoGenerationRequest,
  AIVideoGenerationResponse,
} from "../videoTypes";
import type { AIVideoGenerationProvider } from "./AIVideoGenerationProvider";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api/ai").replace(/\/+$/, "");

export class BackendAIVideoGenerationProvider
  implements AIVideoGenerationProvider
{
  readonly providerId: AIProviderId = "backend";

  readonly displayName = "Backend AI Video Gateway";

  private readonly baseUrl: string;

  constructor(private readonly config?: AIProviderRuntimeConfig) {
    this.baseUrl = normalizeBaseUrl(config?.baseUrl);
  }

  private async request<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
      headers: {
        "Content-Type": "application/json",
        ...this.config?.extraHeaders,
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new Error(
        payload.error?.message ??
          `Backend AI video request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  async generateVideo(
    request: AIVideoGenerationRequest,
  ): Promise<AIVideoGenerationResponse> {
    return this.request<AIVideoGenerationResponse>(
      `${this.baseUrl}/video-generations`,
      {
        method: "POST",
        body: JSON.stringify({ request }),
      },
    );
  }

  async getVideoGenerationResult(
    generationId: string,
  ): Promise<AIVideoGenerationResponse> {
    return this.request<AIVideoGenerationResponse>(
      `${this.baseUrl}/video-generations/${encodeURIComponent(generationId)}`,
    );
  }

  async cancelVideoGeneration(generationId: string): Promise<void> {
    await this.request<{ ok: true }>(
      `${this.baseUrl}/video-generations/${encodeURIComponent(generationId)}/cancel`,
      {
        method: "POST",
      },
    );
  }
}
