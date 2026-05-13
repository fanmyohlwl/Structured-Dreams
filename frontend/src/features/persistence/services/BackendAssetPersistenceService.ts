import type {
  VisualStyleAnalysisResponse,
} from "../../orchestration/types";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

export interface UploadedAssetRecord {
  id: string;
  mimeType: string;
  fileName: string;
  byteSize: number;
  publicUrl: string;
}

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api").replace(/\/+$/, "");

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read the image file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed."));
    reader.readAsDataURL(file);
  });

export class BackendAssetPersistenceService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        credentials: "include",
        ...init,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Could not reach the backend API. Make sure the backend is running and /api requests are proxied correctly.",
        );
      }

      throw error;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new Error(
        payload.error?.message ?? `Asset request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  async uploadImage(file: File): Promise<UploadedAssetRecord> {
    const dataUrl = await fileToDataUrl(file);
    const payload = await this.request<{ asset: UploadedAssetRecord }>(
      "/assets/upload",
      {
        method: "POST",
        body: JSON.stringify({
          dataUrl,
          fileName: file.name,
          mimeType: file.type,
        }),
      },
    );

    return payload.asset;
  }

  async analyzeVisualStyle(input: {
    assetId: string;
    title?: string;
  }): Promise<VisualStyleAnalysisResponse> {
    return this.request<VisualStyleAnalysisResponse>(
      "/orchestrator/style-analysis",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }
}

export const backendAssetPersistenceService =
  new BackendAssetPersistenceService();
