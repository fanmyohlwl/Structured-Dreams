import { useState } from "react";
import type { DesignDocument } from "../../../entities/document/types";
import type {
  CompositionMode,
  SemanticBrief,
  SemanticCompositionFreedom,
  SemanticCopyPolicy,
  SemanticPosterArchetype,
  SemanticReferenceItem,
  SemanticReferenceType,
  SemanticSlotKind,
  SemanticSlot,
} from "../../../entities/semantic/types";
import {
  deriveSemanticSlotKindPatch,
  getSemanticSlotKindLabel,
  getSemanticSlotPurposeLabel,
  inferSemanticSlotKind,
  semanticSlotKindOptions,
  semanticSlotPurposeOptions,
} from "../../../entities/semantic/types";
import type { EditorTool } from "../state/types";
import type {
  AgentProfile,
  LiveArtDirection,
  LiveMappingPatch,
  OrchestrationExecutionState,
  OrchestrationPlan,
  VisualStyleProfile,
} from "../../orchestration/types";
import type {
  SharedLiveCameraDeviceState,
  SharedLiveMomentFrameSummary,
} from "../../live/types";
import {
  isLiveMappingPatchTargetResolved,
  summarizeLiveSignalStatus,
  summarizeActiveLiveMappingRules,
  summarizeLiveMappingPatchTarget,
} from "../../orchestration/liveMappingSummary";
import { PanelCard } from "../../../shared/ui/PanelCard";
import {
  requestLocalFontCatalog,
  type LocalFontCatalogLoadStatus,
} from "../../typography/fontCatalog";

const semanticCompositionFreedomOptions: Array<{
  value: SemanticCompositionFreedom;
  label: string;
}> = [
  { value: "preserve", label: "Preserve Structure" },
  { value: "style-only", label: "Expressive Styling" },
  { value: "layout-remix", label: "Layout Remix" },
  { value: "poster-system", label: "Poster System" },
];

const semanticPosterArchetypeOptions: Array<{
  value: SemanticPosterArchetype;
  label: string;
}> = [
  { value: "oversized-type", label: "Oversized Type" },
  { value: "collage", label: "Collage System" },
  { value: "editorial-portrait", label: "Editorial Portrait" },
  { value: "glitch-portrait", label: "Glitch Portrait" },
  { value: "cinematic-crop", label: "Cinematic Crop" },
  { value: "halftone-specimen", label: "Halftone Specimen" },
  { value: "image-led-minimal", label: "Image-led Minimal" },
  { value: "custom", label: "Custom" },
];

const semanticCopyPolicyOptions: Array<{
  value: SemanticCopyPolicy;
  label: string;
}> = [
  { value: "preserve", label: "Preserve Copy" },
  { value: "compress", label: "Compress Secondary Copy" },
  { value: "editorialize", label: "Editorialize Tone" },
];

const structuredDreamsExhibitionBriefPreset: Partial<SemanticBrief> = {
  brandName: "Structured Dreams",
  campaignGoal:
    "Invite exhibition visitors to enter their name, be photographed by the live camera, and experience how their chosen identity and captured presence can drive visible iterations inside the tool.",
  audience:
    "Exhibition visitors who become temporary participants in a live, personal, data-aware design process.",
  toneKeywords: [
    "participatory",
    "dreamlike",
    "experimental",
    "reflective",
    "data-aware",
    "live",
    "iterative",
  ],
  mustIncludeCopy: [
    "Structured Dreams",
    "Enter your name",
    "Become the next iteration",
  ],
  avoidKeywords: [
    "surveillance panic",
    "biometric database",
    "generic stock portrait",
    "dystopian alarmism",
    "privacy-invasive language",
  ],
  designNotes:
    "Exhibition preset: treat the typed name and captured live moment as consented, temporary audience inputs. Each generation round should visibly shift typography, image treatment, color, rhythm, or atmosphere while preserving the brand and protected semantic structure. The result should feel like personal information becoming a structured visual dream, not a generic photo booth.",
  allowAIGeneration: true,
  compositionFreedom: "style-only",
  posterArchetype: "glitch-portrait",
  copyPolicy: "editorialize",
};

export interface SemanticLiveCaptureState {
  status:
    | "idle"
    | "capturing"
    | "captured"
    | "directing"
    | "applying"
    | "regenerating"
    | "applied"
    | "failed";
  liveCaptureId?: string;
  capturedAt?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  frame?: SharedLiveMomentFrameSummary | null;
  liveArtDirection?: LiveArtDirection;
  liveMappingPatches?: LiveMappingPatch[];
  liveDirectionSummary?: string;
  liveDirectionWarnings?: string[];
  autoCaptureReason?: string;
  errorMessage?: string;
}

