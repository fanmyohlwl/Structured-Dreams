import { useEffect, useRef, useState } from "react";
import type {
  RecentDocumentsStatus,
  StoredDocumentSummary,
} from "../types";

interface FileMenuProps {
  currentDocumentId: string;
  currentDocumentName: string;
  isAuthenticated: boolean;
  recentDocuments: StoredDocumentSummary[];
  recentDocumentsStatus: RecentDocumentsStatus;
  recentDocumentsError?: string;
  hasLoadedRecentDocuments: boolean;
  recentDocumentsIsRefreshing: boolean;
  isSaving: boolean;
  isLoading: boolean;
  onNewDocument: () => void | Promise<unknown>;
  onSave: () => void | Promise<unknown>;
  onSaveAsNewCopy: () => void | Promise<unknown>;
  onOpenRecent: (documentId: string) => void | Promise<unknown>;
  onRenameCurrentDocument: (name: string) => void | Promise<unknown>;
  onOpenAccountAccess: () => void | Promise<unknown>;
}

const formatRecentLabel = (updatedAt: string) =>
  new Date(updatedAt).toLocaleString();

const formatShortDocumentId = (documentId: string) =>
  documentId.length > 12 ? documentId.slice(0, 8) : documentId;

export function FileMenu({
  currentDocumentId,
  currentDocumentName,
  isAuthenticated,
  recentDocuments,
  recentDocumentsStatus,
  recentDocumentsError,
  hasLoadedRecentDocuments,
  recentDocumentsIsRefreshing,
  isSaving,
  isLoading,
  onNewDocument,
  onSave,
  onSaveAsNewCopy,
  onOpenRecent,
  onRenameCurrentDocument,
  onOpenAccountAccess,
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftDocumentName, setDraftDocumentName] = useState(currentDocumentName);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftDocumentName(currentDocumentName);
  }, [currentDocumentName]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMenuAction = (action: () => void | Promise<unknown>) => {
    setIsOpen(false);
    void action();
  };

  const commitDocumentName = () => {
    const trimmedName = draftDocumentName.trim();

    if (!trimmedName || trimmedName === currentDocumentName) {
      setDraftDocumentName(currentDocumentName);
      return;
    }

    void onRenameCurrentDocument(trimmedName);
  };

  const isBusy = isSaving || isLoading;
  const saveDisabled = isBusy || !isAuthenticated;
  const openRecentDisabled = isBusy || !isAuthenticated;

  return (
    <div className="file-menu" ref={menuRef}>
      <button
        type="button"
        className="secondary-button file-menu__trigger"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        File
      </button>

      {isOpen ? (
        <div className="file-menu__popover" role="menu">
          <div className="file-menu__section">
            <button
              type="button"
              className="file-menu__item"
              disabled={isBusy}
              onClick={() => handleMenuAction(onNewDocument)}
            >
              New Document
            </button>
            <button
              type="button"
              className="file-menu__item"
              disabled={saveDisabled}
              onClick={() => handleMenuAction(onSave)}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="file-menu__item"
              disabled={saveDisabled}
              onClick={() => handleMenuAction(onSaveAsNewCopy)}
            >
              Save As New Copy
            </button>
          </div>

          <div className="file-menu__divider" />

          <div className="file-menu__section">
            <div className="file-menu__section-title">Open Recent</div>

            {!isAuthenticated ? (
              <div className="file-menu__auth-callout">
                <p className="file-menu__empty-copy">
                  Sign in from Personal Center to save documents and access your personal library.
                </p>
                <button
                  type="button"
                  className="file-menu__item"
                  onClick={() => handleMenuAction(onOpenAccountAccess)}
                >
                  Open Personal Center
                </button>
              </div>
            ) : !hasLoadedRecentDocuments &&
              recentDocumentsStatus === "loading" &&
              recentDocuments.length === 0 ? (
              <p className="file-menu__empty-copy">Loading recent documents...</p>
            ) : recentDocumentsStatus === "error" && recentDocuments.length === 0 ? (
              <p className="file-menu__error-copy">
                {recentDocumentsError ?? "Failed to load recent documents."}
              </p>
            ) : recentDocuments.length > 0 ? (
              <div className="file-menu__recent-list">
                {recentDocumentsStatus === "error" && recentDocumentsError ? (
                  <p className="file-menu__warning-copy">{recentDocumentsError}</p>
                ) : null}
                {recentDocumentsIsRefreshing ? (
                  <p className="file-menu__empty-copy">Refreshing recent documents...</p>
                ) : null}
                {recentDocuments.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    className="file-menu__recent-item"
                    disabled={openRecentDisabled}
                    onClick={() =>
                      handleMenuAction(() => onOpenRecent(document.id))
                    }
                  >
                    <strong>{document.name}</strong>
                    <span>
                      {formatShortDocumentId(document.id)} · {formatRecentLabel(document.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {recentDocumentsIsRefreshing ? (
                  <p className="file-menu__empty-copy">Refreshing recent documents...</p>
                ) : null}
                <p className="file-menu__empty-copy">
                  No saved documents yet.
                </p>
              </>
            )}
          </div>

          <div className="file-menu__divider" />

          <div className="file-menu__meta">
            <label className="file-menu__meta-label" htmlFor="file-menu-document-name">
              File Name
            </label>
            <input
              id="file-menu-document-name"
              className="text-input file-menu__meta-input"
              type="text"
              value={draftDocumentName}
              disabled={isBusy}
              onChange={(event) => setDraftDocumentName(event.target.value)}
              onBlur={commitDocumentName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDocumentName();
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftDocumentName(currentDocumentName);
                  event.currentTarget.blur();
                }
              }}
            />
            <span>{currentDocumentId}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
