import type { DesignDocument } from "../../../entities/document/types";
import type {
  DocumentSaveStage,
  StoredDocumentRecord,
  StoredDocumentSummary,
} from "../types";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const createBackendUnreachableMessage = () =>
  "Could not reach the backend API. Make sure the backend is running and /api requests are proxied correctly.";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api").replace(/\/+$/, "");

const DOCUMENT_SAVE_REQUEST_TIMEOUT_MS = 90_000;

export class DocumentPersistenceError extends Error {
  readonly stage: DocumentSaveStage;

  constructor(message: string, stage: DocumentSaveStage) {
    super(message);
    this.name = "DocumentPersistenceError";
    this.stage = stage;
  }
}

export class BackendDocumentPersistenceService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    options?: { timeoutMs?: number; failureStage?: DocumentSaveStage },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutHandle = globalThis.setTimeout(() => {
      controller.abort();
    }, options?.timeoutMs ?? DOCUMENT_SAVE_REQUEST_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        credentials: "include",
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } catch (error) {
      globalThis.clearTimeout(timeoutHandle);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DocumentPersistenceError(
          "Save request timed out while waiting for the server.",
          options?.failureStage ?? "save-failed",
        );
      }

      if (error instanceof TypeError) {
        throw new DocumentPersistenceError(
          createBackendUnreachableMessage(),
          options?.failureStage ?? "save-failed",
        );
      }

      throw error;
    }

    globalThis.clearTimeout(timeoutHandle);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new DocumentPersistenceError(
        payload.error?.message ??
          `Document request failed with status ${response.status}.`,
        options?.failureStage ?? "save-failed",
      );
    }

    return (await response.json()) as T;
  }

  async saveDocument(
    document: DesignDocument,
    options?: { onStage?: (stage: DocumentSaveStage) => void },
  ): Promise<StoredDocumentRecord> {
    options?.onStage?.("saving");
    options?.onStage?.("normalizing-assets");
    const storedRecord = await this.request<StoredDocumentRecord>(
      `/documents/${encodeURIComponent(document.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ document }),
      },
      {
        timeoutMs: DOCUMENT_SAVE_REQUEST_TIMEOUT_MS,
        failureStage: "save-failed",
      },
    );
    options?.onStage?.("writing-document");
    return storedRecord;
  }

  async getDocument(documentId: string): Promise<StoredDocumentRecord> {
    return this.request<StoredDocumentRecord>(
      `/documents/${encodeURIComponent(documentId)}`,
    );
  }

  async getRecentDocuments(): Promise<StoredDocumentSummary[]> {
    const payload = await this.request<{ documents: StoredDocumentSummary[] }>(
      "/documents",
    );

    return payload.documents;
  }
}

export const backendDocumentPersistenceService =
  new BackendDocumentPersistenceService();
