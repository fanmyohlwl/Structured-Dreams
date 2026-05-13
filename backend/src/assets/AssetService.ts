import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { AIGeneratedImage, AIGenerationResponse } from "../ai/types.js";
import type {
  AIGeneratedVideo,
  AIVideoGenerationResponse,
} from "../ai/videoTypes.js";
import type {
  StoredAssetMediaType,
  StoredAssetOrigin,
  StoredAssetRecord,
  StoredAssetRole,
  StoredAssetRecordInput,
} from "./types.js";
import {
  legacyStoredAssetKindFromMedia,
  normalizeStoredAssetRecord,
} from "./types.js";
import { ensureDirectory, readJsonFile, writeJsonFile } from "../shared/filesystem.js";

const now = () => new Date().toISOString();

const mimeTypeToExtension: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/ogg": ".ogv",
};

const extensionToMimeType: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
  ".ogv": "video/ogg",
};

export interface AssetImportRequest {
  sourceUrl: string;
  fileName?: string;
  mimeType?: string;
  mediaType: StoredAssetMediaType;
  role: StoredAssetRole;
  origin: StoredAssetOrigin;
  ownerId?: string | null;
  providerId?: string | null;
  providerGenerationId?: string | null;
}

const normalizeAssetIdFromUrl = (sourceUrl: string) => {
  try {
    const parsedUrl = new URL(sourceUrl, "http://localhost");
    const matchedPath = parsedUrl.pathname.match(/^\/api\/assets\/([^/]+)$/);
    return matchedPath ? decodeURIComponent(matchedPath[1]) : undefined;
  } catch {
    return undefined;
  }
};

const inferMimeTypeFromUrl = (sourceUrl: string) => {
  const normalizedExtension = extname(sourceUrl.split("?")[0] ?? "").toLowerCase();
  return extensionToMimeType[normalizedExtension] ?? "application/octet-stream";
};

const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";

const inferFileName = ({
  sourceUrl,
  fileName,
  mimeType,
  assetId,
}: {
  sourceUrl: string;
  fileName?: string;
  mimeType: string;
  assetId: string;
}) => {
  const requestedFileName = fileName?.trim();

  if (requestedFileName) {
    return `${assetId}-${sanitizeFileName(requestedFileName)}`;
  }

  const parsedSourceName = basename(sourceUrl.split("?")[0] ?? "").trim();

  if (parsedSourceName && parsedSourceName !== "/") {
    return `${assetId}-${sanitizeFileName(parsedSourceName)}`;
  }

  const extension = mimeTypeToExtension[mimeType] ?? ".bin";
  return `${assetId}${extension}`;
};

const parseDataUrl = (sourceUrl: string) => {
  if (!sourceUrl.startsWith("data:")) {
    throw new Error("The provided data URL is not valid.");
  }

  const commaIndex = sourceUrl.indexOf(",");

  if (commaIndex < 0) {
    throw new Error("The provided data URL is not valid.");
  }

  const header = sourceUrl.slice(5, commaIndex);
  const body = sourceUrl.slice(commaIndex + 1);
  const mimeType = header.split(";")[0] || "application/octet-stream";
  const isBase64 = /;base64(?:;|$)/i.test(header);
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  return {
    mimeType,
    buffer,
  };
};

const createPublicAssetUrl = (assetId: string) => `/api/assets/${encodeURIComponent(assetId)}`;
const EXTERNAL_ASSET_FETCH_TIMEOUT_MS = 15_000;

const summarizeSourceUrlForLog = (sourceUrl: string) => {
  if (sourceUrl.startsWith("data:")) {
    const commaIndex = sourceUrl.indexOf(",");
    const header = commaIndex >= 0 ? sourceUrl.slice(0, commaIndex) : "data:";

    return `${header},[data omitted]`;
  }

  return sourceUrl;
};

const inferMimeTypeFromVideoUrl = (url: string) => {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes(".webm")) {
    return "video/webm";
  }

  if (normalizedUrl.includes(".mov") || normalizedUrl.includes(".qt")) {
    return "video/quicktime";
  }

  if (normalizedUrl.includes(".ogv")) {
    return "video/ogg";
  }

  return "video/mp4";
};

