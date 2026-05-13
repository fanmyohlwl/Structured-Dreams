import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import { useElementSize } from "../../../shared/hooks/useElementSize";
import { PreviewDocumentRenderer } from "./PreviewDocumentRenderer";
import type { PreviewModel } from "../types";

export type ExhibitionAudienceStyle =
  | "balanced"
  | "bold-type"
  | "image-led"
  | "atmospheric";

export interface ExhibitionAudienceInput {
  identity: string;
  prompt: string;
  keywords: string;
  style: ExhibitionAudienceStyle;
  round: number;
}

interface ExhibitionModeOverlayProps {
  document: RenderDocumentSnapshot;
  onExit: () => void;
  onGenerate: (input: ExhibitionAudienceInput) => void | Promise<void>;
  onIterateAgain: (input: ExhibitionAudienceInput) => void | Promise<void>;
  isBusy: boolean;
  stageLabel: string;
  stageTone?: "idle" | "active" | "success" | "error";
  cameraStatus: string;
  cameraErrorMessage?: string;
  faceCount?: number;
  handCount?: number;
  poseCount?: number;
  primaryExpression?: string;
  captureSummary?: string;
  captureWarnings?: string[];
  regenerationEnabled: boolean;
  portraitFusionEnabled: boolean;
  onTogglePortraitFusion: (enabled: boolean) => void;
}

const styleOptions: Array<{
  value: ExhibitionAudienceStyle;
  label: string;
}> = [
  { value: "balanced", label: "Balanced" },
  { value: "bold-type", label: "Bold Type" },
  { value: "image-led", label: "Image-led" },
  { value: "atmospheric", label: "Atmospheric" },
];

const getExhibitionScale = ({
  viewportWidth,
  viewportHeight,
  documentWidth,
  documentHeight,
}: {
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
}) => {
  if (!viewportWidth || !viewportHeight) {
    return 1;
  }

  const paddedWidth = Math.max(viewportWidth - 56, 1);
  const paddedHeight = Math.max(viewportHeight - 56, 1);

  return Math.min(
    paddedWidth / documentWidth,
    paddedHeight / documentHeight,
  );
};

const createAudienceInput = ({
  identity,
  prompt,
  keywords,
  style,
  round,
}: {
  identity: string;
  prompt: string;
  keywords: string;
  style: ExhibitionAudienceStyle;
  round: number;
}): ExhibitionAudienceInput => ({
  identity: identity.trim(),
  prompt: prompt.trim(),
  keywords: keywords.trim(),
  style,
  round,
});

