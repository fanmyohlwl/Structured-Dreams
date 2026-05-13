import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import { useElementSize } from "../../../shared/hooks/useElementSize";
import { PanelCard } from "../../../shared/ui/PanelCard";
import { PreviewDocumentRenderer } from "./PreviewDocumentRenderer";
import type { PreviewModel } from "../types";
import type {
  AnimatedExportFormat,
  StaticExportFormat,
} from "../../export/types";

type ExportMenuItem =
  | {
      id: string;
      label: string;
      format: StaticExportFormat;
      kind: "static";
      disabled?: boolean;
      description?: string;
    }
  | {
      id: string;
      label: string;
      format: AnimatedExportFormat;
      kind: "animated";
      disabled?: boolean;
      description?: string;
    };

interface ExportMenuGroup {
  id: string;
  label: string;
  items: ExportMenuItem[];
}

interface LivePreviewPanelProps {
  document: RenderDocumentSnapshot;
  onExportStaticImage: (format: StaticExportFormat) => void | Promise<void>;
  onExportAnimatedMedia?: (
    format: AnimatedExportFormat,
  ) => void | Promise<void>;
  onEnterExhibition: () => void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  exportDisabledReason?: string;
  exportStatusMessage?: string;
}

const exportMenuGroups: ExportMenuGroup[] = [
  {
    id: "image",
    label: "Image",
    items: [
      {
        id: "png",
        label: "PNG",
        format: "png",
        kind: "static",
      },
      {
        id: "jpg",
        label: "JPG",
        format: "jpeg",
        kind: "static",
      },
    ],
  },
  {
    id: "video",
    label: "Video",
    items: [
      {
        id: "webm",
        label: "WebM",
        format: "webm",
        kind: "animated",
      },
      {
        id: "mp4",
        label: "MP4",
        format: "mp4",
        kind: "animated",
      },
      {
        id: "gif",
        label: "GIF",
        format: "gif",
        kind: "animated",
      },
    ],
  },
];

const getFitScale = (
  viewportWidth: number,
  viewportHeight: number,
  documentWidth: number,
  documentHeight: number,
) => {
  if (!viewportWidth || !viewportHeight) {
    return 0.38;
  }

  return Math.min(
    viewportWidth / documentWidth,
    viewportHeight / documentHeight,
    1,
  );
};

export function LivePreviewPanel({
  document,
  onExportStaticImage,
  onExportAnimatedMedia,
  onEnterExhibition,
  isExporting = false,
  exportDisabled = false,
  exportDisabledReason,
  exportStatusMessage,
}: LivePreviewPanelProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(frameRef);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const model = useMemo<PreviewModel>(
    () => ({
      document,
      showGridOverlay: false,
      scale: getFitScale(
        Math.max(viewportSize.width - 8, 0),
        Math.max(viewportSize.height - 8, 0),
        document.canvas.width,
        document.canvas.height,
      ),
    }),
    [document, viewportSize.height, viewportSize.width],
  );

  useEffect(() => {
    if (!isExportMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsExportMenuOpen(false);
      }
    };

    globalThis.document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const handleExportSelection = (item: ExportMenuItem) => {
    if (item.disabled || isExporting || exportDisabled) {
      return;
    }

    setIsExportMenuOpen(false);

    if (item.kind === "static") {
      void onExportStaticImage(item.format);
      return;
    }

    void onExportAnimatedMedia?.(item.format);
  };

  return (
    <aside className="preview-panel">
      <PanelCard
        className="panel-card--stretch"
        title="Live Preview"
        subtitle="Read-only composition preview"
        actions={
          <div className="preview-panel__actions">
            <div className="preview-panel__actions-row">
              <button
                type="button"
                className="primary-button preview-panel__action-button preview-panel__action-button--primary"
                onClick={onEnterExhibition}
              >
                Enter Exhibition
              </button>
              <div
                ref={exportMenuRef}
                className="preview-panel__export-group"
              >
                <button
                  type="button"
                  className="secondary-button preview-panel__action-button preview-panel__action-button--primary"
                  disabled={isExporting || exportDisabled}
                  title={exportDisabled ? exportDisabledReason : undefined}
                  onClick={() => setIsExportMenuOpen((current) => !current)}
                >
                  Export
                </button>

                {isExportMenuOpen ? (
                  <div className="preview-panel__export-menu">
                    {exportMenuGroups.map((group) => (
                      <div
                        key={group.id}
                        className="preview-panel__export-section"
                      >
                        <div className="preview-panel__export-section-title">
                          {group.label}
                        </div>

                        <div className="preview-panel__export-section-items">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="preview-panel__export-option"
                              disabled={isExporting || exportDisabled || item.disabled}
                              onClick={() => handleExportSelection(item)}
                            >
                              <span>{item.label}</span>
                              {item.description ? (
                                <span className="preview-panel__export-option-meta">
                                  {item.description}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        }
      >
        <div className="preview-panel__status-slot">
          {exportStatusMessage ? (
            <p className="preview-panel__status">{exportStatusMessage}</p>
          ) : exportDisabledReason ? (
            <p className="preview-panel__status">{exportDisabledReason}</p>
          ) : null}
        </div>

        <div className="preview-panel__viewport-shell">
          <div ref={frameRef} className="surface-frame surface-frame--preview">
          <PreviewDocumentRenderer model={model} />
          </div>
        </div>
      </PanelCard>
    </aside>
  );
}
