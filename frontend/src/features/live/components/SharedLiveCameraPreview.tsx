import { useSharedLiveCamera } from "../runtime/sharedLiveCamera";

interface SharedLiveCameraPreviewProps {
  active: boolean;
}

export function SharedLiveCameraPreview({
  active,
}: SharedLiveCameraPreviewProps) {
  const { status, errorMessage, frame, videoRef } = useSharedLiveCamera(active);

  if (!active) {
    return null;
  }

  return (
    <div className="inspector-live-preview">
      <div className="inspector-live-preview__media">
        <video
          ref={videoRef}
          className="inspector-live-preview__video"
          muted
          playsInline
        />
        <div className="inspector-live-preview__hud">
          <strong>Go Live Camera</strong>
          <span>Status: {status}</span>
          <span>Faces: {frame?.faceCount ?? 0}</span>
          <span>Hands: {frame?.handCount ?? 0}</span>
          <span>Pose: {frame?.poseCount ?? 0}</span>
          <span>Signal: {frame?.primaryExpression ?? "idle"}</span>
        </div>
      </div>

      {errorMessage ? (
        <p className="error-copy">{errorMessage}</p>
      ) : null}
    </div>
  );
}
