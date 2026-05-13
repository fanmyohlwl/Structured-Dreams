import { useEffect, useState } from "react";
import type {
  AIGenerationBlock,
  AIGenerationBlockData,
  AIGenerationMediaMode,
  AIGenerationRatioMode,
  BlockBlendMode,
  BlockClipMode,
  BlockVisualFilter,
  DesignBlock,
  ImageBlock,
  ImageBlockData,
  ImageFitMode,
  ImageLiveLayout,
  ImageLiveLayoutMode,
  ImageAssetKind,
  LiveBlock,
  LiveBlockData,
  TextLiveTypography,
  TextTypographyPropertyMapping,
  TextBlock,
  TextBlockData,
} from "../../../entities/block/types";
import {
  AI_GENERATION_RATIO_OPTIONS,
  buildCanvasBackgroundPromptSuffix,
  clampAIVideoDurationSeconds,
  clampContinuousGenerationIntervalMs,
  DEFAULT_AI_MEDIA_MODE,
  DEFAULT_AI_GENERATION_RATIO_MODE,
  DEFAULT_AI_VIDEO_DURATION_SECONDS,
  DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS,
  DEFAULT_AI_RESULT_FIT_MODE,
  getAIGenerationPosterFallbackUrl,
  hexToRgbString,
  MAX_CONTINUOUS_GENERATION_INTERVAL_MS,
  MIN_CONTINUOUS_GENERATION_INTERVAL_MS,
} from "../../ai/utils/aiBlockGeneration";
import type { ContinuousAIGenerationSessionState } from "../../ai/runtime/continuousGeneration";
import { expressionOptions } from "../../live/config/expressionOptions";
import { LiveColorMappingControls } from "../../live/components/LiveColorMappingControls";
import { GLOBAL_LIVE_SOURCE_ID } from "../../live/runtime/sharedLiveCamera";
import {
  IMAGE_LIVE_LAYOUT_MODE_OPTIONS,
  withDefaultImageLiveLayout,
} from "../../live/utils/imageLiveLayout";
import { withDefaultTextLiveTypography } from "../../live/utils/textLiveTypography";
import type {
  FontCatalogEntry,
  LocalFontCatalogLoadStatus,
} from "../../typography/fontCatalog";
import {
  blockBlendModes,
  blockClipModes,
  normalizeBlockRotation,
  normalizeBlockVisualFilter,
} from "../../../entities/block/visualStyle";
import {
  ensureCurrentFontCatalogEntry,
  getAvailableFontCatalog,
  groupFontCatalogEntries,
  requestLocalFontCatalog,
} from "../../typography/fontCatalog";

interface ImageSourcePayload {
  src: string;
  fileName?: string;
  mimeType?: string;
  kind?: ImageAssetKind;
}

interface SelectedBlockInspectorProps {
  blocks: DesignBlock[];
  canvasBackgroundColor: string;
  continuousAIGenerationSession: ContinuousAIGenerationSessionState;
  selectedBlock?: DesignBlock;
  onDeleteSelectedBlock: () => void;
  onUpdateSelectedBlockName: (name: string) => void;
  onUpdateTextBlock: (patch: Partial<TextBlockData>) => void;
  onUpdateImageBlock: (patch: Partial<ImageBlockData>) => void;
  onSetImageSource: (payload: ImageSourcePayload) => void;
  onUpdateAIGenerationBlock: (patch: Partial<AIGenerationBlockData>) => void;
  onUpdateLiveBlock: (patch: Partial<LiveBlockData>) => void;
  onUpdateSelectedBlockAppearance: (
    patch: Partial<
      Pick<
        DesignBlock,
        "showBorder" | "rotation" | "blendMode" | "clipMode" | "filter"
      >
    >,
  ) => void;
  onGenerateAI: () => void | Promise<void>;
  onCancelAI: () => void | Promise<void>;
  onStartContinuousAI: () => void | Promise<void>;
  onStopContinuousAI: () => void | Promise<void>;
}

const imageFitOptions: ImageFitMode[] = ["contain", "cover", "fill"];

const clampInteger = (value: number, min: number, max: number) =>
  Math.round(Math.min(Math.max(value, min), max));

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

interface DraftNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  onCommit: (value: number) => void;
}

function DraftNumberInput({
  value,
  min,
  max,
  step,
  className = "text-input",
  onCommit,
}: DraftNumberInputProps) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitDraftValue = () => {
    const trimmedValue = draftValue.trim();

    if (
      trimmedValue === "" ||
      trimmedValue === "-" ||
      trimmedValue === "." ||
      trimmedValue === "-."
    ) {
      setDraftValue(String(value));
      return;
    }

    const parsedValue = Number(trimmedValue);

    if (!Number.isFinite(parsedValue)) {
      setDraftValue(String(value));
      return;
    }

    onCommit(parsedValue);
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraftValue}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraftValue();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDraftValue(String(value));
          event.currentTarget.blur();
        }
      }}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      data-step={step}
    />
  );
}

