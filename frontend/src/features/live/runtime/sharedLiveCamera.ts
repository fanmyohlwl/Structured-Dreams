import { useCallback, useEffect, useSyncExternalStore } from "react";
import { clearLiveExpressionSnapshot, publishLiveExpressionSnapshot } from "./liveExpressionStore";
import { mediaPipeLiveService } from "../services/MediaPipeLiveService";
import type {
  LiveDetectionFrame,
  SharedLiveCameraDeviceState,
  SharedLiveEnvironmentSample,
  SharedLiveCameraState,
  SharedLiveMomentCapture,
  SharedLiveMomentFrameSummary,
} from "../types";

export const GLOBAL_LIVE_SOURCE_ID = "live_source_global_camera";

const EMPTY_STATE: SharedLiveCameraState = {
  status: "idle",
  frame: null,
  stream: null,
};

const EMPTY_DEVICE_STATE: SharedLiveCameraDeviceState = {
  selectedDeviceId: undefined,
  availableVideoDevices: [],
};

let state: SharedLiveCameraState = EMPTY_STATE;
let deviceState: SharedLiveCameraDeviceState = EMPTY_DEVICE_STATE;
let consumers = 0;
let animationFrameId = 0;
let detector:
  | Awaited<ReturnType<typeof mediaPipeLiveService.createHolisticDetector>>
  | null = null;
let internalVideo: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let startPromise: Promise<void> | null = null;
let cameraStartVersion = 0;
const videoOutputs = new Set<HTMLVideoElement>();
const listeners = new Set<() => void>();
const deviceListeners = new Set<() => void>();
const aliasRefCounts = new Map<string, number>();
const EXPORT_CAMERA_READY_TIMEOUT_MS = 15000;
const LIVE_MOMENT_CAPTURE_MAX_EDGE = 768;
const LIVE_MOMENT_CAPTURE_QUALITY = 0.72;
const LIVE_MOMENT_LANDMARK_SAMPLE_LIMIT = 12;
let captureCanvas: HTMLCanvasElement | null = null;
let environmentSampleCanvas: HTMLCanvasElement | null = null;

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const emitDeviceChange = () => {
  deviceListeners.forEach((listener) => listener());
};

const setState = (patch: Partial<SharedLiveCameraState>) => {
  state = {
    ...state,
    ...patch,
  };
  emitChange();
};

const setDeviceState = (patch: Partial<SharedLiveCameraDeviceState>) => {
  deviceState = {
    ...deviceState,
    ...patch,
  };
  emitDeviceChange();
};

const getVideoConstraints = (): MediaTrackConstraints => {
  if (deviceState.selectedDeviceId) {
    return {
      deviceId: {
        exact: deviceState.selectedDeviceId,
      },
    };
  }

  return {
    facingMode: "user",
  };
};

const syncVideoOutputs = () => {
  videoOutputs.forEach((videoElement) => {
    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }

    if (stream) {
      void videoElement.play().catch(() => undefined);
    }
  });
};

const publishSnapshotAliases = () => {
  const frame = state.frame;

  if (!frame) {
    return;
  }

  publishLiveExpressionSnapshot({
    blockId: GLOBAL_LIVE_SOURCE_ID,
    faceCount: frame.faceCount,
    handCount: frame.handCount,
    poseCount: frame.poseCount,
    expressions: frame.expressions,
    primaryExpression: frame.primaryExpression,
    updatedAt: frame.updatedAt,
  });

  aliasRefCounts.forEach((count, aliasId) => {
    if (count <= 0) {
      return;
    }

    publishLiveExpressionSnapshot({
      blockId: aliasId,
      faceCount: frame.faceCount,
      handCount: frame.handCount,
      poseCount: frame.poseCount,
      expressions: frame.expressions,
      primaryExpression: frame.primaryExpression,
      updatedAt: frame.updatedAt,
    });
  });
};

const stopSharedCamera = () => {
  cameraStartVersion += 1;
  startPromise = null;
  window.cancelAnimationFrame(animationFrameId);
  animationFrameId = 0;
  detector?.dispose();
  detector = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;

  if (internalVideo) {
    internalVideo.pause();
    internalVideo.srcObject = null;
  }

  videoOutputs.forEach((videoElement) => {
    videoElement.srcObject = null;
  });

  clearLiveExpressionSnapshot(GLOBAL_LIVE_SOURCE_ID);
  aliasRefCounts.forEach((_, aliasId) => {
    clearLiveExpressionSnapshot(aliasId);
  });

  state = EMPTY_STATE;
  emitChange();
};

const ensureInternalVideo = () => {
  if (internalVideo) {
    return internalVideo;
  }

  internalVideo = document.createElement("video");
  internalVideo.muted = true;
  internalVideo.playsInline = true;
  internalVideo.autoplay = true;
  return internalVideo;
};

