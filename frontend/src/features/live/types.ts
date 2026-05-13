export interface LiveLandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  region?: "face" | "hand" | "pose";
}

export interface LiveDetectionFrame {
  sourceId: string;
  faceCount: number;
  handCount: number;
  poseCount: number;
  landmarks: LiveLandmarkPoint[];
  expressions: Record<string, number>;
  primaryExpression?: string;
  updatedAt: number;
}

export interface LiveDetector {
  detect(video: HTMLVideoElement, timestampMs: number): LiveDetectionFrame;
  dispose: () => void;
}

export interface LiveExpressionSnapshot {
  blockId: string;
  faceCount: number;
  handCount: number;
  poseCount: number;
  expressions: Record<string, number>;
  primaryExpression?: string;
  updatedAt: number;
}

export interface SharedLiveCameraState {
  status: "idle" | "loading" | "streaming" | "error";
  errorMessage?: string;
  frame: LiveDetectionFrame | null;
  stream: MediaStream | null;
}

export interface SharedLiveCameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface SharedLiveCameraDeviceState {
  selectedDeviceId?: string;
  availableVideoDevices: SharedLiveCameraDeviceInfo[];
}

export interface SharedLiveEnvironmentSample {
  brightness: number;
  red: number;
  green: number;
  blue: number;
  sampledAt: number;
}

export interface SharedLiveMomentLandmarkSample {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  region?: LiveLandmarkPoint["region"];
}

export interface SharedLiveMomentFrameSummary {
  faceCount: number;
  handCount: number;
  poseCount: number;
  expressions: Record<string, number>;
  primaryExpression?: string;
  updatedAt: number;
  landmarkSamples: SharedLiveMomentLandmarkSample[];
}

export interface SharedLiveMomentCapture {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  frame: SharedLiveMomentFrameSummary | null;
}