const getLocalFontStatusCopy = (
  status: LocalFontCatalogLoadStatus,
  message?: string,
) => {
  if (message) {
    return message;
  }

  switch (status) {
    case "loading":
      return "Reading local fonts...";
    case "unsupported":
      return "Local font access is not supported in this browser.";
    case "blocked":
      return "Local font access was denied or needs a direct user gesture. Try again.";
    case "success":
      return "Local fonts loaded.";
    case "error":
      return "Local fonts could not be loaded.";
    default:
      return undefined;
  }
};

function renderCommonBlockControls(
  block: DesignBlock,
  onUpdateSelectedBlockAppearance: (
    patch: Partial<
      Pick<
        DesignBlock,
        "showBorder" | "rotation" | "blendMode" | "clipMode" | "filter"
      >
    >,
  ) => void,
) {
  const normalizedFilter = normalizeBlockVisualFilter(block.filter) ?? {};
  const updateFilter = (patch: Partial<BlockVisualFilter>) => {
    onUpdateSelectedBlockAppearance({
      filter: normalizeBlockVisualFilter({
        ...normalizedFilter,
        ...patch,
      }),
    });
  };

  return (
    <div className="inspector-stack">
      <label className="toggle-field">
        <span>Show Border</span>
        <input
          type="checkbox"
          checked={block.showBorder}
          onChange={(event) =>
            onUpdateSelectedBlockAppearance({ showBorder: event.target.checked })
          }
        />
      </label>
      <div className="field-row">
        <label className="field field--compact">
          <span>Rotation</span>
          <DraftNumberInput
            value={normalizeBlockRotation(block.rotation)}
            min={-180}
            max={180}
            step={1}
            onCommit={(rotation) =>
              onUpdateSelectedBlockAppearance({ rotation })
            }
          />
        </label>
        <label className="field field--compact">
          <span>Blend</span>
          <select
            className="select-input"
            value={block.blendMode ?? "normal"}
            onChange={(event) =>
              onUpdateSelectedBlockAppearance({
                blendMode: event.target.value as BlockBlendMode,
              })
            }
          >
            {blockBlendModes.map((blendMode) => (
              <option key={blendMode} value={blendMode}>
                {blendMode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Clip</span>
        <select
          className="select-input"
          value={block.clipMode ?? "frame"}
          onChange={(event) =>
            onUpdateSelectedBlockAppearance({
              clipMode: event.target.value as BlockClipMode,
            })
          }
        >
          {blockClipModes.map((clipMode) => (
            <option key={clipMode} value={clipMode}>
              {clipMode}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field field--compact">
          <span>Contrast</span>
          <DraftNumberInput
            value={normalizedFilter.contrast ?? 1}
            min={0.2}
            max={3}
            step={0.1}
            onCommit={(contrast) => updateFilter({ contrast })}
          />
        </label>
        <label className="field field--compact">
          <span>Saturate</span>
          <DraftNumberInput
            value={normalizedFilter.saturate ?? 1}
            min={0}
            max={3}
            step={0.1}
            onCommit={(saturate) => updateFilter({ saturate })}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field field--compact">
          <span>Blur</span>
          <DraftNumberInput
            value={normalizedFilter.blur ?? 0}
            min={0}
            max={24}
            step={1}
            onCommit={(blur) => updateFilter({ blur })}
          />
        </label>
        <label className="toggle-field field--compact">
          <span>Grayscale</span>
          <input
            type="checkbox"
            checked={normalizedFilter.grayscale === true}
            onChange={(event) =>
              updateFilter({ grayscale: event.target.checked })
            }
          />
        </label>
      </div>
    </div>
  );
}

function renderOptionalBackgroundControl(
  value: string | null | undefined,
  fallbackColor: string,
  onChange: (backgroundColor: string | null) => void,
) {
  const hasBackground = value !== null;

  return (
    <div className="field">
      <span>Background</span>
      <div className="background-control">
        <input
          className="color-input"
          type="color"
          value={value ?? fallbackColor}
          disabled={!hasBackground}
          onChange={(event) => onChange(event.target.value)}
        />
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={!hasBackground}
            onChange={(event) =>
              onChange(event.target.checked ? null : fallbackColor)
            }
          />
          <span>No Background</span>
        </label>
      </div>
    </div>
  );
}

function renderTextControls(
  block: TextBlock,
  onUpdateTextBlock: (patch: Partial<TextBlockData>) => void,
  liveBlocks: LiveBlock[],
  fontCatalog: FontCatalogEntry[],
  localFontLoadStatus: LocalFontCatalogLoadStatus,
  localFontStatusMessage: string | undefined,
  onRequestLocalFonts: () => void,
) {
  const liveTypography = withDefaultTextLiveTypography(block.data.liveTypography);
  const selectedTypographySourceId =
    liveTypography.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID;
  const availableFonts = ensureCurrentFontCatalogEntry(
    fontCatalog,
    block.data.fontFamily,
  );
  const groupedFonts = groupFontCatalogEntries(availableFonts);
  const updateLiveTypography = (patch: Partial<TextLiveTypography>) =>
    onUpdateTextBlock({
      liveTypography: {
        ...liveTypography,
        ...patch,
      },
    });
  const updateFontSizeMapping = (
    patch: Partial<TextTypographyPropertyMapping>,
  ) =>
    updateLiveTypography({
      fontSizeMapping: {
        ...liveTypography.fontSizeMapping,
        ...patch,
      },
    });
  const updateLetterSpacingMapping = (
    patch: Partial<TextTypographyPropertyMapping>,
  ) =>
    updateLiveTypography({
      letterSpacingMapping: {
        ...liveTypography.letterSpacingMapping,
        ...patch,
      },
    });

  return (
    <div className="inspector-form">
      <label className="field">
        <span>Text Content</span>
        <textarea
          className="text-input text-input--multiline"
          value={block.data.content}
          rows={5}
          onChange={(event) =>
            onUpdateTextBlock({ content: event.target.value })
          }
        />
      </label>

      <label className="field">
        <span>Font Family</span>
        <select
          className="select-input"
          value={block.data.fontFamily}
          onChange={(event) =>
            onUpdateTextBlock({ fontFamily: event.target.value })
          }
        >
          {groupedFonts.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.entries.map((font) => (
                <option key={font.id} value={font.family}>
                  {font.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="field-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={localFontLoadStatus === "loading"}
            onClick={onRequestLocalFonts}
          >
            {localFontLoadStatus === "loading"
              ? "Loading Local Fonts..."
              : "Load Local Fonts"}
          </button>
        </div>
        {getLocalFontStatusCopy(localFontLoadStatus, localFontStatusMessage) ? (
          <small className="field-hint">
            {getLocalFontStatusCopy(localFontLoadStatus, localFontStatusMessage)}
          </small>
        ) : null}
      </label>

      <label className="field">
        <span>Font Size</span>
        <input
          className="text-input"
          type="number"
          min={12}
          max={160}
          value={block.data.fontSize}
          onChange={(event) =>
            onUpdateTextBlock({ fontSize: Number(event.target.value) || 12 })
          }
        />
      </label>

      <label className="field">
        <span>Text Color</span>
        <input
          className="color-input"
          type="color"
          value={block.data.textColor}
          onChange={(event) =>
            onUpdateTextBlock({ textColor: event.target.value })
          }
        />
      </label>

      <label className="field">
        <span>Letter Spacing</span>
        <input
          className="text-input"
          type="number"
          min={-2}
          max={24}
          step={0.1}
          value={block.data.letterSpacing ?? 0}
          onChange={(event) =>
            onUpdateTextBlock({ letterSpacing: Number(event.target.value) || 0 })
          }
        />
      </label>

      <label className="field">
        <span>Line Height</span>
        <input
          className="text-input"
          type="number"
          min={0.75}
          max={1.8}
          step={0.05}
          value={block.data.lineHeight ?? 0.95}
          onChange={(event) =>
            onUpdateTextBlock({ lineHeight: Number(event.target.value) || 0.95 })
          }
        />
      </label>

      {renderOptionalBackgroundControl(
        block.data.backgroundColor,
        "#f3e8d9",
        (backgroundColor) => onUpdateTextBlock({ backgroundColor }),
      )}

      <LiveColorMappingControls
        mapping={block.data.liveColorMapping}
        liveBlocks={liveBlocks}
        onChange={(liveColorMapping) => onUpdateTextBlock({ liveColorMapping })}
      />

      <div className="inspector-live">
        <div className="inspector-live__header">
          <strong>Go Live Text</strong>
          <span>Map camera signals to typography</span>
        </div>

        <label className="toggle-field">
          <span>Enable Live Text</span>
          <input
            type="checkbox"
            checked={liveTypography.enabled}
            onChange={(event) =>
              updateLiveTypography({ enabled: event.target.checked })
            }
          />
        </label>

        {liveTypography.enabled ? (
          <>
            <label className="field">
              <span>Live Source</span>
              <select
                className="select-input"
                value={selectedTypographySourceId}
                onChange={(event) =>
                  updateLiveTypography({
                    sourceBlockId:
                      event.target.value === GLOBAL_LIVE_SOURCE_ID
                        ? GLOBAL_LIVE_SOURCE_ID
                        : event.target.value || GLOBAL_LIVE_SOURCE_ID,
                  })
                }
              >
                <option value={GLOBAL_LIVE_SOURCE_ID}>Go Live Camera</option>
                {liveBlocks.map((liveBlock) => (
                  <option key={liveBlock.id} value={liveBlock.id}>
                    {liveBlock.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Transition</span>
              <DraftNumberInput
                value={liveTypography.transitionMs}
                min={0}
                max={5000}
                step={20}
                onCommit={(nextValue) =>
                  updateLiveTypography({
                    transitionMs: clampInteger(nextValue, 0, 5000),
                  })
                }
              />
            </label>

            <div className="inspector-live__rules">
              <div className="inspector-live__rule">
                <div className="inspector-live__header">
                  <strong>Font Size Mapping</strong>
                  <span>Drive text scale with a live signal</span>
                </div>

                <label className="toggle-field">
                  <span>Enable Font Size Mapping</span>
                  <input
                    type="checkbox"
                    checked={liveTypography.fontSizeMapping.enabled}
                    onChange={(event) =>
                      updateFontSizeMapping({ enabled: event.target.checked })
                    }
                  />
                </label>

                {liveTypography.fontSizeMapping.enabled ? (
                  <>
                    <label className="field">
                      <span>Signal</span>
                      <select
                        className="select-input"
                        value={liveTypography.fontSizeMapping.signalKey}
                        onChange={(event) =>
                          updateFontSizeMapping({
                            signalKey: event.target.value,
                          })
                        }
                      >
                        {expressionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="field-row">
                      <label className="field field--compact">
                        <span>Min Font Size</span>
                        <DraftNumberInput
                          value={liveTypography.fontSizeMapping.min}
                          min={8}
                          max={240}
                          step={1}
                          onCommit={(nextValue) => {
                            const nextMin = clampInteger(nextValue, 8, 240);

                            updateFontSizeMapping({
                              min: nextMin,
                              max: Math.max(
                                nextMin,
                                liveTypography.fontSizeMapping.max,
                              ),
                            });
                          }}
                        />
                      </label>

                      <label className="field field--compact">
                        <span>Max Font Size</span>
                        <DraftNumberInput
                          value={liveTypography.fontSizeMapping.max}
                          min={liveTypography.fontSizeMapping.min}
                          max={320}
                          step={1}
                          onCommit={(nextValue) =>
                            updateFontSizeMapping({
                              max: Math.max(
                                liveTypography.fontSizeMapping.min,
                                clampInteger(nextValue, 8, 320),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="inspector-live__rule">
                <div className="inspector-live__header">
                  <strong>Letter Spacing Mapping</strong>
                  <span>Drive tracking with a separate live signal</span>
                </div>

                <label className="toggle-field">
                  <span>Enable Letter Spacing Mapping</span>
                  <input
                    type="checkbox"
                    checked={liveTypography.letterSpacingMapping.enabled}
                    onChange={(event) =>
                      updateLetterSpacingMapping({
                        enabled: event.target.checked,
                      })
                    }
                  />
                </label>

                {liveTypography.letterSpacingMapping.enabled ? (
                  <>
                    <label className="field">
                      <span>Signal</span>
                      <select
                        className="select-input"
                        value={liveTypography.letterSpacingMapping.signalKey}
                        onChange={(event) =>
                          updateLetterSpacingMapping({
                            signalKey: event.target.value,
                          })
                        }
                      >
                        {expressionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="field-row">
                      <label className="field field--compact">
                        <span>Min Letter Spacing</span>
                        <DraftNumberInput
                          value={liveTypography.letterSpacingMapping.min}
                          min={-8}
                          max={40}
                          step={0.5}
                          onCommit={(nextValue) => {
                            const nextMin = clampNumber(nextValue, -8, 40);

                            updateLetterSpacingMapping({
                              min: nextMin,
                              max: Math.max(
                                nextMin,
                                liveTypography.letterSpacingMapping.max,
                              ),
                            });
                          }}
                        />
                      </label>

                      <label className="field field--compact">
                        <span>Max Letter Spacing</span>
                        <DraftNumberInput
                          value={liveTypography.letterSpacingMapping.max}
                          min={liveTypography.letterSpacingMapping.min}
                          max={48}
                          step={0.5}
                          onCommit={(nextValue) =>
                            updateLetterSpacingMapping({
                              max: Math.max(
                                liveTypography.letterSpacingMapping.min,
                                clampNumber(nextValue, -8, 48),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {liveBlocks.length === 0 ? (
              <p className="empty-copy">
                Go Live Text can use the camera directly even without a Live Block.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function renderImageControls(
  block: ImageBlock,
  onUpdateImageBlock: (patch: Partial<ImageBlockData>) => void,
  onSetImageSource: (payload: ImageSourcePayload) => void,
  liveBlocks: LiveBlock[],
) {
  const liveLayout = withDefaultImageLiveLayout(block.data.liveLayout);
  const selectedSourceId = liveLayout.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID;
  const updateLiveLayout = (patch: Partial<ImageLiveLayout>) =>
    onUpdateImageBlock({
      liveLayout: {
        ...liveLayout,
        ...patch,
      },
    });

  return (
    <div className="inspector-form">
      <label className="field">
        <span>Image URL</span>
        <input
          className="text-input"
          type="text"
          placeholder="https://... or pasted data URL"
          value={block.data.asset?.src ?? ""}
          onChange={(event) =>
            onSetImageSource({
              src: event.target.value,
              mimeType: "image/*",
              kind: "raster",
            })
          }
        />
      </label>

      <label className="field">
        <span>Upload Image</span>
        <input
          type="file"
          accept="image/*,.svg"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (!file) {
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") {
                return;
              }

              onSetImageSource({
                src: reader.result,
                fileName: file.name,
                mimeType: file.type || "image/*",
                kind: file.type === "image/svg+xml" ? "vector" : "raster",
              });
            };
            reader.readAsDataURL(file);
            event.currentTarget.value = "";
          }}
        />
      </label>

      <label className="field">
        <span>Fit Mode</span>
        <select
          className="select-input"
          value={block.data.fitMode}
          onChange={(event) =>
            onUpdateImageBlock({ fitMode: event.target.value as ImageFitMode })
          }
        >
          {imageFitOptions.map((fitMode) => (
            <option key={fitMode} value={fitMode}>
              {fitMode}
            </option>
          ))}
        </select>
      </label>

      {renderOptionalBackgroundControl(
        block.data.backgroundColor,
        "#ffffff",
        (backgroundColor) => onUpdateImageBlock({ backgroundColor }),
      )}

      <LiveColorMappingControls
        mapping={block.data.liveColorMapping}
        liveBlocks={liveBlocks}
        onChange={(liveColorMapping) => onUpdateImageBlock({ liveColorMapping })}
      />

      <div className="inspector-live">
        <div className="inspector-live__header">
          <strong>Go Live Layout</strong>
          <span>Repeat one uploaded asset and map count or arrangement to live signals</span>
        </div>

        <label className="toggle-field">
          <span>Enable Live Layout</span>
          <input
            type="checkbox"
            checked={liveLayout.enabled}
            onChange={(event) =>
              updateLiveLayout({ enabled: event.target.checked })
            }
          />
        </label>

        {liveLayout.enabled ? (
          <>
            <label className="field">
              <span>Live Source</span>
              <select
                className="select-input"
                value={selectedSourceId}
                onChange={(event) =>
                  updateLiveLayout({
                    sourceBlockId:
                      event.target.value === GLOBAL_LIVE_SOURCE_ID
                        ? GLOBAL_LIVE_SOURCE_ID
                        : event.target.value || GLOBAL_LIVE_SOURCE_ID,
                  })
                }
              >
                <option value={GLOBAL_LIVE_SOURCE_ID}>Go Live Camera</option>
                {liveBlocks.map((liveBlock) => (
                  <option key={liveBlock.id} value={liveBlock.id}>
                    {liveBlock.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Count Signal</span>
              <select
                className="select-input"
                value={liveLayout.countSignalKey}
                onChange={(event) =>
                  updateLiveLayout({ countSignalKey: event.target.value })
                }
              >
                {expressionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field field--compact">
                <span>Min Count</span>
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  max={36}
                  step={1}
                  value={liveLayout.minCount}
                  onChange={(event) => {
                    const nextMinCount = Math.max(
                      1,
                      Math.min(36, Number(event.target.value) || 1),
                    );

                    updateLiveLayout({
                      minCount: nextMinCount,
                      maxCount: Math.max(nextMinCount, liveLayout.maxCount),
                    });
                  }}
                />
              </label>

              <label className="field field--compact">
                <span>Max Count</span>
                <input
                  className="text-input"
                  type="number"
                  min={liveLayout.minCount}
                  max={36}
                  step={1}
                  value={liveLayout.maxCount}
                  onChange={(event) =>
                    updateLiveLayout({
                      maxCount: Math.max(
                        liveLayout.minCount,
                        Math.min(36, Number(event.target.value) || liveLayout.minCount),
                      ),
                    })
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Layout Mode</span>
              <select
                className="select-input"
                value={liveLayout.layoutMode}
                onChange={(event) =>
                  updateLiveLayout({
                    layoutMode: event.target.value as ImageLiveLayoutMode,
                  })
                }
              >
                {IMAGE_LIVE_LAYOUT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field field--compact">
                <span>Gap / Spacing</span>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  max={96}
                  step={1}
                  value={liveLayout.gap}
                  onChange={(event) =>
                    updateLiveLayout({
                      gap: Math.max(0, Math.min(96, Number(event.target.value) || 0)),
                    })
                  }
                />
              </label>

              <label className="field field--compact">
                <span>Transition</span>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  max={5000}
                  step={20}
                  value={liveLayout.transitionMs}
                  onChange={(event) =>
                    updateLiveLayout({
                      transitionMs: Math.max(
                        0,
                        Math.min(5000, Number(event.target.value) || 0),
                      ),
                    })
                  }
                />
              </label>
            </div>

            {liveLayout.layoutMode === "wave" ? (
              <div className="inspector-live__rules">
                <div className="inspector-live__rule">
                  <label className="field">
                    <span>Wave Signal</span>
                    <select
                      className="select-input"
                      value={liveLayout.waveSignalKey}
                      onChange={(event) =>
                        updateLiveLayout({ waveSignalKey: event.target.value })
                      }
                    >
                      {expressionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Wave Amplitude</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={160}
                      step={1}
                      value={liveLayout.waveAmplitude}
                      onChange={(event) =>
                        updateLiveLayout({
                          waveAmplitude: Math.max(
                            0,
                            Math.min(160, Number(event.target.value) || 0),
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {!block.data.asset ? (
              <p className="empty-copy">
                Live layout needs an image asset before repeated instances can render.
              </p>
            ) : null}

            {liveBlocks.length === 0 ? (
              <p className="empty-copy">
                Go Live Layout can use the camera directly even without a Live Block.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="asset-preview">
        {block.data.asset ? (
          <img
            src={block.data.asset.src}
            alt={block.name}
            className="asset-preview__image"
          />
        ) : (
          <div className="asset-preview__empty">No image assigned</div>
        )}
      </div>
    </div>
  );
}

function renderAIControls(
  block: AIGenerationBlock,
  canvasBackgroundColor: string,
  continuousAIGenerationSession: ContinuousAIGenerationSessionState,
  onUpdateAIGenerationBlock: (patch: Partial<AIGenerationBlockData>) => void,
  onGenerateAI: () => void | Promise<void>,
  onCancelAI: () => void | Promise<void>,
  onStartContinuousAI: () => void | Promise<void>,
  onStopContinuousAI: () => void | Promise<void>,
) {
  const mediaMode = block.data.mediaMode ?? DEFAULT_AI_MEDIA_MODE;
  const isVideoMode = mediaMode === "video";
  const injectedBackgroundPrompt =
    block.data.matchCanvasBackground
      ? buildCanvasBackgroundPromptSuffix(canvasBackgroundColor)
      : null;
  const canvasBackgroundRgb = hexToRgbString(canvasBackgroundColor);
  const hasAnyContinuousSession =
    continuousAIGenerationSession.activeBlockId != null ||
    continuousAIGenerationSession.status !== "idle";
  const isCurrentContinuousBlock =
    continuousAIGenerationSession.activeBlockId === block.id;
  const isAnotherContinuousBlockActive =
    hasAnyContinuousSession &&
    continuousAIGenerationSession.activeBlockId !== block.id;
  const disableAIConfigEditing =
    (hasAnyContinuousSession && isCurrentContinuousBlock) ||
    block.data.status === "queued" ||
    block.data.status === "generating";
  const intervalSeconds = Math.round(
    (block.data.continuousGenerationIntervalMs ??
      DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS) / 1000,
  );
  const isManualGenerateDisabled =
    hasAnyContinuousSession ||
    block.data.status === "queued" ||
    block.data.status === "generating";
  const hasResultVideo = Boolean(block.data.resultVideoUrl);
  const videoPosterUrl = getAIGenerationPosterFallbackUrl(block.data);
  const canCancelGeneration = Boolean(
    block.data.generationId &&
      (block.data.status === "queued" || block.data.status === "generating"),
  );
  const videoDurationSeconds = clampAIVideoDurationSeconds(
    block.data.durationSeconds ?? DEFAULT_AI_VIDEO_DURATION_SECONDS,
  );
  const showContinuousControls = !isVideoMode;

  return (
    <div className="inspector-form">
      <div className="field">
        <span>Media Type</span>
        <div className="tab-strip">
          {(["image", "video"] as AIGenerationMediaMode[]).map((modeOption) => (
            <button
              key={modeOption}
              type="button"
              className={`tab-strip__button${
                mediaMode === modeOption ? " is-active" : ""
              }`}
              disabled={disableAIConfigEditing}
              onClick={() =>
                onUpdateAIGenerationBlock({
                  mediaMode: modeOption,
                })
              }
            >
              {modeOption === "image" ? "Photo" : "Video"}
            </button>
          ))}
        </div>
      </div>

      <label className="toggle-field">
        <span>
          {isVideoMode
            ? "Match video background to canvas color"
            : "Match image background to canvas color"}
        </span>
        <input
          type="checkbox"
          checked={block.data.matchCanvasBackground ?? false}
          disabled={disableAIConfigEditing}
          onChange={(event) =>
            onUpdateAIGenerationBlock({
              matchCanvasBackground: event.target.checked,
            })
          }
        />
      </label>

      {block.data.matchCanvasBackground && injectedBackgroundPrompt ? (
        <p className="empty-copy">
          Generate-time suffix uses {canvasBackgroundRgb}.
        </p>
      ) : null}

      <label className="field">
        <span>Prompt</span>
        <textarea
          className="text-input text-input--multiline"
          rows={5}
          value={block.data.prompt}
          disabled={disableAIConfigEditing}
          onChange={(event) =>
            onUpdateAIGenerationBlock({ prompt: event.target.value })
          }
        />
      </label>

      {isVideoMode ? (
        <label className="field">
          <span>Duration</span>
          <DraftNumberInput
            value={videoDurationSeconds}
            min={1}
            max={30}
            step={1}
            onCommit={(nextValue) =>
              onUpdateAIGenerationBlock({
                durationSeconds: clampAIVideoDurationSeconds(nextValue),
              })
            }
          />
        </label>
      ) : null}

      <label className="field">
        <span>Generation Ratio</span>
        <select
          className="select-input"
          value={
            block.data.generationRatioMode ?? DEFAULT_AI_GENERATION_RATIO_MODE
          }
          disabled={disableAIConfigEditing}
          onChange={(event) =>
            onUpdateAIGenerationBlock({
              generationRatioMode:
                event.target.value as AIGenerationRatioMode,
            })
          }
        >
          {AI_GENERATION_RATIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Display Fit</span>
        <select
          className="select-input"
          value={block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE}
          disabled={disableAIConfigEditing}
          onChange={(event) =>
            onUpdateAIGenerationBlock({
              resultFitMode: event.target.value as ImageFitMode,
            })
          }
        >
          {imageFitOptions.map((fitMode) => (
            <option key={fitMode} value={fitMode}>
              {fitMode}
            </option>
          ))}
        </select>
      </label>

      <div className="inspector-row">
        <span>Status</span>
        <strong>{block.data.status}</strong>
      </div>

      <div className="inspector-row">
        <span>Provider</span>
        <strong>{block.data.provider ?? "backend"}</strong>
      </div>

      {showContinuousControls ? (
        <>
          <label className="field">
            <span>Continuous Interval</span>
            <input
              className="text-input"
              type="number"
              min={MIN_CONTINUOUS_GENERATION_INTERVAL_MS / 1000}
              max={MAX_CONTINUOUS_GENERATION_INTERVAL_MS / 1000}
              step={1}
              value={intervalSeconds}
              disabled={disableAIConfigEditing}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                const nextIntervalMs = clampContinuousGenerationIntervalMs(
                  (Number.isFinite(seconds)
                    ? seconds
                    : DEFAULT_CONTINUOUS_GENERATION_INTERVAL_MS / 1000) * 1000,
                );

                onUpdateAIGenerationBlock({
                  continuousGenerationIntervalMs: nextIntervalMs,
                });
              }}
            />
          </label>

          <p className="empty-copy">
            Waits after one round finishes, then starts the next round.
          </p>

          <div className="inspector-row">
            <span>Continuous Status</span>
            <strong>
              {isCurrentContinuousBlock
                ? continuousAIGenerationSession.status
                : "idle"}
            </strong>
          </div>

          <div className="inspector-row">
            <span>Iteration Count</span>
            <strong>
              {isCurrentContinuousBlock
                ? continuousAIGenerationSession.iterationCount
                : 0}
            </strong>
          </div>
        </>
      ) : null}

      {isAnotherContinuousBlockActive ? (
        <p className="empty-copy">
          Another AI media session is already running in the workspace.
        </p>
      ) : null}

      {isCurrentContinuousBlock &&
      continuousAIGenerationSession.lastErrorMessage ? (
        <p className="error-copy">
          {continuousAIGenerationSession.lastErrorMessage}
        </p>
      ) : null}

      <button
        type="button"
        className="primary-button"
        onClick={() => void onGenerateAI()}
        disabled={isManualGenerateDisabled}
      >
        {isVideoMode ? "Generate Video" : "Generate Photo"}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={() => void onCancelAI()}
        disabled={!canCancelGeneration}
      >
        Cancel Generation
      </button>

      {showContinuousControls ? (
        <button
          type="button"
          className="primary-button"
          onClick={() => void onStartContinuousAI()}
          disabled={isManualGenerateDisabled}
        >
          Start Continuous
        </button>
      ) : null}

      {showContinuousControls ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onStopContinuousAI()}
          disabled={!hasAnyContinuousSession}
        >
          Stop Continuous
        </button>
      ) : null}

      <div className="asset-preview asset-preview--ai">
        {isVideoMode && hasResultVideo ? (
          <video
            src={block.data.resultVideoUrl}
            poster={videoPosterUrl}
            className="asset-preview__video"
            autoPlay
            muted
            loop
            playsInline
            controls
            style={{
              objectFit:
                block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
            }}
          />
        ) : isVideoMode && videoPosterUrl ? (
          <img
            src={videoPosterUrl}
            alt="Generated video poster"
            className="asset-preview__image"
            style={{
              objectFit:
                block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
            }}
          />
        ) : !isVideoMode &&
          (block.data.resultPreviewUrl || block.data.resultImageUrl) ? (
          <img
            src={block.data.resultPreviewUrl ?? block.data.resultImageUrl}
            alt="Generated preview"
            className="asset-preview__image"
            style={{
              objectFit:
                block.data.resultFitMode ?? DEFAULT_AI_RESULT_FIT_MODE,
            }}
          />
        ) : (
          <div className="asset-preview__empty">
            {isVideoMode ? "Video result preview" : "Photo result preview"}
          </div>
        )}
      </div>

      {isVideoMode && block.data.resultDurationMs ? (
        <div className="inspector-row">
          <span>Duration</span>
          <strong>{(block.data.resultDurationMs / 1000).toFixed(1)}s</strong>
        </div>
      ) : null}

      {typeof block.data.generationProgress === "number" ? (
        <div className="inspector-row">
          <span>Progress</span>
          <strong>{block.data.generationProgress}%</strong>
        </div>
      ) : null}

      {block.data.errorMessage ? (
        <p className="error-copy">{block.data.errorMessage}</p>
      ) : null}
    </div>
  );
}

function renderLiveControls(
  block: LiveBlock,
  onUpdateLiveBlock: (patch: Partial<LiveBlockData>) => void,
) {
  return (
    <div className="inspector-form">
      <div className="inspector-row">
        <span>Source</span>
        <strong>{block.data.source}</strong>
      </div>

      <div className="inspector-row">
        <span>Detector</span>
        <strong>{block.data.detector}</strong>
      </div>

      <div className="inspector-row">
        <span>Status</span>
        <strong>{block.data.status}</strong>
      </div>

      <label className="toggle-field">
        <span>Show Video</span>
        <input
          type="checkbox"
          checked={block.data.showVideo}
          onChange={(event) =>
            onUpdateLiveBlock({ showVideo: event.target.checked })
          }
        />
      </label>

      <label className="toggle-field">
        <span>Show Landmarks</span>
        <input
          type="checkbox"
          checked={block.data.showLandmarks}
          onChange={(event) =>
            onUpdateLiveBlock({ showLandmarks: event.target.checked })
          }
        />
      </label>

      {renderOptionalBackgroundControl(
        block.data.backgroundColor,
        "#0f172a",
        (backgroundColor) => onUpdateLiveBlock({ backgroundColor }),
      )}

      <p className="empty-copy">
        Live Block uses the shared camera runtime and MediaPipe face, hand, and pose detection together.
      </p>

      {block.data.errorMessage ? (
        <p className="error-copy">{block.data.errorMessage}</p>
      ) : null}
    </div>
  );
}

export function SelectedBlockInspector({
  blocks,
  canvasBackgroundColor,
  continuousAIGenerationSession,
  selectedBlock,
  onDeleteSelectedBlock,
  onUpdateSelectedBlockName,
  onUpdateTextBlock,
  onUpdateImageBlock,
  onSetImageSource,
  onUpdateAIGenerationBlock,
  onUpdateLiveBlock,
  onUpdateSelectedBlockAppearance,
  onGenerateAI,
  onCancelAI,
  onStartContinuousAI,
  onStopContinuousAI,
}: SelectedBlockInspectorProps) {
  const liveBlocks = blocks.filter(
    (block): block is LiveBlock => block.type === "live",
  );
  const [fontCatalog, setFontCatalog] = useState<FontCatalogEntry[]>(
    getAvailableFontCatalog(),
  );
  const [localFontLoadStatus, setLocalFontLoadStatus] =
    useState<LocalFontCatalogLoadStatus>("idle");
  const [localFontStatusMessage, setLocalFontStatusMessage] = useState<
    string | undefined
  >();

  const handleRequestLocalFonts = () => {
    setLocalFontLoadStatus("loading");
    setLocalFontStatusMessage(undefined);

    void requestLocalFontCatalog().then((result) => {
      setFontCatalog(result.entries);
      setLocalFontLoadStatus(result.status);
      setLocalFontStatusMessage(result.message);
    });
  };

  if (!selectedBlock) {
    return <p className="empty-copy">Select a block on the canvas to inspect it.</p>;
  }

  return (
    <div className="inspector-stack">
      <div className="inspector-row">
        <span>Type</span>
        <strong>{selectedBlock.type}</strong>
      </div>
      <label className="field">
        <span>Name</span>
        <input
          className="text-input"
          type="text"
          value={selectedBlock.name}
          onChange={(event) => onUpdateSelectedBlockName(event.target.value)}
        />
      </label>
      <div className="inspector-row">
        <span>Position</span>
        <strong>
          {selectedBlock.frame.x}, {selectedBlock.frame.y}
        </strong>
      </div>
      <div className="inspector-row">
        <span>Size</span>
        <strong>
          {selectedBlock.frame.width} × {selectedBlock.frame.height}
        </strong>
      </div>

      {renderCommonBlockControls(
        selectedBlock,
        onUpdateSelectedBlockAppearance,
      )}

      {selectedBlock.type === "text"
        ? renderTextControls(
            selectedBlock,
            onUpdateTextBlock,
            liveBlocks,
            fontCatalog,
            localFontLoadStatus,
            localFontStatusMessage,
            handleRequestLocalFonts,
          )
        : null}

      {selectedBlock.type === "image"
        ? renderImageControls(
            selectedBlock,
            onUpdateImageBlock,
            onSetImageSource,
            liveBlocks,
          )
        : null}

      {selectedBlock.type === "ai-generation"
        ? renderAIControls(
            selectedBlock,
            canvasBackgroundColor,
            continuousAIGenerationSession,
            onUpdateAIGenerationBlock,
            onGenerateAI,
            onCancelAI,
            onStartContinuousAI,
            onStopContinuousAI,
          )
        : null}

      {selectedBlock.type === "live"
        ? renderLiveControls(selectedBlock, onUpdateLiveBlock)
        : null}

      <button
        type="button"
        className="danger-button"
        onClick={onDeleteSelectedBlock}
      >
        Delete Block
      </button>
    </div>
  );
}
