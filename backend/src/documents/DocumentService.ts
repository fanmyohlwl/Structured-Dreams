import { join } from "node:path";
import { AssetService } from "../assets/AssetService.js";
import type {
  StoredAssetMediaType,
  StoredAssetOrigin,
  StoredAssetRecord,
} from "../assets/types.js";
import type {
  DocumentAssetNormalizationResult,
  StoredAIGenerationBlock,
  StoredDesignBlock,
  StoredDesignDocument,
  StoredDocumentCapabilities,
  StoredDocumentPrimaryMediaKind,
  StoredDocumentRecord,
  StoredDocumentSummary,
  StoredImageAssetRef,
  StoredImageBlock,
} from "./types.js";
import {
  ensureDirectory,
  readDirectorySafe,
  readJsonFile,
  writeJsonFile,
} from "../shared/filesystem.js";

const now = () => new Date().toISOString();

const inferImageAssetOrigin = (sourceUrl: string): StoredAssetOrigin => {
  if (sourceUrl.startsWith("data:")) {
    return "data-url";
  }

  if (/^https?:\/\//i.test(sourceUrl)) {
    return "external-url";
  }

  return "upload";
};

const inferImageAssetKind = (asset: StoredImageAssetRef | null) => {
  if (asset?.kind === "vector" || asset?.mimeType === "image/svg+xml") {
    return "vector";
  }

  return "raster";
};

const normalizeAssetRef = (
  asset: StoredAssetRecord,
  previousAsset: StoredImageAssetRef | null,
): StoredImageAssetRef => ({
  assetId: asset.id,
  kind: inferImageAssetKind(previousAsset),
  src: asset.publicUrl,
  mimeType: asset.mimeType,
  fileName: asset.fileName,
});

const isInternalAssetUrl = (sourceUrl: string) =>
  sourceUrl.startsWith("/api/assets/");

const describeBlock = (block: StoredDesignBlock) =>
  `blockId=${block.id} type=${block.type} name="${block.name}"`;

const hasEnabledFlag = (value: unknown): boolean =>
  typeof value === "object" &&
  value != null &&
  "enabled" in value &&
  (value as { enabled?: unknown }).enabled === true;

const inferMediaTypeFromMimeType = (
  mimeType?: string | null,
): StoredAssetMediaType | null => {
  if (!mimeType) {
    return null;
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
};

const inferMediaTypeFromUrl = (
  sourceUrl?: string | null,
): StoredAssetMediaType | null => {
  if (!sourceUrl) {
    return null;
  }

  const normalizedUrl = sourceUrl.split("?")[0]?.toLowerCase() ?? "";

  if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(normalizedUrl)) {
    return "image";
  }

  if (/\.(mp4|webm|mov|m4v|ogg)$/i.test(normalizedUrl)) {
    return "video";
  }

  return null;
};

const inferMediaType = ({
  mimeType,
  sourceUrl,
}: {
  mimeType?: string | null;
  sourceUrl?: string | null;
}): StoredAssetMediaType | null =>
  inferMediaTypeFromMimeType(mimeType) ?? inferMediaTypeFromUrl(sourceUrl);

const compareCoverCandidates = (
  left: { priority: number; zIndex: number },
  right: { priority: number; zIndex: number },
) =>
  left.priority - right.priority || right.zIndex - left.zIndex;

const createEmptyCapabilities = (): StoredDocumentCapabilities => ({
  hasAIGeneration: false,
  hasLiveBlock: false,
  usesLiveSignals: false,
  requiresCameraPermission: false,
  hasImageMedia: false,
  hasVideoMedia: false,
});

const derivePrimaryMediaKind = (
  capabilities: StoredDocumentCapabilities,
): StoredDocumentPrimaryMediaKind => {
  if (capabilities.hasImageMedia && capabilities.hasVideoMedia) {
    return "mixed";
  }

  if (capabilities.hasVideoMedia) {
    return "video";
  }

  if (capabilities.hasImageMedia) {
    return "image";
  }

  if (capabilities.hasLiveBlock || capabilities.usesLiveSignals) {
    return "live";
  }

  return "empty";
};

