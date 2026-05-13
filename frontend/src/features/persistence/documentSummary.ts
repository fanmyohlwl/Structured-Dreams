import type {
  AIGenerationBlock,
  ImageBlock,
  TextBlock,
} from "../../entities/block/types";
import type { DesignDocument } from "../../entities/document/types";
import type {
  StoredDocumentCapabilities,
  StoredDocumentPrimaryMediaKind,
  StoredDocumentRecord,
  StoredDocumentSummary,
} from "./types";

const hasEnabledFlag = (value: unknown): boolean =>
  typeof value === "object" &&
  value != null &&
  "enabled" in value &&
  (value as { enabled?: unknown }).enabled === true;

const inferMediaTypeFromMimeType = (mimeType?: string | null) => {
  if (!mimeType) {
    return null;
  }

  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }

  if (mimeType.startsWith("video/")) {
    return "video" as const;
  }

  return null;
};

const inferMediaTypeFromUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) {
    return null;
  }

  const normalizedUrl = sourceUrl.split("?")[0]?.toLowerCase() ?? "";

  if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(normalizedUrl)) {
    return "image" as const;
  }

  if (/\.(mp4|webm|mov|m4v|ogg)$/i.test(normalizedUrl)) {
    return "video" as const;
  }

  return null;
};

const inferMediaType = ({
  mimeType,
  sourceUrl,
}: {
  mimeType?: string | null;
  sourceUrl?: string | null;
}) => inferMediaTypeFromMimeType(mimeType) ?? inferMediaTypeFromUrl(sourceUrl);

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

const applyTextCapabilities = (
  capabilities: StoredDocumentCapabilities,
  block: TextBlock,
) => {
  if (hasEnabledFlag(block.data.liveColorMapping)) {
    capabilities.usesLiveSignals = true;
    capabilities.requiresCameraPermission = true;
  }

  if (hasEnabledFlag(block.data.liveTypography)) {
    capabilities.usesLiveSignals = true;
    capabilities.requiresCameraPermission = true;
  }
};

const applyImageCapabilities = (
  capabilities: StoredDocumentCapabilities,
  block: ImageBlock,
  coverCandidates: Array<{
    priority: number;
    zIndex: number;
    coverAssetId: string | null;
    coverUrl: string | null;
  }>,
) => {
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
        zIndex: block.zIndex,
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
};

const applyAICapabilities = (
  capabilities: StoredDocumentCapabilities,
  block: AIGenerationBlock,
  coverCandidates: Array<{
    priority: number;
    zIndex: number;
    coverAssetId: string | null;
    coverUrl: string | null;
  }>,
) => {
  capabilities.hasAIGeneration = true;

  const imageMediaType = inferMediaType({
    mimeType: block.data.resultMimeType,
    sourceUrl: block.data.resultImageUrl ?? block.data.resultPreviewUrl,
  });

  if (imageMediaType === "image") {
    capabilities.hasImageMedia = true;
    coverCandidates.push({
      priority: 1,
      zIndex: block.zIndex,
      coverAssetId: block.data.resultAssetId ?? null,
      coverUrl:
        block.data.resultPreviewUrl ?? block.data.resultImageUrl ?? null,
    });
  } else if (imageMediaType === "video") {
    capabilities.hasVideoMedia = true;
  }

  const videoMediaType = inferMediaType({
    mimeType: block.data.resultVideoMimeType,
    sourceUrl: block.data.resultVideoUrl,
  });

  if (videoMediaType === "video") {
    capabilities.hasVideoMedia = true;
  }

  const aiVideoCoverUrl =
    block.data.resultPosterUrl ?? block.data.resultPreviewImageUrl ?? null;

  if (aiVideoCoverUrl) {
    coverCandidates.push({
      priority: 3,
      zIndex: block.zIndex,
      coverAssetId:
        block.data.resultPosterAssetId ??
        block.data.resultPreviewImageAssetId ??
        null,
      coverUrl: aiVideoCoverUrl,
    });
  }

  if (hasEnabledFlag(block.data.liveColorMapping)) {
    capabilities.usesLiveSignals = true;
    capabilities.requiresCameraPermission = true;
  }
};

const deriveSummaryFromDocument = (
  document: DesignDocument,
  visibility: StoredDocumentSummary["visibility"],
  updatedAt: string,
): StoredDocumentSummary => {
  const capabilities = createEmptyCapabilities();
  const coverCandidates: Array<{
    priority: number;
    zIndex: number;
    coverAssetId: string | null;
    coverUrl: string | null;
  }> = [];

  if (hasEnabledFlag(document.canvas.liveColorMapping)) {
    capabilities.usesLiveSignals = true;
    capabilities.requiresCameraPermission = true;
  }

  for (const block of document.blocks) {
    switch (block.type) {
      case "text":
        applyTextCapabilities(capabilities, block);
        break;
      case "image":
        applyImageCapabilities(capabilities, block, coverCandidates);
        break;
      case "ai-generation":
        applyAICapabilities(capabilities, block, coverCandidates);
        break;
      case "live":
        capabilities.hasLiveBlock = true;
        capabilities.usesLiveSignals = true;
        capabilities.requiresCameraPermission = true;
        break;
    }
  }

  coverCandidates.sort(
    (left, right) => left.priority - right.priority || right.zIndex - left.zIndex,
  );
  const selectedCover = coverCandidates[0];

  return {
    id: document.id,
    name: document.name,
    updatedAt,
    visibility,
    primaryMediaKind: derivePrimaryMediaKind(capabilities),
    coverAssetId: selectedCover?.coverAssetId ?? null,
    coverUrl: selectedCover?.coverUrl ?? null,
    capabilities,
  };
};

export const deriveStoredDocumentSummary = (
  record: StoredDocumentRecord,
): StoredDocumentSummary =>
  deriveSummaryFromDocument(record.document, record.visibility, record.updatedAt);