export function ExhibitionModeOverlay({
  document: renderDocument,
  onExit,
  onGenerate,
  onIterateAgain,
  isBusy,
  stageLabel,
  stageTone = "idle",
  cameraStatus,
  cameraErrorMessage,
  faceCount = 0,
  handCount = 0,
  poseCount = 0,
  primaryExpression,
  captureSummary,
  captureWarnings = [],
  regenerationEnabled,
  portraitFusionEnabled,
  onTogglePortraitFusion,
}: ExhibitionModeOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageSize = useElementSize(stageRef);
  const [identity, setIdentity] = useState("");
  const [prompt, setPrompt] = useState("");
  const [keywords, setKeywords] = useState("");
  const [style, setStyle] = useState<ExhibitionAudienceStyle>("balanced");
  const [round, setRound] = useState(0);
  const [lastInput, setLastInput] = useState<ExhibitionAudienceInput | null>(
    null,
  );
  const model = useMemo<PreviewModel>(
    () => ({
      document: renderDocument,
      showGridOverlay: false,
      scale: getExhibitionScale({
        viewportWidth: stageSize.width,
        viewportHeight: stageSize.height,
        documentWidth: renderDocument.canvas.width,
        documentHeight: renderDocument.canvas.height,
      }),
    }),
    [renderDocument, stageSize.height, stageSize.width],
  );
  const canGenerate = Boolean(
    identity.trim() || prompt.trim() || keywords.trim(),
  );

  useEffect(() => {
    const overlayElement = overlayRef.current;

    if (!overlayElement?.requestFullscreen) {
      return undefined;
    }

    void overlayElement.requestFullscreen().then(
      () => undefined,
      () => undefined,
    );

    return undefined;
  }, []);

  const handleGenerate = () => {
    if (isBusy || !canGenerate) {
      return;
    }

    const nextRound = round + 1;
    const input = createAudienceInput({
      identity,
      prompt,
      keywords,
      style,
      round: nextRound,
    });

    setRound(nextRound);
    setLastInput(input);
    void onGenerate(input);
  };

  const handleIterateAgain = () => {
    if (isBusy || !lastInput) {
      return;
    }

    const nextRound = round + 1;
    const input = {
      ...lastInput,
      round: nextRound,
    };

    setRound(nextRound);
    setLastInput(input);
    void onIterateAgain(input);
  };

  return (
    <div
      ref={overlayRef}
      className="exhibition-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Exhibition mode"
    >
      <aside className="exhibition-overlay__control-panel">
        <div className="exhibition-overlay__brand-row">
          <div>
            <p className="exhibition-overlay__eyebrow">Exhibition Mode</p>
            <h2 className="exhibition-overlay__brand">Structured Dreams</h2>
          </div>
          <button
            type="button"
            className="exhibition-overlay__exit-button"
            onClick={() => void onExit()}
          >
            Exit
          </button>
        </div>

        <div
          className="exhibition-overlay__intro"
          title="Audience input guides the current generation round. The design grid, slots, and block structure stay locked."
        >
          <strong>Tell the piece who is here.</strong>
          <span>
            Add a little identity, mood, or keyword. The camera capture and AI
            director handle the rest.
          </span>
        </div>

        <div className="exhibition-overlay__form">
          <label className="field">
            <span>Identity</span>
            <input
              className="text-input"
              value={identity}
              placeholder="Enter your name"
              onChange={(event) => setIdentity(event.target.value)}
            />
          </label>

          <label className="field">
            <span>One-line prompt</span>
            <textarea
              className="textarea-input exhibition-overlay__textarea"
              value={prompt}
              placeholder="A sentence, feeling, or request for this moment"
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Keywords</span>
            <input
              className="text-input"
              value={keywords}
              placeholder="Optional: city, color, rhythm, texture"
              onChange={(event) => setKeywords(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Style tendency</span>
            <select
              className="select-input"
              value={style}
              onChange={(event) =>
                setStyle(event.target.value as ExhibitionAudienceStyle)
              }
            >
              {styleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="exhibition-overlay__status-grid">
          <div className={`exhibition-overlay__status-card is-${stageTone}`}>
            <span>Progress</span>
            <strong>{stageLabel}</strong>
          </div>
          <div className="exhibition-overlay__status-card">
            <span>Camera</span>
            <strong>{cameraStatus}</strong>
          </div>
        </div>

        <div className="exhibition-overlay__camera-summary">
          <span>{faceCount} face(s)</span>
          <span>{handCount} hand(s)</span>
          <span>{poseCount} pose(s)</span>
          <span>{primaryExpression ?? "idle signal"}</span>
        </div>

        <label className="exhibition-overlay__toggle">
          <span>
            <strong>Fuse Captured Portrait Into Image</strong>
            <small>
              Let the captured person become a direct visual reference when
              image regeneration is enabled.
            </small>
          </span>
          <input
            type="checkbox"
            checked={portraitFusionEnabled}
            onChange={(event) => onTogglePortraitFusion(event.target.checked)}
          />
        </label>

        {cameraErrorMessage ? (
          <p className="exhibition-overlay__error">{cameraErrorMessage}</p>
        ) : null}

        <div className="exhibition-overlay__actions">
          <button
            type="button"
            className="primary-button exhibition-overlay__generate-button"
            disabled={isBusy || !canGenerate}
            title={
              canGenerate
                ? "Generate captures the current camera moment and asks the AI director to respond."
                : "Add at least one identity, prompt, or keyword before generating."
            }
            onClick={handleGenerate}
          >
            Generate
          </button>
          <button
            type="button"
            className="secondary-button exhibition-overlay__iterate-button"
            disabled={isBusy || !lastInput}
            onClick={handleIterateAgain}
          >
            Iterate Again
          </button>
        </div>

        <div className="exhibition-overlay__note">
          <strong>
            {regenerationEnabled
              ? "Live image regeneration is enabled."
              : "Mapping-only mode is active."}
          </strong>
          <span>
            Structure stays protected; each round asks for a fresh typography
            and visual direction inside the current design.
          </span>
        </div>

        <p className="exhibition-overlay__api-note">
          Image generation uses external APIs and network timing, so each round
          may take around 2-4 minutes.
        </p>
      </aside>

      <section className="exhibition-overlay__output-panel">
        <div className="exhibition-overlay__stage-header">
          <div>
            <p className="exhibition-overlay__eyebrow">Output Stage</p>
            <h3>Preview</h3>
          </div>
          {lastInput ? (
            <span className="exhibition-overlay__round-chip">
              Round {lastInput.round}
            </span>
          ) : null}
        </div>

        <div ref={stageRef} className="exhibition-overlay__stage">
          <PreviewDocumentRenderer model={model} />
          {isBusy ? (
            <div className="exhibition-overlay__stage-status">
              {stageLabel}
            </div>
          ) : null}
        </div>

        <div className="exhibition-overlay__stage-meta">
          <span>
            {lastInput?.keywords
              ? `Keywords: ${lastInput.keywords}`
              : "Awaiting audience input"}
          </span>
          <span>{captureSummary ?? "Ready for the next live direction."}</span>
        </div>

        {captureWarnings.length ? (
          <div className="exhibition-overlay__warnings">
            {captureWarnings.slice(0, 2).map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
