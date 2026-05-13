import type { AnimatedExportFormat } from "../types";

interface TranscodeVideoPayload {
  source: Blob;
  targetFormat: Extract<AnimatedExportFormat, "mp4" | "gif">;
  fileName: string;
}

const getSafeErrorMessage = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      return payload.error?.message;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export class BackendVideoTranscodeService {
  async transcode({
    source,
    targetFormat,
    fileName,
  }: TranscodeVideoPayload): Promise<Blob> {
    const query = new URLSearchParams({
      format: targetFormat,
      fileName,
    });

    let response: Response;

    try {
      response = await fetch(`/api/exports/videos/transcode?${query.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": source.type || "video/webm",
        },
        body: source,
      });
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Failed to reach backend transcode service: ${error.message}`
          : "Failed to reach backend transcode service.",
      );
    }

    if (!response.ok) {
      const errorMessage = await getSafeErrorMessage(response);
      throw new Error(
        errorMessage ??
          `Backend transcode failed with status ${response.status}.`,
      );
    }

    return response.blob();
  }
}

export const backendVideoTranscodeService = new BackendVideoTranscodeService();
