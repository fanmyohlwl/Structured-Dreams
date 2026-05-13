export type LegacyStoredAssetKind = "image" | "ai-result" | "ai-preview";
export type StoredAssetMediaType = "image" | "video";
export type StoredAssetRole = "source" | "ai-result" | "preview" | "poster";

export type StoredAssetOrigin =
  | "upload"
  | "data-url"
  | "external-url"
  | "ai-provider";

interface StoredAssetRecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
  mimeType: string;
  fileName: string;
  byteSize: number;
  origin: StoredAssetOrigin;
  sourceUrl: string | null;
  providerId: string | null;
  providerGenerationId: string | null;
  storagePath: string;
  publicUrl: string;
}

export interface LegacyStoredAssetRecord extends StoredAssetRecordBase {
  kind: LegacyStoredAssetKind;
  mediaType?: undefined;
  role?: undefined;
}

export interface StoredAssetRecord extends StoredAssetRecordBase {
  mediaType: StoredAssetMediaType;
  role: StoredAssetRole;
  kind?: LegacyStoredAssetKind;
}

export type StoredAssetRecordInput = StoredAssetRecord | LegacyStoredAssetRecord;

export const mediaTypeFromLegacyStoredAssetKind = (
  kind: LegacyStoredAssetKind,
): StoredAssetMediaType => {
  switch (kind) {
    case "image":
    case "ai-result":
    case "ai-preview":
      return "image";
    default:
      return "image";
  }
};

export const roleFromLegacyStoredAssetKind = (
  kind: LegacyStoredAssetKind,
): StoredAssetRole => {
  switch (kind) {
    case "ai-result":
      return "ai-result";
    case "ai-preview":
      return "preview";
    case "image":
    default:
      return "source";
  }
};

export const legacyStoredAssetKindFromMedia = ({
  mediaType,
  role,
}: {
  mediaType: StoredAssetMediaType;
  role: StoredAssetRole;
}): LegacyStoredAssetKind | undefined => {
  if (mediaType !== "image") {
    return undefined;
  }

  if (role === "ai-result") {
    return "ai-result";
  }

  if (role === "preview") {
    return "ai-preview";
  }

  if (role === "source") {
    return "image";
  }

  return undefined;
};

export const normalizeStoredAssetRecord = (
  record: StoredAssetRecordInput,
): StoredAssetRecord => {
  const mediaType =
    "mediaType" in record && record.mediaType
      ? record.mediaType
      : mediaTypeFromLegacyStoredAssetKind(record.kind);
  const role =
    "role" in record && record.role
      ? record.role
      : roleFromLegacyStoredAssetKind(record.kind);

  return {
    ...record,
    ownerId: "ownerId" in record ? record.ownerId ?? null : null,
    mediaType,
    role,
    kind:
      record.kind ??
      legacyStoredAssetKindFromMedia({
        mediaType,
        role,
      }),
  };
};