interface SemanticComposeSidebarProps {
  document: DesignDocument;
  activeTool: EditorTool;
  selectedSlot?: SemanticSlot;
  previewPlan?: OrchestrationPlan | null;
  orchestrationExecution: OrchestrationExecutionState;
  semanticLiveDirectionEnabled: boolean;
  semanticLiveImageRegenerationEnabled: boolean;
  semanticLivePortraitFusionEnabled: boolean;
  semanticLiveCameraDeviceState: SharedLiveCameraDeviceState;
  semanticLiveAutoCaptureEnabled: boolean;
  semanticLiveAutoCaptureCooldownSeconds: number;
  semanticLiveAutoCaptureSensitivity: "low" | "medium" | "high";
  semanticLiveAutoCaptureLastReason?: string;
  semanticLiveCapture: SemanticLiveCaptureState;
  activeAgentProfile?: AgentProfile | null;
  activeVisualStyleProfiles?: VisualStyleProfile[];
  primaryActionLabel: string;
  onSetCompositionMode: (mode: CompositionMode) => void;
  onSetTool: (tool: EditorTool) => void;
  onUpdateCanvas: (patch: Partial<DesignDocument["canvas"]>) => void;
  onUpdateSemanticBrief: (patch: Partial<SemanticBrief>) => void;
  onSelectSemanticSlot: (slotId: string) => void;
  onUpdateSemanticSlot: (slotId: string, patch: Partial<SemanticSlot>) => void;
  onDeleteSemanticSlot: (slotId: string) => void;
  onMoveSemanticSlotLayer: (
    slotId: string,
    direction: "up" | "down",
  ) => void;
  onGenerateOutput: () => void | Promise<void>;
  onRefreshSelectedOutput: () => void | Promise<void>;
  onApplyLayoutRemix: () => void | Promise<void>;
  onDismissLayoutRemix: () => void | Promise<void>;
  onApplyDecorativeOps: (opIds?: string[]) => void | Promise<void>;
  onDismissDecorativeOps: () => void | Promise<void>;
  onRetryGenerationJob: (jobId: string) => void | Promise<void>;
  onToggleSemanticLiveDirection: (enabled: boolean) => void;
  onToggleSemanticLiveImageRegeneration: (enabled: boolean) => void;
  onToggleSemanticLivePortraitFusion: (enabled: boolean) => void;
  onSelectSemanticLiveCameraDevice: (deviceId?: string) => void;
  onRefreshSemanticLiveCameraDevices: () => void | Promise<void>;
  onToggleSemanticLiveAutoCapture: (enabled: boolean) => void;
  onUpdateSemanticLiveAutoCaptureCooldown: (seconds: number) => void;
  onUpdateSemanticLiveAutoCaptureSensitivity: (
    sensitivity: "low" | "medium" | "high",
  ) => void;
  onCaptureLiveMoment: () => void | Promise<void>;
  onReapplyLiveDirection: () => void | Promise<void>;
  onToggleAutoRefresh: (enabled: boolean) => void;
  onUpdateAutoRefreshInterval: (intervalMs: number) => void;
}

const toCommaSeparatedValue = (items: string[] | undefined) =>
  (items ?? []).join(", ");

const isTechnicalOrchestrationWarning = (item: string) => {
  const normalized = item.trim().toLowerCase();

  return [
    "no final provider image prompts are included",
    "no locked blocks or locked slots were modified",
    "canvas dimensions, grid, required copy",
  ].some((pattern) => normalized.includes(pattern));
};

const uniqueStrings = (items: string[]) =>
  [
    ...new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !isTechnicalOrchestrationWarning(item)),
    ),
  ];

const automaticSlotNames = new Set(
  semanticSlotKindOptions.map((option) => option.label),
);

const shouldUseAutomaticSlotName = (name: string) =>
  !name.trim() || automaticSlotNames.has(name.trim());

const createReferenceId = () =>
  `semantic_ref_${
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }`;

const createReferenceItem = (
  type: SemanticReferenceType,
  patch: Partial<SemanticReferenceItem> = {},
): SemanticReferenceItem => ({
  id: createReferenceId(),
  type,
  title:
    patch.title ??
    (type === "url"
      ? "Web Reference"
      : type === "image"
        ? "Image Reference"
        : "Brand Note"),
  description: patch.description ?? "",
  url: patch.url,
  assetId: patch.assetId,
  src: patch.src,
  mimeType: patch.mimeType,
  fileName: patch.fileName,
  createdAt: new Date().toISOString(),
});

const readImageFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Image upload did not produce a data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Image upload failed."));
    };
    reader.readAsDataURL(file);
  });

const summarizeReference = (reference: SemanticReferenceItem) => {
  const summary =
    reference.description || reference.url || reference.fileName || reference.src || "";

  if (!summary) {
    return "No description yet";
  }

  return summary.length > 88 ? `${summary.slice(0, 85)}...` : summary;
};

const summarizeSlotContent = (slot: SemanticSlot) => {
  const content = slot.content.trim();

  if (!content) {
    return "No content yet";
  }

  return content.length > 72 ? `${content.slice(0, 69)}...` : content;
};

const getSlotContentLabel = (slotKind: SemanticSlotKind) => {
  if (slotKind === "image") {
    return "Image Source";
  }

  if (slotKind === "ai-image") {
    return "Image Prompt";
  }

  if (slotKind === "ai-video") {
    return "Video Prompt";
  }

  if (slotKind === "live") {
    return "Live Intent";
  }

  return "Text Content";
};

const getSlotContentPlaceholder = (slotKind: SemanticSlotKind) => {
  if (slotKind === "image") {
    return "Paste an image URL. Asset upload can be connected later.";
  }

  if (slotKind === "ai-image") {
    return "Describe the image the AI should create.";
  }

  if (slotKind === "ai-video") {
    return "Describe the video direction for future AI video generation.";
  }

  if (slotKind === "live") {
    return "Describe how the live area should behave.";
  }

  return "Write the text this area should contain.";
};

const getExecutionPhaseLabel = (
  execution: OrchestrationExecutionState,
) => {
  switch (execution.phase) {
    case "planning-layout":
      return "Planning layout";
    case "applying-layout":
      return "Applying layout";
    case "generating-images":
      return `Generating images ${
        execution.queue.filter((item) => item.status === "completed").length
      }/${execution.queue.length}`;
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "idle":
    default:
      return "Idle";
  }
};