export class AssetService {
  private readonly assetsDirectory: string;

  constructor(private readonly dataDirectory: string) {
    this.assetsDirectory = join(dataDirectory, "assets");
  }

  async ensureReady() {
    await ensureDirectory(this.assetsDirectory);
  }

  private getMetadataPath(assetId: string) {
    return join(this.assetsDirectory, `${assetId}.json`);
  }

  private getFilePath(fileName: string) {
    return join(this.assetsDirectory, fileName);
  }

  async getAssetRecord(assetId: string): Promise<StoredAssetRecord | null> {
    try {
      const rawRecord =
        await readJsonFile<StoredAssetRecordInput>(this.getMetadataPath(assetId));
      return normalizeStoredAssetRecord(rawRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async getAssetContent(assetId: string) {
    const assetRecord = await this.getAssetRecord(assetId);

    if (!assetRecord) {
      return null;
    }

    const assetBuffer = await readFile(this.getFilePath(assetRecord.fileName));

    return {
      record: assetRecord,
      buffer: assetBuffer,
    };
  }

  async getAssetDataUrl(assetId: string) {
    const assetPayload = await this.getAssetContent(assetId);

    if (!assetPayload) {
      return null;
    }

    return {
      record: assetPayload.record,
      dataUrl: `data:${assetPayload.record.mimeType};base64,${assetPayload.buffer.toString("base64")}`,
    };
  }

  private async saveAssetBuffer({
    buffer,
    mimeType,
    sourceUrl,
    fileName,
    mediaType,
    role,
    ownerId,
    origin,
    providerId,
    providerGenerationId,
  }: {
    buffer: Buffer;
    mimeType: string;
    sourceUrl: string;
    fileName?: string;
    mediaType: StoredAssetMediaType;
    role: StoredAssetRole;
    ownerId?: string | null;
    origin: StoredAssetOrigin;
    providerId?: string | null;
    providerGenerationId?: string | null;
  }) {
    const assetId = randomUUID();
    const resolvedMimeType = mimeType || "application/octet-stream";
    const resolvedFileName = inferFileName({
      sourceUrl,
      fileName,
      mimeType: resolvedMimeType,
      assetId,
    });
    const filePath = this.getFilePath(resolvedFileName);

    await this.ensureReady();
    await writeFile(filePath, buffer);

    const timestamp = now();
    const assetRecord: StoredAssetRecord = {
      id: assetId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerId: ownerId ?? null,
      mimeType: resolvedMimeType,
      fileName: resolvedFileName,
      byteSize: buffer.byteLength,
      mediaType,
      role,
      kind: legacyStoredAssetKindFromMedia({
        mediaType,
        role,
      }),
      origin,
      sourceUrl,
      providerId: providerId ?? null,
      providerGenerationId: providerGenerationId ?? null,
      storagePath: `assets/${resolvedFileName}`,
      publicUrl: createPublicAssetUrl(assetId),
    };

    await writeJsonFile(this.getMetadataPath(assetId), assetRecord);

    return assetRecord;
  }

  async importAssetFromSource({
    sourceUrl,
    fileName,
    mimeType,
    mediaType,
    role,
    ownerId,
    origin,
    providerId,
    providerGenerationId,
  }: AssetImportRequest): Promise<StoredAssetRecord> {
    console.log(
      `[assets] import start origin=${origin} mediaType=${mediaType} role=${role} source=${summarizeSourceUrlForLog(sourceUrl)}`,
    );
    const internalAssetId = normalizeAssetIdFromUrl(sourceUrl);

    if (internalAssetId) {
      let existingAsset = await this.getAssetRecord(internalAssetId);

      if (!existingAsset) {
        throw new Error(`Internal asset is missing: ${internalAssetId}`);
      }

      if (ownerId && existingAsset.ownerId == null) {
        existingAsset = await this.assignAssetOwner(existingAsset.id, ownerId);
      }

      console.log(
        `[assets] import reuse internal asset assetId=${existingAsset.id} source=${sourceUrl}`,
      );
      return existingAsset;
    }

    if (sourceUrl.startsWith("data:")) {
      const dataUrlPayload = parseDataUrl(sourceUrl);

      const storedAsset = await this.saveAssetBuffer({
        buffer: dataUrlPayload.buffer,
        mimeType: mimeType ?? dataUrlPayload.mimeType,
        sourceUrl,
        fileName,
        mediaType,
        role,
        ownerId,
        origin,
        providerId,
        providerGenerationId,
      });

      console.log(
        `[assets] import complete data-url assetId=${storedAsset.id} source=${sourceUrl.slice(
          0,
          sourceUrl.indexOf(",") > 0 ? sourceUrl.indexOf(",") : 64,
        )},[data omitted]`,
      );
      return storedAsset;
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      throw new Error(`Unsupported asset source URL: ${sourceUrl}`);
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, EXTERNAL_ASSET_FETCH_TIMEOUT_MS);

    let response: Response;

    try {
      console.log(
        `[assets] fetch start timeout=${EXTERNAL_ASSET_FETCH_TIMEOUT_MS}ms source=${sourceUrl}`,
      );
      response = await fetch(sourceUrl, {
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Timed out after ${EXTERNAL_ASSET_FETCH_TIMEOUT_MS}ms while fetching external asset: ${sourceUrl}`,
        );
      }

      throw new Error(
        `Failed to fetch external asset: ${sourceUrl}. ${
          error instanceof Error ? error.message : "Unknown fetch error."
        }`,
      );
    }

    if (!response.ok) {
      clearTimeout(timeoutHandle);
      throw new Error(
        `Failed to fetch asset source (${response.status}): ${sourceUrl}`,
      );
    }

    let arrayBuffer: ArrayBuffer;

    try {
      arrayBuffer = await response.arrayBuffer();
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Timed out after ${EXTERNAL_ASSET_FETCH_TIMEOUT_MS}ms while downloading external asset data: ${sourceUrl}`,
        );
      }

      throw new Error(
        `Failed to read external asset response body: ${sourceUrl}. ${
          error instanceof Error ? error.message : "Unknown body read error."
        }`,
      );
    }

    clearTimeout(timeoutHandle);
    const responseMimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

    const storedAsset = await this.saveAssetBuffer({
      buffer: Buffer.from(arrayBuffer),
      mimeType:
        mimeType ??
        (responseMimeType || inferMimeTypeFromUrl(sourceUrl)),
      sourceUrl,
      fileName,
      mediaType,
      role,
      ownerId,
      origin,
      providerId,
      providerGenerationId,
    });

    console.log(
      `[assets] import complete external assetId=${storedAsset.id} status=${response.status} source=${sourceUrl}`,
    );
    return storedAsset;
  }

  async assignAssetOwner(assetId: string, ownerId: string) {
    const assetRecord = await this.getAssetRecord(assetId);

    if (!assetRecord) {
      throw new Error(`Cannot assign owner to missing asset: ${assetId}`);
    }

    if (assetRecord.ownerId === ownerId) {
      return assetRecord;
    }

    const nextRecord: StoredAssetRecord = {
      ...assetRecord,
      ownerId,
      updatedAt: now(),
    };

    await writeJsonFile(this.getMetadataPath(assetId), nextRecord);
    return nextRecord;
  }

  async persistAIGenerationResponse(
    response: AIGenerationResponse,
  ): Promise<AIGenerationResponse> {
    if (response.status !== "completed" || response.images.length === 0) {
      return response;
    }

    const persistedImages = await Promise.all(
      response.images.map(async (image, index) => {
        const mainAsset = await this.importAssetFromSource({
          sourceUrl: image.url,
          mimeType: image.mimeType,
          fileName: image.assetId
            ? `${image.assetId}${mimeTypeToExtension[image.mimeType] ?? ""}`
            : undefined,
          mediaType: "image",
          role: "ai-result",
          origin: "ai-provider",
          providerId: response.providerId,
          providerGenerationId: response.generationId,
        });
        const previewAsset =
          image.previewUrl && image.previewUrl !== image.url
            ? await this.importAssetFromSource({
                sourceUrl: image.previewUrl,
                mimeType: image.mimeType,
                fileName: `${mainAsset.id}-preview-${
                  index + 1
                }${mimeTypeToExtension[image.mimeType] ?? ""}`,
                mediaType: "image",
                role: "preview",
                origin: "ai-provider",
                providerId: response.providerId,
                providerGenerationId: response.generationId,
              })
            : mainAsset;

        const persistedImage: AIGeneratedImage = {
          ...image,
          assetId: mainAsset.id,
          url: mainAsset.publicUrl,
          previewUrl: previewAsset.publicUrl,
          mimeType: mainAsset.mimeType,
        };

        return persistedImage;
      }),
    );

    return {
      ...response,
      images: persistedImages,
    };
  }

  async persistAIVideoGenerationResponse(
    response: AIVideoGenerationResponse,
  ): Promise<AIVideoGenerationResponse> {
    if (response.status !== "completed" || response.videos.length === 0) {
      return response;
    }

    const persistedVideos = await Promise.all(
      response.videos.map(async (video, index) => {
        const resolvedVideoMimeType =
          video.mimeType || inferMimeTypeFromVideoUrl(video.url);
        const mainAsset = await this.importAssetFromSource({
          sourceUrl: video.url,
          mimeType: resolvedVideoMimeType,
          fileName: video.assetId
            ? `${video.assetId}${mimeTypeToExtension[resolvedVideoMimeType] ?? ""}`
            : undefined,
          mediaType: "video",
          role: "ai-result",
          origin: "ai-provider",
          providerId: response.providerId,
          providerGenerationId: response.generationId,
        });

        let posterAsset: StoredAssetRecord | undefined;
        let previewAsset: StoredAssetRecord | undefined;

        if (video.posterUrl) {
          const posterMimeType = video.posterMimeType ?? "image/png";
          posterAsset = await this.importAssetFromSource({
            sourceUrl: video.posterUrl,
            mimeType: posterMimeType,
            fileName: `${mainAsset.id}-poster-${index + 1}${
              mimeTypeToExtension[posterMimeType] ?? ".png"
            }`,
            mediaType: "image",
            role: "poster",
            origin: "ai-provider",
            providerId: response.providerId,
            providerGenerationId: response.generationId,
          });
        }

        if (video.previewImageUrl) {
          if (video.previewImageUrl === video.posterUrl && posterAsset) {
            previewAsset = posterAsset;
          } else {
            const previewMimeType = video.previewImageMimeType ?? "image/png";
            previewAsset = await this.importAssetFromSource({
              sourceUrl: video.previewImageUrl,
              mimeType: previewMimeType,
              fileName: `${mainAsset.id}-preview-${index + 1}${
                mimeTypeToExtension[previewMimeType] ?? ".png"
              }`,
              mediaType: "image",
              role: "preview",
              origin: "ai-provider",
              providerId: response.providerId,
              providerGenerationId: response.generationId,
            });
          }
        }

        const persistedVideo: AIGeneratedVideo = {
          ...video,
          assetId: mainAsset.id,
          url: mainAsset.publicUrl,
          mimeType: mainAsset.mimeType,
          posterAssetId: posterAsset?.id ?? video.posterAssetId,
          posterUrl: posterAsset?.publicUrl ?? video.posterUrl,
          posterMimeType: posterAsset?.mimeType ?? video.posterMimeType,
          previewImageAssetId:
            previewAsset?.id ?? posterAsset?.id ?? video.previewImageAssetId,
          previewImageUrl:
            previewAsset?.publicUrl ??
            posterAsset?.publicUrl ??
            video.previewImageUrl,
          previewImageMimeType:
            previewAsset?.mimeType ??
            posterAsset?.mimeType ??
            video.previewImageMimeType,
        };

        return persistedVideo;
      }),
    );

    return {
      ...response,
      videos: persistedVideos,
    };
  }
}
