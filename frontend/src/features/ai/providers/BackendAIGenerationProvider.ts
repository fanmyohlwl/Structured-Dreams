import type { AIGenerationProvider } from "./AIGenerationProvider";
import type {
  AIGenerationRequest,
  AIGenerationResponse,
  AIProviderId,
  AIProviderRuntimeConfig,
} from "../types";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api/ai").replace(/\/+$/, "");

export class BackendAIGenerationProvider implements AIGenerationProvider {
  readonly providerId: AIProviderId = "backend";

  readonly displayName = "Backend AI Gateway";

  private readonly baseUrl: string;

  constructor(private readonly config?: AIProviderRuntimeConfig) {
    this.baseUrl = normalizeBaseUrl(config?.baseUrl);
  }

  private async request<T>(
    input: string,
    init?: RequestInit,
  ): Promise<T> {
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
          `Backend AI request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  async generateImage(
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    return this.request<AIGenerationResponse>(`${this.baseUrl}/generations`, {
      method: "POST",
      body: JSON.stringify({ request }),
    });
  }

  async getGenerationResult(generationId: string): Promise<AIGenerationResponse> {
    return this.request<AIGenerationResponse>(
      `${this.baseUrl}/generations/${encodeURIComponent(generationId)}`,
    );
  }

  async cancelGeneration(generationId: string): Promise<void> {
    await this.request<{ ok: true }>(
      `${this.baseUrl}/generations/${encodeURIComponent(generationId)}/cancel`,
      {
        method: "POST",
      },
    );
  }
}
