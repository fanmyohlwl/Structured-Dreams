import type {
  LiveColorMapping,
  LiveColorRule,
  LiveBlock,
} from "../../../entities/block/types";
import { expressionOptions } from "../config/expressionOptions";
import { SharedLiveCameraPreview } from "./SharedLiveCameraPreview";
import { GLOBAL_LIVE_SOURCE_ID } from "../runtime/sharedLiveCamera";

interface LiveColorMappingControlsProps {
  mapping?: LiveColorMapping;
  liveBlocks: LiveBlock[];
  onChange: (nextMapping: LiveColorMapping) => void;
  title?: string;
  subtitle?: string;
}

const createLiveColorRule = (): LiveColorRule => ({
  id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  expressionKey: "smile",
  threshold: 0.35,
  color: "#fff2b8",
});

const createDefaultLiveColorMapping = (): LiveColorMapping => ({
  enabled: false,
  sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
  defaultColor: "#ffffff",
  transitionMs: 600,
  rules: [createLiveColorRule()],
});

const getLiveColorMapping = (
  mapping?: LiveColorMapping,
): LiveColorMapping => mapping ?? createDefaultLiveColorMapping();

export function LiveColorMappingControls({
  mapping,
  liveBlocks,
  onChange,
  title = "Go Live",
  subtitle = "Map camera signals to background color",
}: LiveColorMappingControlsProps) {
  const currentMapping = getLiveColorMapping(mapping);
  const selectedSourceId = currentMapping.sourceBlockId ?? GLOBAL_LIVE_SOURCE_ID;
  const usesGlobalCamera = selectedSourceId === GLOBAL_LIVE_SOURCE_ID;

  return (
    <div className="inspector-live">
      <div className="inspector-live__header">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <label className="toggle-field">
        <span>Enable Live Color</span>
        <input
          type="checkbox"
          checked={currentMapping.enabled}
          onChange={(event) =>
            onChange({
              ...currentMapping,
              enabled: event.target.checked,
            })
          }
        />
      </label>

      {currentMapping.enabled ? (
        <>
          <label className="field">
            <span>Live Source</span>
            <select
              className="select-input"
              value={selectedSourceId}
              onChange={(event) =>
                onChange({
                  ...currentMapping,
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

          <div className="field-row">
            <label className="field field--compact">
              <span>Default Color</span>
              <input
                className="color-input"
                type="color"
                value={currentMapping.defaultColor}
                onChange={(event) =>
                  onChange({
                    ...currentMapping,
                    defaultColor: event.target.value,
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
                step={50}
                value={currentMapping.transitionMs}
                onChange={(event) =>
                  onChange({
                    ...currentMapping,
                    transitionMs: Number(event.target.value) || 0,
                  })
                }
              />
            </label>
          </div>

          <div className="inspector-live__rules">
            {currentMapping.rules.map((rule) => (
              <div key={rule.id} className="inspector-live__rule">
                <label className="field field--compact">
                  <span>Expression</span>
                  <select
                    className="select-input"
                    value={rule.expressionKey}
                    onChange={(event) =>
                      onChange({
                        ...currentMapping,
                        rules: currentMapping.rules.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                expressionKey: event.target.value,
                              }
                            : item,
                        ),
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
                    <span>Threshold</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={rule.threshold}
                      onChange={(event) =>
                        onChange({
                          ...currentMapping,
                          rules: currentMapping.rules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  threshold: Number(event.target.value) || 0,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>

                  <label className="field field--compact">
                    <span>Color</span>
                    <input
                      className="color-input"
                      type="color"
                      value={rule.color}
                      onChange={(event) =>
                        onChange({
                          ...currentMapping,
                          rules: currentMapping.rules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  color: event.target.value,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    onChange({
                      ...currentMapping,
                      rules: currentMapping.rules.filter((item) => item.id !== rule.id),
                    })
                  }
                >
                  Remove Rule
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              onChange({
                ...currentMapping,
                rules: [...currentMapping.rules, createLiveColorRule()],
              })
            }
          >
            Add Mapping Rule
          </button>

          {usesGlobalCamera ? (
            <SharedLiveCameraPreview active={currentMapping.enabled} />
          ) : null}

          {liveBlocks.length === 0 ? (
            <p className="empty-copy">
              Go Live can use the camera directly even without a Live Block on the canvas.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
