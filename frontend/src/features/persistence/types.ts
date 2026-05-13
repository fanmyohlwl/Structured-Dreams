import type { DesignDocument } from "../../entities/document/types";

export type StoredDocumentVisibility = "private" | "unlisted" | "public";
export type StoredDocumentPrimaryMediaKind =
  | "image"
  | "video"
  | "mixed"
  | "live"
  | "empty";
export type DocumentSaveStage =
  | "idle"
  | "saving"
  | "normalizing-assets"
  | "writing-document"
  | "refreshing-recent-documents"
  | "save-failed";
export type RecentDocumentsStatus = "loading" | "ready" | "error";

export interface StoredDocumentCapabilities {
  hasAIGeneration: boolean;
  hasLiveBlock: boolean;
  usesLiveSignals: boolean;
  requiresCameraPermission: boolean;
  hasImageMedia: boolean;
  hasVideoMedia: boolean;
}

export interface StoredDocumentRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
  visibility: StoredDocumentVisibility;
  shareSlug: string | null;
  document: DesignDocument;
}

export interface StoredDocumentSummary {
  id: string;
  name: string;
  updatedAt: string;
  visibility: StoredDocumentVisibility;
  primaryMediaKind: StoredDocumentPrimaryMediaKind;
  coverAssetId: string | null;
  coverUrl: string | null;
  capabilities: StoredDocumentCapabilities;
}