const deriveStoredDocumentSummary = (
  record: StoredDocumentRecord,
): StoredDocumentSummary => {
  const capabilities = createEmptyCapabilities();
  const coverCandidates: Array<{
    priority: number;
    zIndex: number;
    coverAssetId: string | null;
    coverUrl: string | null;
  }> = [];
  const canvasUsesLiveSignals = hasEnabledFlag(record.document.canvas.liveColorMapping);

  if (canvasUsesLiveSignals) {
    capabilities.usesLiveSignals = true;
    capabilities.requiresCameraPermission = true;
  }

  for (const block of record.document.blocks) {
    const zIndex = block.zIndex ?? 0;

    switch (block.type) {
      case "image": {
        const asset = block.data.asset;

        if (asset) {
          const mediaType = inferMediaType({
            mimeType: asset.mimeType,
            sourceUrl: asset.src,
          });

          if (mediaType === "image") {
            capabilities.hasImageMedia = true;
            coverCandidates.push({
              priority: 2,
              zIndex,
              coverAssetId: asset.assetId ?? null,
              coverUrl: asset.src ?? null,
            });
          } else if (mediaType === "video") {
            capabilities.hasVideoMedia = true;
          }
        }

        if (hasEnabledFlag(block.data.liveColorMapping)) {
          capabilities.usesLiveSignals = true;
          capabilities.requiresCameraPermission = true;
        }

        if (hasEnabledFlag(block.data.liveLayout)) {
          capabilities.usesLiveSignals = true;
          capabilities.requiresCameraPermission = true;
        }

        break;
      }

      case "ai-generation": {
        capabilities.hasAIGeneration = true;

        const aiMediaType = inferMediaType({
          mimeType: block.data.resultMimeType,
          sourceUrl: block.data.resultImageUrl ?? block.data.resultPreviewUrl,
        });

        if (aiMediaType === "image") {
          capabilities.hasImageMedia = true;
          coverCandidates.push({
            priority: 1,
            zIndex,
            coverAssetId: block.data.resultAssetId ?? null,
            coverUrl:
              block.data.resultPreviewUrl ??
              block.data.resultImageUrl ??
              null,
          });
        } else if (aiMediaType === "video") {
          capabilities.hasVideoMedia = true;
        }

        const aiVideoMediaType = inferMediaType({
          mimeType: block.data.resultVideoMimeType,
          sourceUrl: block.data.resultVideoUrl,
        });

        if (aiVideoMediaType === "video") {
          capabilities.hasVideoMedia = true;
        }

        if (block.data.resultPosterUrl) {
          coverCandidates.push({
            priority: 3,
            zIndex,
            coverAssetId: block.data.resultPosterAssetId ?? null,
            coverUrl: block.data.resultPosterUrl,
          });
        } else if (block.data.resultPreviewImageUrl) {
          coverCandidates.push({
            priority: 4,
            zIndex,
            coverAssetId: block.data.resultPreviewImageAssetId ?? null,
            coverUrl: block.data.resultPreviewImageUrl,
          });
        }

        if (hasEnabledFlag(block.data.liveColorMapping)) {
          capabilities.usesLiveSignals = true;
          capabilities.requiresCameraPermission = true;
        }

        break;
      }

      case "text": {
        if (hasEnabledFlag(block.data.liveColorMapping)) {
          capabilities.usesLiveSignals = true;
          capabilities.requiresCameraPermission = true;
        }

        if (hasEnabledFlag(block.data.liveTypography)) {
          capabilities.usesLiveSignals = true;
          capabilities.requiresCameraPermission = true;
        }

        break;
      }

      case "live": {
        capabilities.hasLiveBlock = true;
        capabilities.usesLiveSignals = true;
        capabilities.requiresCameraPermission = true;
        break;
      }

      default:
        break;
    }
  }

  coverCandidates.sort(compareCoverCandidates);
  const selectedCover = coverCandidates[0];

  return {
    id: record.id,
    name: record.document.name,
    updatedAt: record.updatedAt,
    visibility: record.visibility,
    primaryMediaKind: derivePrimaryMediaKind(capabilities),
    coverAssetId: selectedCover?.coverAssetId ?? null,
    coverUrl: selectedCover?.coverUrl ?? null,
    capabilities,
  };
};

