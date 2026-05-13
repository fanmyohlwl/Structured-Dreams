import { useEffect } from "react";
import type { LiveBlock } from "../../../entities/block/types";
import {
  registerLiveAlias,
  unregisterLiveAlias,
  useSharedLiveCamera,
} from "../runtime/sharedLiveCamera";

interface LiveMediaBlockProps {
  block: LiveBlock;
  active: boolean;
  showOverlay?: boolean;
}

export function LiveMediaBlock({
  block,
  active,
  showOverlay = true,
}: LiveMediaBlockProps) {
  const { status, errorMessage, frame, videoRef } = useSharedLiveCamera(active);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    registerLiveAlias(block.id);

    return () => {
      unregisterLiveAlias(block.id);
    };
  }, [active, block.id]);

  return (
    <div
      className="live-media-block"
      style={{
        backgroundColor: block.data.backgroundColor ?? "#0f172a",
      }}
    >
      {block.data.showVideo ? (
        <video
          ref={videoRef}
          className="live-media-block__video"
          muted
          playsInline
        />
      ) : null}

      {block.data.showLandmarks ? (
        <svg className="live-media-block__landmarks" viewBox="0 0 1 1">
          {(frame?.landmarks ?? []).map((point, index) => (
            <circle
              key={`${point.region ?? "live"}-${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={point.region === "face" ? "0.0045" : point.region === "hand" ? "0.006" : "0.007"}
              className={`live-media-block__landmark live-media-block__landmark--${point.region ?? "face"}`}
            />
          ))}
        </svg>
      ) : null}

      {showOverlay ? (
        <div className="live-media-block__hud">
          <strong>{block.data.placeholderLabel ?? "Live Block"}</strong>
          <span>Status: {status}</span>
          <span>Faces: {frame?.faceCount ?? 0}</span>
          <span>Hands: {frame?.handCount ?? 0}</span>
          <span>Pose: {frame?.poseCount ?? 0}</span>
          <span>Signal: {frame?.primaryExpression ?? "idle"}</span>
        </div>
      ) : null}

      {showOverlay && errorMessage ? (
        <div className="live-media-block__error">{errorMessage}</div>
      ) : null}
    </div>
  );
}