const startSharedCamera = async () => {
  if (startPromise) {
    return startPromise;
  }

  const startPromiseRef: {
    current: Promise<void> | null;
  } = {
    current: null,
  };
  const nextStartPromise = (async () => {
    const startVersion = cameraStartVersion;

    try {
      setState({
        status: "loading",
        errorMessage: undefined,
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not available in this browser.");
      }

      const videoElement = ensureInternalVideo();
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(),
        audio: false,
      });

      if (startVersion !== cameraStartVersion) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = nextStream;
      void enumerateSharedCameraDevices().catch(() => undefined);

      videoElement.srcObject = stream;
      await videoElement.play();
      syncVideoOutputs();
      detector = await mediaPipeLiveService.createHolisticDetector(
        GLOBAL_LIVE_SOURCE_ID,
      );

      if (startVersion !== cameraStartVersion) {
        detector?.dispose();
        detector = null;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        return;
      }

      setState({
        status: "streaming",
        stream,
      });

      const readFrame = () => {
        if (!internalVideo || !detector) {
          return;
        }

        if (internalVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const frame = detector.detect(internalVideo, performance.now());
          setState({
            frame,
            stream,
            status: "streaming",
          });
          publishSnapshotAliases();
        }

        animationFrameId = window.requestAnimationFrame(readFrame);
      };

      readFrame();
    } catch (error) {
      if (startVersion !== cameraStartVersion) {
        return;
      }

      setState({
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "Failed to start shared camera.",
      });
    } finally {
      if (startPromise === startPromiseRef.current) {
        startPromise = null;
      }
    }
  })();

  startPromiseRef.current = nextStartPromise;
  startPromise = nextStartPromise;
  return startPromise;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const subscribeSharedCameraDeviceState = (listener: () => void) => {
  deviceListeners.add(listener);

  return () => {
    deviceListeners.delete(listener);
  };
};

const getSnapshot = () => state;

export const getSharedLiveCameraState = () => state;

export const getSharedCameraDeviceState = () => deviceState;

export const enumerateSharedCameraDevices = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    setDeviceState({
      availableVideoDevices: [],
    });
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));

  setDeviceState({
    availableVideoDevices: videoDevices,
  });

  return videoDevices;
};

export const setSharedCameraDevice = (deviceId?: string) => {
  const normalizedDeviceId = deviceId || undefined;

  if (deviceState.selectedDeviceId === normalizedDeviceId) {
    return;
  }

  setDeviceState({
    selectedDeviceId: normalizedDeviceId,
  });

  const shouldRestart = consumers > 0 || startPromise != null;
  stopSharedCamera();

  if (shouldRestart) {
    void startSharedCamera();
  }
};

const getCaptureCanvas = () => {
  if (captureCanvas) {
    return captureCanvas;
  }

  captureCanvas = document.createElement("canvas");
  return captureCanvas;
};

const getEnvironmentSampleCanvas = () => {
  if (environmentSampleCanvas) {
    return environmentSampleCanvas;
  }

  environmentSampleCanvas = document.createElement("canvas");
  return environmentSampleCanvas;
};

const roundCaptureNumber = (value: number) => Math.round(value * 10000) / 10000;

const summarizeLiveFrame = (
  frame: LiveDetectionFrame | null,
): SharedLiveMomentFrameSummary | null => {
  if (!frame) {
    return null;
  }

  return {
    faceCount: frame.faceCount,
    handCount: frame.handCount,
    poseCount: frame.poseCount,
    expressions: Object.fromEntries(
      Object.entries(frame.expressions).map(([key, value]) => [
        key,
        roundCaptureNumber(value),
      ]),
    ),
    primaryExpression: frame.primaryExpression,
    updatedAt: frame.updatedAt,
    landmarkSamples: frame.landmarks
      .slice(0, LIVE_MOMENT_LANDMARK_SAMPLE_LIMIT)
      .map((landmark) => ({
        x: roundCaptureNumber(landmark.x),
        y: roundCaptureNumber(landmark.y),
        ...(typeof landmark.z === "number"
          ? { z: roundCaptureNumber(landmark.z) }
          : undefined),
        ...(typeof landmark.visibility === "number"
          ? { visibility: roundCaptureNumber(landmark.visibility) }
          : undefined),
        ...(landmark.region ? { region: landmark.region } : undefined),
      })),
  };
};

export const captureSharedLiveMoment =
  async (): Promise<SharedLiveMomentCapture> => {
    if (!internalVideo || state.status !== "streaming" || !state.stream) {
      throw new Error("Shared live camera is not streaming yet.");
    }

    if (internalVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("Shared live camera does not have a readable frame yet.");
    }

    const sourceWidth = internalVideo.videoWidth;
    const sourceHeight = internalVideo.videoHeight;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("Shared live camera frame has no readable dimensions.");
    }

    const scale = Math.min(
      1,
      LIVE_MOMENT_CAPTURE_MAX_EDGE / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = getCaptureCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to create a live capture canvas.");
    }

    context.drawImage(internalVideo, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", LIVE_MOMENT_CAPTURE_QUALITY),
      width,
      height,
      mimeType: "image/jpeg",
      frame: summarizeLiveFrame(state.frame),
    };
  };