const isStoredDesignDocument = (value: unknown): value is StoredDesignDocument => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as StoredDesignDocument;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    candidate.canvas != null &&
    typeof candidate.canvas.width === "number" &&
    typeof candidate.canvas.height === "number" &&
    typeof candidate.canvas.backgroundColor === "string" &&
    candidate.grid != null &&
    Array.isArray(candidate.blocks)
  );
};

export class DocumentService {
  private readonly documentsDirectory: string;

  constructor(
    private readonly dataDirectory: string,
    private readonly assetService: AssetService,
  ) {
    this.documentsDirectory = join(dataDirectory, "documents");
  }

  async ensureReady() {
    await ensureDirectory(this.documentsDirectory);
  }

  private getDocumentPath(documentId: string) {
    return join(this.documentsDirectory, `${documentId}.json`);
  }

  private async readStoredDocumentRecord(documentId: string) {
    try {
      return await readJsonFile<StoredDocumentRecord>(this.getDocumentPath(documentId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async listDocuments(ownerId: string): Promise<StoredDocumentSummary[]> {
    await this.ensureReady();
    const documentFiles = (await readDirectorySafe(this.documentsDirectory))
      .filter((fileName) => fileName.endsWith(".json"));
    const documentRecords = await Promise.all(
      documentFiles.map(async (fileName) => {
        try {
          return await readJsonFile<StoredDocumentRecord>(
            join(this.documentsDirectory, fileName),
          );
        } catch {
          return null;
        }
      }),
    );

    return documentRecords
      .filter((record): record is StoredDocumentRecord => record != null)
      .filter((record) => record.ownerId === ownerId)
      .map((record) => deriveStoredDocumentSummary(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getDocument(
    documentId: string,
    ownerId: string,
  ): Promise<StoredDocumentRecord | null> {
    const record = await this.readStoredDocumentRecord(documentId);

    if (!record || record.ownerId !== ownerId) {
      return null;
    }

    return record;
  }

  private async normalizeImageBlockAsset(
    block: StoredImageBlock,
    cache: Map<string, StoredAssetRecord>,
    ownerId: string,
  ): Promise<StoredImageBlock> {
    console.log(`[documents] normalize image start ${describeBlock(block)}`);

    if (!block.data.asset?.src) {
      console.log(
        `[documents] normalize image skip ${describeBlock(block)} reason=no-asset-src`,
      );
      return block;
    }

    const cacheKey = `image:${block.data.asset.src}`;
    const cachedAsset = cache.get(cacheKey);
    const storedAsset =
      cachedAsset ??
      (await this.assetService.importAssetFromSource({
        sourceUrl: block.data.asset.src,
        fileName: block.data.asset.fileName,
        mimeType: block.data.asset.mimeType,
        mediaType: "image",
        role: "source",
        ownerId,
        origin: inferImageAssetOrigin(block.data.asset.src),
      }));

    cache.set(cacheKey, storedAsset);

    console.log(
      `[documents] normalize image complete ${describeBlock(block)} assetId=${storedAsset.id}`,
    );

    return {
      ...block,
      data: {
        ...block.data,
        asset: normalizeAssetRef(storedAsset, block.data.asset),
      },
    };
  }

  private async normalizeAIBlockAssets(
    block: StoredAIGenerationBlock,
    cache: Map<string, StoredAssetRecord>,
    ownerId: string,
  ): Promise<StoredAIGenerationBlock> {
    console.log(`[documents] normalize ai start ${describeBlock(block)}`);
    const resultImageUrl = block.data.resultImageUrl;
    const resultPreviewUrl = block.data.resultPreviewUrl;
    const resultVideoUrl = block.data.resultVideoUrl;
    const resultPosterUrl = block.data.resultPosterUrl;
    const resultPreviewImageUrl = block.data.resultPreviewImageUrl;

    if (
      !resultImageUrl &&
      !resultPreviewUrl &&
      !resultVideoUrl &&
      !resultPosterUrl &&
      !resultPreviewImageUrl
    ) {
      console.log(
        `[documents] normalize ai skip ${describeBlock(block)} reason=no-result-media`,
      );
      return block;
    }

    let resultAssetRecord: StoredAssetRecord | undefined;
    let previewAssetRecord: StoredAssetRecord | undefined;
    let resultVideoAssetRecord: StoredAssetRecord | undefined;
    let resultPosterAssetRecord: StoredAssetRecord | undefined;
    let resultPreviewImageAssetRecord: StoredAssetRecord | undefined;

    if (resultImageUrl) {
      const resultCacheKey = `ai-result:${resultImageUrl}`;
      resultAssetRecord =
        cache.get(resultCacheKey) ??
        (await this.assetService.importAssetFromSource({
          sourceUrl: resultImageUrl,
          mimeType: block.data.resultMimeType,
          ownerId,
          mediaType: inferMediaType({
            mimeType: block.data.resultMimeType,
            sourceUrl: resultImageUrl,
          }) ?? "image",
          role: "ai-result",
          origin: /^data:/i.test(resultImageUrl) ? "data-url" : "ai-provider",
          providerId: block.data.provider ?? null,
          providerGenerationId: block.data.generationId ?? null,
        }));
      cache.set(resultCacheKey, resultAssetRecord);
    }

    if (resultPreviewUrl) {
      if (resultPreviewUrl === resultImageUrl && resultAssetRecord) {
        previewAssetRecord = resultAssetRecord;
      } else {
        const previewCacheKey = `ai-preview:${resultPreviewUrl}`;
        previewAssetRecord =
          cache.get(previewCacheKey) ??
          (await this.assetService.importAssetFromSource({
            sourceUrl: resultPreviewUrl,
            mimeType: block.data.resultMimeType,
            ownerId,
            mediaType: inferMediaType({
              mimeType: block.data.resultMimeType,
              sourceUrl: resultPreviewUrl,
            }) ?? "image",
            role: "preview",
            origin: /^data:/i.test(resultPreviewUrl) ? "data-url" : "ai-provider",
            providerId: block.data.provider ?? null,
            providerGenerationId: block.data.generationId ?? null,
          }));
        cache.set(previewCacheKey, previewAssetRecord);
      }
    }

    if (resultVideoUrl) {
      const resultVideoCacheKey = `ai-video:${resultVideoUrl}`;
      resultVideoAssetRecord =
        cache.get(resultVideoCacheKey) ??
        (await this.assetService.importAssetFromSource({
          sourceUrl: resultVideoUrl,
          mimeType: block.data.resultVideoMimeType,
          ownerId,
          mediaType: inferMediaType({
            mimeType: block.data.resultVideoMimeType,
            sourceUrl: resultVideoUrl,
          }) ?? "video",
          role: "ai-result",
          origin: /^data:/i.test(resultVideoUrl) ? "data-url" : "ai-provider",
          providerId: block.data.provider ?? null,
          providerGenerationId: block.data.generationId ?? null,
        }));
      cache.set(resultVideoCacheKey, resultVideoAssetRecord);
    }

    if (resultPosterUrl) {
      if (resultPosterUrl === resultPreviewUrl && previewAssetRecord) {
        resultPosterAssetRecord = previewAssetRecord;
      } else if (resultPosterUrl === resultImageUrl && resultAssetRecord) {
        resultPosterAssetRecord = resultAssetRecord;
      } else {
        const resultPosterCacheKey = `ai-poster:${resultPosterUrl}`;
        resultPosterAssetRecord =
          cache.get(resultPosterCacheKey) ??
          (await this.assetService.importAssetFromSource({
            sourceUrl: resultPosterUrl,
            mimeType: block.data.resultPosterMimeType,
            ownerId,
            mediaType: "image",
            role: "poster",
            origin: /^data:/i.test(resultPosterUrl)
              ? "data-url"
              : "ai-provider",
            providerId: block.data.provider ?? null,
            providerGenerationId: block.data.generationId ?? null,
          }));
        cache.set(resultPosterCacheKey, resultPosterAssetRecord);
      }
    }

    if (resultPreviewImageUrl) {
      if (resultPreviewImageUrl === resultPosterUrl && resultPosterAssetRecord) {
        resultPreviewImageAssetRecord = resultPosterAssetRecord;
      } else if (
        resultPreviewImageUrl === resultPreviewUrl &&
        previewAssetRecord
      ) {
        resultPreviewImageAssetRecord = previewAssetRecord;
      } else if (
        resultPreviewImageUrl === resultImageUrl &&
        resultAssetRecord
      ) {
        resultPreviewImageAssetRecord = resultAssetRecord;
      } else {
        const previewImageCacheKey = `ai-preview-image:${resultPreviewImageUrl}`;
        resultPreviewImageAssetRecord =
          cache.get(previewImageCacheKey) ??
          (await this.assetService.importAssetFromSource({
            sourceUrl: resultPreviewImageUrl,
            mimeType: block.data.resultPreviewImageMimeType,
            ownerId,
            mediaType: "image",
            role: "preview",
            origin: /^data:/i.test(resultPreviewImageUrl)
              ? "data-url"
              : "ai-provider",
            providerId: block.data.provider ?? null,
            providerGenerationId: block.data.generationId ?? null,
          }));
        cache.set(previewImageCacheKey, resultPreviewImageAssetRecord);
      }
    }

    console.log(
      `[documents] normalize ai complete ${describeBlock(block)} resultAssetId=${
        resultAssetRecord?.id ??
        resultVideoAssetRecord?.id ??
        previewAssetRecord?.id ??
        block.data.resultAssetId ??
        "none"
      }`,
    );

    return {
      ...block,
      data: {
        ...block.data,
        resultAssetId:
          resultAssetRecord?.id ??
          previewAssetRecord?.id ??
          block.data.resultAssetId,
        resultImageUrl:
          resultAssetRecord?.publicUrl ?? block.data.resultImageUrl,
        resultPreviewUrl:
          previewAssetRecord?.publicUrl ??
          resultAssetRecord?.publicUrl ??
          block.data.resultPreviewUrl,
        resultMimeType:
          resultAssetRecord?.mimeType ??
          previewAssetRecord?.mimeType ??
          block.data.resultMimeType,
        resultVideoAssetId:
          resultVideoAssetRecord?.id ?? block.data.resultVideoAssetId,
        resultVideoUrl:
          resultVideoAssetRecord?.publicUrl ?? block.data.resultVideoUrl,
        resultVideoMimeType:
          resultVideoAssetRecord?.mimeType ?? block.data.resultVideoMimeType,
        resultPosterAssetId:
          resultPosterAssetRecord?.id ?? block.data.resultPosterAssetId,
        resultPosterUrl:
          resultPosterAssetRecord?.publicUrl ?? block.data.resultPosterUrl,
        resultPosterMimeType:
          resultPosterAssetRecord?.mimeType ?? block.data.resultPosterMimeType,
        resultPreviewImageAssetId:
          resultPreviewImageAssetRecord?.id ??
          block.data.resultPreviewImageAssetId,
        resultPreviewImageUrl:
          resultPreviewImageAssetRecord?.publicUrl ??
          block.data.resultPreviewImageUrl,
        resultPreviewImageMimeType:
          resultPreviewImageAssetRecord?.mimeType ??
          block.data.resultPreviewImageMimeType,
      },
    };
  }

  private async normalizeSemanticReferenceAssets(
    document: StoredDesignDocument,
    cache: Map<string, StoredAssetRecord>,
    ownerId: string,
  ) {
    const references = document.semanticBrief?.references ?? [];

    if (references.length === 0) {
      return {
        document,
        importedAssets: [] as StoredAssetRecord[],
      };
    }

    const importedAssets: StoredAssetRecord[] = [];
    const normalizedReferences = await Promise.all(
      references.map(async (reference) => {
        if (reference.type !== "image" || !reference.src) {
          return reference;
        }

        if (isInternalAssetUrl(reference.src)) {
          return reference;
        }

        const cacheKey = `semantic-reference:${reference.src}`;
        const cachedAsset = cache.get(cacheKey);
        const storedAsset =
          cachedAsset ??
          (await this.assetService.importAssetFromSource({
            sourceUrl: reference.src,
            fileName: reference.fileName,
            mimeType: reference.mimeType,
            mediaType: "image",
            role: "source",
            ownerId,
            origin: inferImageAssetOrigin(reference.src),
          }));

        cache.set(cacheKey, storedAsset);
        importedAssets.push(storedAsset);

        return {
          ...reference,
          assetId: storedAsset.id,
          src: storedAsset.publicUrl,
          mimeType: storedAsset.mimeType,
          fileName: storedAsset.fileName,
        };
      }),
    );

    return {
      document: {
        ...document,
        semanticBrief: {
          ...document.semanticBrief,
          references: normalizedReferences,
        },
      },
      importedAssets,
    };
  }

  private async normalizeSemanticSlotImageAssets(
    document: StoredDesignDocument,
    cache: Map<string, StoredAssetRecord>,
    ownerId: string,
  ) {
    const slots = document.semanticSlots ?? [];

    if (slots.length === 0) {
      return {
        document,
        importedAssets: [] as StoredAssetRecord[],
      };
    }

    const importedAssets: StoredAssetRecord[] = [];
    const normalizedSlots = await Promise.all(
      slots.map(async (slot) => {
        const isImageSlot =
          slot.slotKind === "image" ||
          slot.contentType === "image" ||
          slot.preferredBlockType === "image";

        if (!isImageSlot || !slot.content || isInternalAssetUrl(slot.content)) {
          return slot;
        }

        const sourceUrl = slot.content;

        if (!sourceUrl.startsWith("data:") && !/^https?:\/\//i.test(sourceUrl)) {
          return slot;
        }

        const cacheKey = `semantic-slot:${sourceUrl}`;
        const cachedAsset = cache.get(cacheKey);
        const storedAsset =
          cachedAsset ??
          (await this.assetService.importAssetFromSource({
            sourceUrl,
            fileName:
              typeof slot.sourceFileName === "string"
                ? slot.sourceFileName
                : undefined,
            mimeType:
              typeof slot.sourceMimeType === "string"
                ? slot.sourceMimeType
                : undefined,
            mediaType: "image",
            role: "source",
            ownerId,
            origin: inferImageAssetOrigin(sourceUrl),
          }));

        cache.set(cacheKey, storedAsset);
        importedAssets.push(storedAsset);

        return {
          ...slot,
          content: storedAsset.publicUrl,
          visualIntent:
            slot.visualIntent === sourceUrl ? storedAsset.publicUrl : slot.visualIntent,
          sourceFileName: storedAsset.fileName,
          sourceMimeType: storedAsset.mimeType,
        };
      }),
    );

    return {
      document: {
        ...document,
        semanticSlots: normalizedSlots,
      },
      importedAssets,
    };
  }

  async normalizeDocumentAssets(
    document: StoredDesignDocument,
    ownerId: string,
  ): Promise<DocumentAssetNormalizationResult> {
    console.log(
      `[documents] normalizeDocumentAssets start documentId=${document.id} blockCount=${document.blocks.length}`,
    );
    const normalizationCache = new Map<string, StoredAssetRecord>();
    const importedAssets: StoredAssetRecord[] = [];
    const normalizedReferenceResult =
      await this.normalizeSemanticReferenceAssets(
        document,
        normalizationCache,
        ownerId,
      );
    importedAssets.push(...normalizedReferenceResult.importedAssets);
    const normalizedSlotResult =
      await this.normalizeSemanticSlotImageAssets(
        normalizedReferenceResult.document,
        normalizationCache,
        ownerId,
      );
    importedAssets.push(...normalizedSlotResult.importedAssets);
    const normalizedBlocks = await Promise.all(
      normalizedSlotResult.document.blocks.map(async (block): Promise<StoredDesignBlock> => {
        try {
          if (block.type === "image") {
            const normalizedBlock = await this.normalizeImageBlockAsset(
              block,
              normalizationCache,
              ownerId,
            );
            const assetId = normalizedBlock.data.asset?.assetId;

            if (assetId) {
              const assetRecord = await this.assetService.getAssetRecord(assetId);

              if (assetRecord) {
                importedAssets.push(assetRecord);
              }
            }

            return normalizedBlock;
          }

          if (block.type === "ai-generation") {
            const normalizedBlock = await this.normalizeAIBlockAssets(
              block,
              normalizationCache,
              ownerId,
            );
            const normalizedAssetIds = [
              normalizedBlock.data.resultAssetId,
              normalizedBlock.data.resultPreviewUrl &&
              normalizedBlock.data.resultPreviewUrl !== normalizedBlock.data.resultImageUrl
                ? normalizedBlock.data.resultPreviewUrl
                : undefined,
              normalizedBlock.data.resultPreviewImageAssetId,
              normalizedBlock.data.resultVideoAssetId,
              normalizedBlock.data.resultPosterAssetId,
            ];

            await Promise.all(
              normalizedAssetIds.map(async (value) => {
                if (!value) {
                  return;
                }

                const assetId = value.startsWith("/api/assets/")
                  ? value.split("/").pop()
                  : value;
                const assetRecord =
                  assetId != null
                    ? await this.assetService.getAssetRecord(assetId)
                    : null;

                if (assetRecord) {
                  importedAssets.push(assetRecord);
                }
              }),
            );

            return normalizedBlock;
          }

          console.log(
            `[documents] normalize skip ${describeBlock(block)} reason=block-type-not-normalized`,
          );
          return block;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown normalization error.";
          console.error(
            `[documents] normalize failed ${describeBlock(block)} error=${message}`,
          );
          throw new Error(
            `Failed to normalize assets for ${block.type} block "${block.name}" (${block.id}). ${message}`,
          );
        }
      }),
    );

    console.log(
      `[documents] normalizeDocumentAssets complete documentId=${document.id} importedAssetCount=${importedAssets.length}`,
    );

    return {
      document: {
        ...document,
        ...normalizedSlotResult.document,
        updatedAt: now(),
        blocks: normalizedBlocks,
      },
      importedAssets,
    };
  }

  async saveDocument(
    documentId: string,
    document: StoredDesignDocument,
    ownerId: string,
  ): Promise<StoredDocumentRecord> {
    if (!isStoredDesignDocument(document)) {
      throw new Error("Document payload is not valid.");
    }

    await this.ensureReady();

    const existingRecord = await this.readStoredDocumentRecord(documentId);

    if (existingRecord?.ownerId && existingRecord.ownerId !== ownerId) {
      throw new Error("You do not have permission to overwrite this document.");
    }

    console.log(
      `[documents] save start documentId=${documentId} existing=${existingRecord != null} blockCount=${document.blocks.length}`,
    );
    const normalizedDocumentResult = await this.normalizeDocumentAssets({
      ...document,
      id: documentId,
      createdAt: existingRecord?.document.createdAt ?? document.createdAt ?? now(),
      updatedAt: now(),
    }, ownerId);
    const timestamp = now();
    const nextRecord: StoredDocumentRecord = {
      id: documentId,
      createdAt: existingRecord?.createdAt ?? timestamp,
      updatedAt: timestamp,
      ownerId,
      visibility: existingRecord?.visibility ?? "private",
      shareSlug: existingRecord?.shareSlug ?? null,
      document: {
        ...normalizedDocumentResult.document,
        id: documentId,
        updatedAt: timestamp,
      },
    };

    console.log(`[documents] writeJsonFile start documentId=${documentId}`);
    await writeJsonFile(this.getDocumentPath(documentId), nextRecord);
    console.log(`[documents] writeJsonFile complete documentId=${documentId}`);
    console.log(
      `[documents] save complete documentId=${documentId} importedAssetCount=${normalizedDocumentResult.importedAssets.length}`,
    );

    return nextRecord;
  }
}