export function SemanticComposeSidebar({
  document,
  activeTool,
  selectedSlot,
  previewPlan,
  orchestrationExecution,
  semanticLiveDirectionEnabled,
  semanticLiveImageRegenerationEnabled,
  semanticLivePortraitFusionEnabled,
  semanticLiveCameraDeviceState,
  semanticLiveAutoCaptureEnabled,
  semanticLiveAutoCaptureCooldownSeconds,
  semanticLiveAutoCaptureSensitivity,
  semanticLiveAutoCaptureLastReason,
  semanticLiveCapture,
  activeAgentProfile,
  activeVisualStyleProfiles = [],
  primaryActionLabel,
  onSetCompositionMode,
  onSetTool,
  onUpdateCanvas,
  onUpdateSemanticBrief,
  onSelectSemanticSlot,
  onUpdateSemanticSlot,
  onDeleteSemanticSlot,
  onMoveSemanticSlotLayer,
  onGenerateOutput,
  onRefreshSelectedOutput,
  onApplyLayoutRemix,
  onDismissLayoutRemix,
  onApplyDecorativeOps,
  onDismissDecorativeOps,
  onRetryGenerationJob,
  onToggleSemanticLiveDirection,
  onToggleSemanticLiveImageRegeneration,
  onToggleSemanticLivePortraitFusion,
  onSelectSemanticLiveCameraDevice,
  onRefreshSemanticLiveCameraDevices,
  onToggleSemanticLiveAutoCapture,
  onUpdateSemanticLiveAutoCaptureCooldown,
  onUpdateSemanticLiveAutoCaptureSensitivity,
  onCaptureLiveMoment,
  onReapplyLiveDirection,
  onToggleAutoRefresh,
  onUpdateAutoRefreshInterval,
}: SemanticComposeSidebarProps) {
  const [localFontLoadStatus, setLocalFontLoadStatus] =
    useState<LocalFontCatalogLoadStatus>("idle");
  const [localFontStatusMessage, setLocalFontStatusMessage] = useState<string>();
  const [selectedDecorativeOpIds, setSelectedDecorativeOpIds] = useState<string[]>([]);
  const brief = document.semanticBrief;
  const orchestrationState = document.orchestrationState;
  const semanticSlots = document.semanticSlots ?? [];
  const sortedSemanticSlots = semanticSlots
    .slice()
    .sort((left, right) => right.priority - left.priority);
  const references = brief?.references ?? [];
  const selectedSlotKind = selectedSlot
    ? inferSemanticSlotKind(selectedSlot)
    : undefined;
  const visualFlexibilityEnabled =
    brief?.compositionFreedom === "layout-remix" ||
    brief?.compositionFreedom === "poster-system";
  const decorativeOps = previewPlan?.decorativeOps ?? [];
  const displayedPlanWarnings = uniqueStrings([
    ...(previewPlan?.warnings ?? []),
    ...orchestrationExecution.warnings,
  ]);
  const rawExecutionSummary =
    orchestrationExecution.summary ?? orchestrationState?.lastSummary;
  const hasExecutionFailureContext =
    Boolean(orchestrationExecution.errorMessage ?? orchestrationState?.lastError) ||
    orchestrationExecution.phase === "failed" ||
    orchestrationExecution.queue.some((item) => item.status === "failed");
  const isDuplicatePlanSummary =
    Boolean(rawExecutionSummary && previewPlan?.summary) &&
    rawExecutionSummary?.trim() === previewPlan?.summary.trim();
  const displayedExecutionSummary =
    rawExecutionSummary && (!isDuplicatePlanSummary || hasExecutionFailureContext)
      ? rawExecutionSummary
      : undefined;
  const activeLiveMappingRules = summarizeActiveLiveMappingRules(document);
  const activeVisualStyleLabel =
    activeVisualStyleProfiles.length > 0
      ? activeVisualStyleProfiles.map((profile) => profile.title).join(", ")
      : "None";

  const updateReference = (
    referenceId: string,
    patch: Partial<SemanticReferenceItem>,
  ) => {
    onUpdateSemanticBrief({
      references: references.map((reference) =>
        reference.id === referenceId
          ? {
              ...reference,
              ...patch,
            }
          : reference,
      ),
    });
  };

  const deleteReference = (referenceId: string) => {
    onUpdateSemanticBrief({
      references: references.filter((reference) => reference.id !== referenceId),
    });
  };

  const addReference = (type: SemanticReferenceType) => {
    onUpdateSemanticBrief({
      references: [...references, createReferenceItem(type)],
    });
  };

  const handleImageReferenceUpload = (file: File | undefined) => {
    if (!file) {
      return;
    }

    void readImageFileAsDataUrl(file).then((src) => {
      onUpdateSemanticBrief({
        references: [
          ...references,
          createReferenceItem("image", {
            title: file.name.replace(/\.[^.]+$/, "") || "Image Reference",
            src,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
          }),
        ],
      });
    });
  };

  const handleReplaceImageReference = (
    referenceId: string,
    file: File | undefined,
  ) => {
    if (!file) {
      return;
    }

    void readImageFileAsDataUrl(file).then((src) => {
      updateReference(referenceId, {
        title: file.name.replace(/\.[^.]+$/, "") || "Image Reference",
        src,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
      });
    });
  };

  const handleImageSlotUpload = (
    slot: SemanticSlot,
    file: File | undefined,
  ) => {
    if (!file) {
      return;
    }

    void readImageFileAsDataUrl(file).then((src) => {
      onUpdateSemanticSlot(slot.id, {
        content: src,
        visualIntent: src,
        sourceFileName: file.name,
        sourceMimeType: file.type || "application/octet-stream",
      });
    });
  };

  const handleLoadLocalFontsForOrchestration = () => {
    setLocalFontLoadStatus("loading");
    setLocalFontStatusMessage(undefined);

    void requestLocalFontCatalog().then((result) => {
      setLocalFontLoadStatus(result.status);
      setLocalFontStatusMessage(result.message);
    });
  };

  return (
    <aside className="editor-sidebar">
      <PanelCard
        title="Compose Mode"
        subtitle="Switch between precise block editing and semantic layout direction"
      >
        <div className="toolbar-grid">
          <button
            type="button"
            className={`toolbar-button toolbar-button--wide${
              document.compositionMode === "manual" ? " is-active" : ""
            }`}
            onClick={() => onSetCompositionMode("manual")}
          >
            Manual
          </button>
          <button
            type="button"
            className={`toolbar-button toolbar-button--wide${
              document.compositionMode === "semantic" ? " is-active" : ""
            }`}
            onClick={() => onSetCompositionMode("semantic")}
          >
            Semantic Compose
          </button>
        </div>
      </PanelCard>

      <PanelCard
        title="Canvas"
        subtitle="Keep the semantic output background aligned with the final work"
      >
        <label className="field">
          <span>Canvas Color</span>
          <div className="color-input-row">
            <input
              type="color"
              value={document.canvas.backgroundColor}
              onChange={(event) =>
                onUpdateCanvas({ backgroundColor: event.target.value })
              }
              aria-label="Canvas background color"
            />
            <input
              className="text-input"
              value={document.canvas.backgroundColor}
              onChange={(event) =>
                onUpdateCanvas({ backgroundColor: event.target.value })
              }
            />
          </div>
        </label>
      </PanelCard>

      <PanelCard
        title="Semantic Brief"
        subtitle="Describe the campaign intent and let the AI art director build the layout"
        actions={
          <button
            type="button"
            className="secondary-button secondary-button--compact"
            title="Apply the Structured Dreams exhibition brief preset"
            onClick={() =>
              onUpdateSemanticBrief(structuredDreamsExhibitionBriefPreset)
            }
          >
            Structured Dreams
          </button>
        }
      >
        <label className="field">
          <span>Brand Name</span>
          <input
            className="text-input"
            value={brief?.brandName ?? ""}
            onChange={(event) =>
              onUpdateSemanticBrief({ brandName: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Campaign Goal</span>
          <textarea
            className="text-input text-input--multiline"
            rows={3}
            value={brief?.campaignGoal ?? ""}
            onChange={(event) =>
              onUpdateSemanticBrief({ campaignGoal: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Audience</span>
          <input
            className="text-input"
            value={brief?.audience ?? ""}
            onChange={(event) =>
              onUpdateSemanticBrief({ audience: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Tone Keywords</span>
          <input
            className="text-input"
            value={toCommaSeparatedValue(brief?.toneKeywords)}
            onChange={(event) =>
              onUpdateSemanticBrief({
                toneKeywords: event.target.value
                  .split(",")
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
          />
          <small className="field-hint">
            Comma-separated words like editorial, playful, luxury, tech.
          </small>
        </label>
        <label className="field">
          <span>Visual Freedom</span>
          <select
            className="select-input"
            value={brief?.compositionFreedom ?? "preserve"}
            onChange={(event) =>
              onUpdateSemanticBrief({
                compositionFreedom: event.target
                  .value as SemanticCompositionFreedom,
              })
            }
          >
            {semanticCompositionFreedomOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Preserve and Expressive Styling keep the structure fixed. Layout
            Remix and Poster System can propose structure changes, but only for
            slots where you explicitly enable Visual Flexibility and then apply
            the proposal.
          </small>
        </label>
        <label className="field">
          <span>Poster Direction</span>
          <select
            className="select-input"
            value={brief?.posterArchetype ?? "custom"}
            onChange={(event) =>
              onUpdateSemanticBrief({
                posterArchetype: event.target.value as SemanticPosterArchetype,
              })
            }
          >
            {semanticPosterArchetypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Copy Policy</span>
          <select
            className="select-input"
            value={brief?.copyPolicy ?? "preserve"}
            onChange={(event) =>
              onUpdateSemanticBrief({
                copyPolicy: event.target.value as SemanticCopyPolicy,
              })
            }
          >
            {semanticCopyPolicyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Copy policy guides tone and compression only; it does not let the AI
            move text to a different slot.
          </small>
        </label>
        <label className="field">
          <span>Must Include Copy</span>
          <textarea
            className="text-input text-input--multiline"
            rows={3}
            value={(brief?.mustIncludeCopy ?? []).join("\n")}
            onChange={(event) =>
              onUpdateSemanticBrief({
                mustIncludeCopy: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label className="field">
          <span>Avoid Keywords</span>
          <input
            className="text-input"
            value={toCommaSeparatedValue(brief?.avoidKeywords)}
            onChange={(event) =>
              onUpdateSemanticBrief({
                avoidKeywords: event.target.value
                  .split(",")
                  .map((keyword) => keyword.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label className="field">
          <span>Design Notes</span>
          <textarea
            className="text-input text-input--multiline"
            rows={3}
            value={brief?.designNotes ?? ""}
            onChange={(event) =>
              onUpdateSemanticBrief({ designNotes: event.target.value })
            }
          />
        </label>
        <label className="toggle-field">
          <span>Allow AI Generation</span>
          <input
            type="checkbox"
            checked={brief?.allowAIGeneration ?? true}
            onChange={(event) =>
              onUpdateSemanticBrief({ allowAIGeneration: event.target.checked })
            }
          />
        </label>
      </PanelCard>

      <PanelCard
        title="Reference Info"
        subtitle="Add brand notes, URLs, and visual references for the AI art director"
      >
        <div className="semantic-reference-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => addReference("url")}
          >
            Add URL
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => addReference("note")}
          >
            Add Note
          </button>
          <label className="secondary-button semantic-reference-upload">
            Upload Image
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                handleImageReferenceUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="semantic-reference-list">
          {references.length === 0 ? (
            <p className="empty-copy">
              Add a brand note, campaign URL, or reference image to guide layout
              and prompt planning.
            </p>
          ) : (
            references.map((reference) => (
              <details
                key={reference.id}
                className="semantic-reference-item"
                open
              >
                <summary className="semantic-reference-item__summary">
                  <span>{reference.type}</span>
                  <strong>{reference.title || "Untitled reference"}</strong>
                  <small>{summarizeReference(reference)}</small>
                </summary>

                <div className="semantic-reference-item__body">
                  <label className="field">
                    <span>Title</span>
                    <input
                      className="text-input"
                      value={reference.title}
                      onChange={(event) =>
                        updateReference(reference.id, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>

                  {reference.type === "url" ? (
                    <label className="field">
                      <span>URL</span>
                      <input
                        className="text-input"
                        value={reference.url ?? ""}
                        placeholder="https://example.com/brand-page"
                        onChange={(event) =>
                          updateReference(reference.id, {
                            url: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}

                  {reference.type === "image" && reference.src ? (
                    <div className="semantic-reference-item__preview">
                      <img src={reference.src} alt={reference.title} />
                      <small>{reference.fileName ?? reference.mimeType}</small>
                    </div>
                  ) : null}

                  {reference.type === "image" ? (
                    <label className="secondary-button semantic-reference-upload">
                      Replace Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          handleReplaceImageReference(
                            reference.id,
                            event.target.files?.[0],
                          );
                          event.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}

                  <label className="field">
                    <span>
                      {reference.type === "note" ? "Note" : "Description"}
                    </span>
                    <textarea
                      className="text-input text-input--multiline"
                      rows={reference.type === "note" ? 4 : 3}
                      value={reference.description}
                      placeholder={
                        reference.type === "image"
                          ? "Describe the visual style, color, or brand cues in this image."
                          : "Add context the AI art director should consider."
                      }
                      onChange={(event) =>
                        updateReference(reference.id, {
                          description: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => deleteReference(reference.id)}
                  >
                    Delete Reference
                  </button>
                </div>
              </details>
            ))
          )}
        </div>
      </PanelCard>

      <PanelCard
        title="Semantic Slots"
        subtitle="Define where information and adaptive media should live on the grid"
      >
        <div className="panel-inline-actions">
          <button
            type="button"
            className={`secondary-button${
              activeTool === "add-semantic-slot" ? " is-active" : ""
            }`}
            onClick={() => onSetTool("add-semantic-slot")}
          >
            Add Slot
          </button>
          <span className="empty-copy">
            Click the grid to place a semantic slot.
          </span>
        </div>

        <div className="semantic-slot-list">
          {semanticSlots.length === 0 ? (
            <p className="empty-copy">
              No semantic slots yet. Add a headline, hero image, or live visual
              slot on the grid.
            </p>
          ) : (
            sortedSemanticSlots.map((slot, index) => (
              <div
                key={slot.id}
                className={`semantic-slot-list__item${
                  selectedSlot?.id === slot.id ? " is-selected" : ""
                }`}
              >
                <button
                  type="button"
                  className="semantic-slot-list__content"
                  onClick={() => onSelectSemanticSlot(slot.id)}
                >
                  <strong>{slot.name || getSemanticSlotPurposeLabel(slot.role)}</strong>
                  <span>
                    {getSemanticSlotKindLabel(inferSemanticSlotKind(slot))} •{" "}
                    {summarizeSlotContent(slot)}
                  </span>
                </button>
                <div className="semantic-slot-list__layer-actions">
                  <button
                    type="button"
                    className="secondary-button secondary-button--compact"
                    disabled={index === 0}
                    onClick={() => onMoveSemanticSlotLayer(slot.id, "up")}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="secondary-button secondary-button--compact"
                    disabled={index === sortedSemanticSlots.length - 1}
                    onClick={() => onMoveSemanticSlotLayer(slot.id, "down")}
                  >
                    Down
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedSlot && selectedSlotKind ? (
          <div className="inspector-form semantic-slot-editor">
            <label className="field">
              <span>Block Type</span>
              <select
                className="select-input"
                value={selectedSlotKind}
                onChange={(event) => {
                  const nextSlotKind = event.target.value as SemanticSlotKind;
                  const nextName = getSemanticSlotKindLabel(nextSlotKind);

                  onUpdateSemanticSlot(selectedSlot.id, {
                    ...deriveSemanticSlotKindPatch(nextSlotKind),
                    ...(shouldUseAutomaticSlotName(selectedSlot.name)
                      ? { name: nextName }
                      : undefined),
                  });
                }}
              >
                {semanticSlotKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Purpose</span>
              <select
                className="select-input"
                value={selectedSlot.role}
                onChange={(event) =>
                  onUpdateSemanticSlot(selectedSlot.id, {
                    role: event.target.value as SemanticSlot["role"],
                  })
                }
              >
                {semanticSlotPurposeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{getSlotContentLabel(selectedSlotKind)}</span>
              <textarea
                className="text-input text-input--multiline"
                rows={selectedSlotKind === "image" ? 2 : 4}
                placeholder={getSlotContentPlaceholder(selectedSlotKind)}
                value={selectedSlot.content}
                onChange={(event) =>
                  onUpdateSemanticSlot(selectedSlot.id, {
                    content: event.target.value,
                    visualIntent: event.target.value,
                  })
                }
              />
              {selectedSlotKind === "image" ? (
                <>
                  {selectedSlot.content ? (
                    <div className="semantic-reference-item__preview">
                      <img
                        src={selectedSlot.content}
                        alt={selectedSlot.sourceFileName ?? selectedSlot.name}
                      />
                      <small>
                        {selectedSlot.sourceFileName ??
                          selectedSlot.sourceMimeType ??
                          "Image source"}
                      </small>
                    </div>
                  ) : null}
                  <div className="field-actions">
                    <label className="secondary-button semantic-reference-upload">
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          handleImageSlotUpload(
                            selectedSlot,
                            event.target.files?.[0],
                          );
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <small className="field-hint">
                    Use an image URL or upload a file for this image slot.
                    Reference Info remains separate context for the AI Art Director.
                  </small>
                </>
              ) : null}
            </label>
              {visualFlexibilityEnabled ? (
              <div className="semantic-slot-flexibility">
                <strong>Visual Flexibility</strong>
                <small>
                  These permissions let AI propose visual remix changes only
                  after you enable Layout Remix or Poster System.
                </small>
                <label className="toggle-field">
                  <span>Keep this required</span>
                  <input
                    type="checkbox"
                    checked={selectedSlot.required ?? false}
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        required: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-field">
                  <span>Allow AI to move</span>
                  <input
                    type="checkbox"
                    checked={selectedSlot.canMove ?? false}
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        canMove: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-field">
                  <span>Allow AI to resize</span>
                  <input
                    type="checkbox"
                    checked={selectedSlot.canResize ?? false}
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        canResize: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-field">
                  <span>Allow AI to rotate</span>
                  <input
                    type="checkbox"
                    checked={selectedSlot.canRotate ?? false}
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        canRotate: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-field">
                  <span>Allow overlap/crop</span>
                  <input
                    type="checkbox"
                    checked={
                      (selectedSlot.canOverlap ?? false) ||
                      (selectedSlot.canCrop ?? false)
                    }
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        canOverlap: event.target.checked,
                        canCrop: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="toggle-field">
                  <span>Allow decorative duplicates</span>
                  <input
                    type="checkbox"
                    checked={selectedSlot.canDuplicate ?? false}
                    onChange={(event) =>
                      onUpdateSemanticSlot(selectedSlot.id, {
                        canDuplicate: event.target.checked,
                      })
                    }
                  />
                </label>
              </div>
              ) : null}
            <details className="semantic-slot-advanced">
              <summary>Advanced</summary>
              <label className="field">
                <span>Slot Name</span>
                <input
                  className="text-input"
                  value={selectedSlot.name}
                  onChange={(event) =>
                    onUpdateSemanticSlot(selectedSlot.id, {
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="toggle-field">
                <span>Lock Slot</span>
                <input
                  type="checkbox"
                  checked={selectedSlot.lockedByUser}
                  onChange={(event) =>
                    onUpdateSemanticSlot(selectedSlot.id, {
                      lockedByUser: event.target.checked,
                    })
                  }
                />
              </label>
              <label className="toggle-field">
                <span>Hide Slot</span>
                <input
                  type="checkbox"
                  checked={selectedSlot.hidden}
                  onChange={(event) =>
                    onUpdateSemanticSlot(selectedSlot.id, {
                      hidden: event.target.checked,
                    })
                  }
                />
              </label>
            </details>
            <button
              type="button"
              className="danger-button"
              onClick={() => onDeleteSemanticSlot(selectedSlot.id)}
            >
              Delete Slot
            </button>
          </div>
        ) : null}
      </PanelCard>

      <PanelCard
        title="Semantic Live Direction"
        subtitle="Capture the room, apply live behavior, and optionally regenerate AI visuals"
      >
        <label className="toggle-field">
          <span>Enable Semantic Live Direction</span>
          <input
            type="checkbox"
            checked={semanticLiveDirectionEnabled}
            onChange={(event) =>
              onToggleSemanticLiveDirection(event.target.checked)
            }
          />
        </label>

        <label className="field">
          <span>Camera Source</span>
          <select
            className="select-input"
            value={semanticLiveCameraDeviceState.selectedDeviceId ?? ""}
            disabled={!semanticLiveDirectionEnabled}
            onChange={(event) =>
              onSelectSemanticLiveCameraDevice(event.target.value || undefined)
            }
          >
            <option value="">Default Camera</option>
            {semanticLiveCameraDeviceState.availableVideoDevices.map(
              (device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="panel-inline-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!semanticLiveDirectionEnabled}
            onClick={() => {
              void onRefreshSemanticLiveCameraDevices();
            }}
          >
            Refresh Cameras
          </button>
        </div>

        <label className="toggle-field">
          <span>Auto Capture Live Changes</span>
          <input
            type="checkbox"
            checked={semanticLiveAutoCaptureEnabled}
            disabled={!semanticLiveDirectionEnabled}
            onChange={(event) =>
              onToggleSemanticLiveAutoCapture(event.target.checked)
            }
          />
        </label>
        <div className="semantic-live-auto-settings">
          <label className="field">
            <span>Cooldown Seconds</span>
            <input
              className="number-input"
              type="number"
              min={8}
              step={1}
              value={semanticLiveAutoCaptureCooldownSeconds}
              disabled={!semanticLiveDirectionEnabled || !semanticLiveAutoCaptureEnabled}
              onChange={(event) =>
                onUpdateSemanticLiveAutoCaptureCooldown(
                  Math.max(8, Number(event.target.value) || 12),
                )
              }
            />
          </label>
          <label className="field">
            <span>Trigger Sensitivity</span>
            <select
              className="select-input"
              value={semanticLiveAutoCaptureSensitivity}
              disabled={!semanticLiveDirectionEnabled || !semanticLiveAutoCaptureEnabled}
              onChange={(event) =>
                onUpdateSemanticLiveAutoCaptureSensitivity(
                  event.target.value as "low" | "medium" | "high",
                )
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        {semanticLiveAutoCaptureLastReason ? (
          <small className="field-hint">
            Last auto capture: {semanticLiveAutoCaptureLastReason}
          </small>
        ) : null}

        <label className="toggle-field">
          <span>Regenerate AI Images from Live Moment</span>
          <input
            type="checkbox"
            checked={semanticLiveImageRegenerationEnabled}
            onChange={(event) =>
              onToggleSemanticLiveImageRegeneration(event.target.checked)
            }
          />
        </label>
        <small className="field-hint">
          Mapping mode is fast and changes live behavior only. Regenerate mode is
          slower and uses the captured camera frame plus the previous AI image as
          references.
        </small>

        {semanticLiveImageRegenerationEnabled ? (
          <>
            <label className="toggle-field">
              <span>Fuse Captured Portrait Into Image</span>
              <input
                type="checkbox"
                checked={semanticLivePortraitFusionEnabled}
                onChange={(event) =>
                  onToggleSemanticLivePortraitFusion(event.target.checked)
                }
              />
            </label>
            <small className="field-hint">
              Off: uses the room, expression, motion, and atmosphere as art
              direction; avoids copying the captured face. On: allows the
              captured person/portrait to become a visual reference.
            </small>
          </>
        ) : null}

        <div className="panel-inline-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={
              !semanticLiveDirectionEnabled ||
              semanticLiveCapture.status === "capturing" ||
              semanticLiveCapture.status === "directing" ||
              semanticLiveCapture.status === "applying" ||
              semanticLiveCapture.status === "regenerating"
            }
            onClick={() => {
              void onCaptureLiveMoment();
            }}
          >
            {semanticLiveCapture.status === "capturing"
              ? "Capturing..."
              : semanticLiveCapture.status === "directing"
                ? "Directing..."
                : semanticLiveCapture.status === "applying"
                  ? "Applying..."
                : semanticLiveCapture.status === "regenerating"
                  ? "Regenerating..."
              : "Capture & Direct Live Moment"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={
              !semanticLiveDirectionEnabled ||
              orchestrationExecution.isRunning ||
              !(semanticLiveCapture.liveMappingPatches?.length)
            }
            onClick={() => {
              void onReapplyLiveDirection();
            }}
          >
            Reapply Last Direction
          </button>
        </div>

        <div className="semantic-live-capture-status">
          {!semanticLiveDirectionEnabled ? (
            <small className="field-hint">
              Turn this on to start the shared camera even when the document has no
              live block.
            </small>
          ) : null}

          {semanticLiveCapture.status === "idle" &&
          semanticLiveDirectionEnabled ? (
            <small className="field-hint">
              Camera is available for manual captures. Capture will ask the AI
              Art Director for live mapping direction. Image regeneration only
              runs when the toggle above is enabled.
            </small>
          ) : null}

          {semanticLiveCapture.status === "captured" ||
          semanticLiveCapture.status === "directing" ||
          semanticLiveCapture.status === "applying" ||
          semanticLiveCapture.status === "regenerating" ||
          semanticLiveCapture.status === "applied" ? (
            <>
              {semanticLiveCapture.dataUrl ? (
                <img
                  className="semantic-live-capture-status__image"
                  src={semanticLiveCapture.dataUrl}
                  alt="Captured semantic live moment"
                />
              ) : null}
              <strong>
                Captured{" "}
                {semanticLiveCapture.capturedAt
                  ? new Date(semanticLiveCapture.capturedAt).toLocaleTimeString()
                  : "just now"}
              </strong>
              {semanticLiveCapture.autoCaptureReason ? (
                <small>
                  Auto capture reason: {semanticLiveCapture.autoCaptureReason}
                </small>
              ) : null}
              <small>
                JPEG {semanticLiveCapture.width}×{semanticLiveCapture.height}
              </small>
              {semanticLiveCapture.frame ? (
                <small>
                  {semanticLiveCapture.frame.faceCount} face(s) •{" "}
                  {semanticLiveCapture.frame.handCount} hand(s) •{" "}
                  {semanticLiveCapture.frame.poseCount} pose(s)
                  {semanticLiveCapture.frame.primaryExpression
                    ? ` • ${semanticLiveCapture.frame.primaryExpression}`
                    : ""}
                </small>
              ) : (
                <small className="field-hint">
                  No MediaPipe detection frame was available yet. Try capturing
                  again after the camera has streamed for a moment.
                </small>
              )}
              {semanticLiveCapture.status === "directing" ? (
                <small className="field-hint">
                  Sending the live frame summary to the backend for art direction.
                </small>
              ) : null}
              {semanticLiveCapture.status === "applying" ? (
                <small className="field-hint">
                  Applying live mapping rules to the current canvas.
                </small>
              ) : null}
              {semanticLiveCapture.status === "regenerating" ? (
                <small className="field-hint">
                  Generating live-responsive AI image updates.
                </small>
              ) : null}
              {semanticLiveCapture.liveDirectionSummary ? (
                <small>
                  Live Direction: {semanticLiveCapture.liveDirectionSummary}
                </small>
              ) : null}
              {semanticLiveCapture.liveDirectionWarnings?.length ? (
                <small className="field-hint">
                  {semanticLiveCapture.liveDirectionWarnings.join(" • ")}
                </small>
              ) : null}
            </>
          ) : null}

          {semanticLiveCapture.status === "failed" ? (
            <small className="semantic-orchestration-status__error">
              {semanticLiveCapture.errorMessage ??
                "Could not capture the shared live moment."}
            </small>
          ) : null}
        </div>

        <div className="semantic-live-rules">
          <strong>Active Live Mapping Rules</strong>
          {activeLiveMappingRules.length ? (
            <div className="semantic-live-rules__active">
              {activeLiveMappingRules.map((rule) => (
                <div key={rule.id} className="semantic-live-rule">
                  <span>{rule.title}</span>
                  <small>Signal: {rule.signal}</small>
                  <small>Effect: {rule.effect}</small>
                </div>
              ))}
            </div>
          ) : (
            <small className="field-hint">
              The document has no active live mapping rules yet.
            </small>
          )}

          {semanticLiveCapture.liveMappingPatches?.length ? (
            <details className="semantic-live-rules__details">
              <summary>Technical Details</summary>
              <div className="semantic-live-rules__patches">
                {semanticLiveCapture.liveMappingPatches.map((patch) => (
                  <div key={patch.id} className="semantic-live-rule">
                    <span>{patch.mappingType}</span>
                    <small>
                      Target: {summarizeLiveMappingPatchTarget(document, patch)}
                      {" "}
                      {isLiveMappingPatchTargetResolved(document, patch)
                        ? "(resolved)"
                        : "(not resolved)"}
                    </small>
                    <small>
                      Signal: {patch.signalKey} • Intensity:{" "}
                      {Math.round(patch.intensity * 100)}% •{" "}
                      {summarizeLiveSignalStatus(patch.signalKey)}
                    </small>
                    <small>{patch.rationale}</small>
                    {patch.targetBlockId ? (
                      <small>Block: {patch.targetBlockId}</small>
                    ) : null}
                    {patch.targetSlotId ? (
                      <small>Slot: {patch.targetSlotId}</small>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard
        title="AI Art Director"
        subtitle="Generate real output from semantic intent and optional live context"
      >
        <div className="semantic-profile-status">
          <span>
            <strong>Active Director:</strong>{" "}
            {activeAgentProfile?.agentName ?? "Default AI Design Director"}
          </span>
          <span>
            <strong>Active Visual Style:</strong> {activeVisualStyleLabel}
          </span>
          <small>
            Profiles guide style and composition, not layout ownership.
          </small>
        </div>

        <div className="panel-inline-actions semantic-art-director-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void onGenerateOutput();
            }}
            disabled={orchestrationExecution.isRunning}
          >
            {primaryActionLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void onRefreshSelectedOutput();
            }}
            disabled={!selectedSlot || orchestrationExecution.isRunning}
            title="Refresh only the currently selected semantic slot"
          >
            Refresh Selected
          </button>
        </div>

        <div className="panel-inline-actions semantic-art-director-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={localFontLoadStatus === "loading"}
            onClick={handleLoadLocalFontsForOrchestration}
          >
            {localFontLoadStatus === "loading"
              ? "Loading Local Fonts..."
              : "Load Local Fonts"}
          </button>
          <small className="field-hint">
            {localFontStatusMessage ??
              "Optional: give the AI Art Director safe local font choices."}
          </small>
        </div>

        <label className="toggle-field">
          <span>Auto Refresh</span>
          <input
            type="checkbox"
            checked={orchestrationState?.autoRefreshEnabled ?? false}
            onChange={(event) => onToggleAutoRefresh(event.target.checked)}
          />
        </label>

        <label className="field">
          <span>Refresh Interval</span>
          <input
            className="text-input"
            type="number"
            min={10}
            step={1}
            value={Math.round(
              (orchestrationState?.autoRefreshIntervalMs ?? 15000) / 1000,
            )}
            onChange={(event) =>
              onUpdateAutoRefreshInterval((Number(event.target.value) || 15) * 1000)
            }
          />
          <small className="field-hint">
            Low-frequency refresh only. The orchestrator never runs as a frame
            controller.
          </small>
        </label>

        <div className="semantic-orchestration-status">
          <span>Status: {getExecutionPhaseLabel(orchestrationExecution)}</span>
          {orchestrationState?.lastRunAt ? (
            <span>Last Run: {new Date(orchestrationState.lastRunAt).toLocaleString()}</span>
          ) : null}
          {displayedExecutionSummary ? (
            <span>
              Summary: {displayedExecutionSummary}
            </span>
          ) : null}
          {orchestrationExecution.errorMessage || orchestrationState?.lastError ? (
            <span className="semantic-orchestration-status__error">
              Error: {orchestrationExecution.errorMessage ?? orchestrationState?.lastError}
            </span>
          ) : null}
        </div>

        {orchestrationExecution.queue.length > 0 ? (
          <div className="semantic-generation-queue">
            {orchestrationExecution.queue.map((item) => (
              <div key={item.id} className="semantic-generation-queue__item">
                <div className="semantic-generation-queue__header">
                  <strong>{item.label}</strong>
                  <span>{item.status}</span>
                </div>
                <small>
                  {item.mode === "video" ? "Video" : "Image"}
                  {typeof item.progress === "number"
                    ? ` • ${Math.round(item.progress)}%`
                    : ""}
                </small>
                {item.errorMessage ? (
                  <p className="semantic-generation-queue__error">
                    {item.errorMessage}
                  </p>
                ) : null}
                {item.warnings?.length ? (
                  <small className="field-hint">
                    {item.warnings.join(" • ")}
                  </small>
                ) : null}
                {item.status === "failed" && item.generationJobId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void onRetryGenerationJob(item.generationJobId!);
                    }}
                    disabled={orchestrationExecution.isRunning}
                  >
                    Retry Job
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {previewPlan ? (
          <div className="semantic-plan-preview">
            <strong>{previewPlan.summary}</strong>
            <small>
              {previewPlan.blockOps.length} block ops •{" "}
              {previewPlan.imageIntents.length} image intents •{" "}
              {previewPlan.typographyAdjustments.length} typography adjustments •{" "}
              {previewPlan.layoutPatches?.length ?? 0} remix proposals
            </small>
            {(previewPlan.layoutPatches?.length ?? 0) > 0 ? (
              <div className="semantic-plan-preview__remix">
                <strong>AI proposed visual remix changes</strong>
                {previewPlan.layoutPatches?.map((patch) => {
                  const targetSlot = semanticSlots.find(
                    (slot) => slot.id === patch.targetSlotId,
                  );
                  const changes = [
                    patch.frame ? "frame" : "",
                    typeof patch.rotation === "number" ? "rotation" : "",
                    typeof patch.zIndex === "number" ? "layer" : "",
                    typeof patch.opacity === "number" ? "opacity" : "",
                    patch.clipMode ? "clip" : "",
                    patch.blendMode ? "blend" : "",
                  ].filter(Boolean);

                  return (
                    <div key={patch.id} className="semantic-remix-patch">
                      <span>
                        {targetSlot?.name ??
                          patch.targetBlockId ??
                          patch.targetSlotId ??
                          "Output block"}
                      </span>
                      <small>
                        {changes.join(", ") || "visual adjustment"} · Risk{" "}
                        {patch.riskLevel.toFixed(2)}
                      </small>
                      <small>{patch.rationale}</small>
                    </div>
                  );
                })}
                <div className="semantic-plan-preview__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void onApplyLayoutRemix()}
                  >
                    Apply Layout Remix
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void onDismissLayoutRemix()}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            {decorativeOps.length > 0 ? (
              <div className="semantic-plan-preview__decorative">
                <strong>Decorative poster operations</strong>
                <small>
                  These add removable visual texture and do not replace core
                  information.
                </small>
                {decorativeOps.map((op) => (
                  <label key={op.id} className="semantic-decorative-op">
                    <input
                      type="checkbox"
                      checked={selectedDecorativeOpIds.includes(op.id)}
                      onChange={(event) =>
                        setSelectedDecorativeOpIds((current) =>
                          event.target.checked
                            ? [...current, op.id]
                            : current.filter((id) => id !== op.id),
                        )
                      }
                    />
                    <span>
                      {op.type.replace("-", " ")}
                      {op.patternType ? ` · ${op.patternType}` : ""}
                    </span>
                    <small>
                      Risk {op.riskLevel.toFixed(2)} · {op.rationale}
                    </small>
                  </label>
                ))}
                <div className="semantic-plan-preview__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setSelectedDecorativeOpIds([]);
                      void onApplyDecorativeOps();
                    }}
                  >
                    Apply All
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={selectedDecorativeOpIds.length === 0}
                    onClick={() => {
                      const selectedIds = [...selectedDecorativeOpIds];
                      setSelectedDecorativeOpIds([]);
                      void onApplyDecorativeOps(selectedIds);
                    }}
                  >
                    Apply Selected
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSelectedDecorativeOpIds([]);
                      void onDismissDecorativeOps();
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
            {displayedPlanWarnings.length > 0 ? (
              <ul className="semantic-plan-preview__warnings">
                {displayedPlanWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="empty-copy">
            Generate output to let the AI art director plan, apply, and trigger media generation in one pass.
          </p>
        )}
      </PanelCard>
    </aside>
  );
}