export const sampleSharedLiveEnvironment =
  (): SharedLiveEnvironmentSample | null => {
    if (!internalVideo || state.status !== "streaming" || !state.stream) {
      return null;
    }

    if (internalVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const canvas = getEnvironmentSampleCanvas();
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      return null;
    }

    context.drawImage(internalVideo, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (let index = 0; index < data.length; index += 4) {
      red += data[index] ?? 0;
      green += data[index + 1] ?? 0;
      blue += data[index + 2] ?? 0;
    }

    const pixelCount = data.length / 4;
    const normalizedRed = red / pixelCount / 255;
    const normalizedGreen = green / pixelCount / 255;
    const normalizedBlue = blue / pixelCount / 255;

    return {
      red: roundCaptureNumber(normalizedRed),
      green: roundCaptureNumber(normalizedGreen),
      blue: roundCaptureNumber(normalizedBlue),
      brightness: roundCaptureNumber(
        normalizedRed * 0.299 +
          normalizedGreen * 0.587 +
          normalizedBlue * 0.114,
      ),
      sampledAt: performance.now(),
    };
  };

const acquireSharedCamera = () => {
  consumers += 1;

  if (consumers === 1) {
    void startSharedCamera();
  }
};

const releaseSharedCamera = () => {
  consumers = Math.max(consumers - 1, 0);

  if (consumers === 0) {
    stopSharedCamera();
  }
};

export const waitForSharedCameraReady = (
  timeoutMs = EXPORT_CAMERA_READY_TIMEOUT_MS,
) =>
  new Promise<SharedLiveCameraState>((resolve, reject) => {
    if (state.status === "streaming" && state.stream) {
      resolve(state);
      return;
    }

    if (state.status === "error") {
      reject(
        new Error(
          state.errorMessage ?? "Failed to start shared live camera for export.",
        ),
      );
      return;
    }

    const startedAt = performance.now();

    const unsubscribe = subscribe(() => {
      if (state.status === "streaming" && state.stream) {
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve(state);
        return;
      }

      if (state.status === "error") {
        window.clearTimeout(timeoutId);
        unsubscribe();
        reject(
          new Error(
            state.errorMessage ??
              "Failed to start shared live camera for export.",
          ),
        );
      }
    });

    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timed out waiting for shared live camera after ${Math.round(
            performance.now() - startedAt,
          )}ms.`,
        ),
      );
    }, timeoutMs);
  });

export const acquireSharedCameraForExport = async () => {
  acquireSharedCamera();

  try {
    await waitForSharedCameraReady();
    const videoElement = document.createElement("video");
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.autoplay = true;
    videoElement.preload = "auto";
    attachSharedCameraVideo(videoElement);
    await videoElement.play().catch(() => undefined);

    return {
      videoElement,
      release: () => {
        detachSharedCameraVideo(videoElement);
        releaseSharedCamera();
      },
    };
  } catch (error) {
    releaseSharedCamera();
    throw error;
  }
};

export const registerLiveAlias = (aliasId: string) => {
  aliasRefCounts.set(aliasId, (aliasRefCounts.get(aliasId) ?? 0) + 1);
  publishSnapshotAliases();
};

export const unregisterLiveAlias = (aliasId: string) => {
  const nextCount = (aliasRefCounts.get(aliasId) ?? 0) - 1;

  if (nextCount > 0) {
    aliasRefCounts.set(aliasId, nextCount);
  } else {
    aliasRefCounts.delete(aliasId);
    clearLiveExpressionSnapshot(aliasId);
  }
};

export const attachSharedCameraVideo = (videoElement: HTMLVideoElement | null) => {
  if (!videoElement) {
    return;
  }

  videoOutputs.add(videoElement);

  if (stream) {
    videoElement.srcObject = stream;
    void videoElement.play().catch(() => undefined);
  }
};

export const detachSharedCameraVideo = (videoElement: HTMLVideoElement | null) => {
  if (!videoElement) {
    return;
  }

  videoOutputs.delete(videoElement);
  videoElement.srcObject = null;
};

export const useSharedLiveCamera = (active: boolean) => {
  const liveState = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    acquireSharedCamera();

    return () => {
      releaseSharedCamera();
    };
  }, [active]);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      attachSharedCameraVideo(node);
      return;
    }

    videoOutputs.forEach((videoElement) => {
      if (!videoElement.isConnected) {
        detachSharedCameraVideo(videoElement);
      }
    });
  }, []);

  return {
    ...liveState,
    videoRef,
  };
};

export const useSharedCameraDeviceState = () =>
  useSyncExternalStore(
    subscribeSharedCameraDeviceState,
    getSharedCameraDeviceState,
    () => EMPTY_DEVICE_STATE,
  );
