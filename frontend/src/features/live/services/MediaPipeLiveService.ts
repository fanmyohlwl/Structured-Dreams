import type { LiveDetectionFrame, LiveDetector, LiveLandmarkPoint } from "../types";

type MediaPipeCategory = {
  categoryName: string;
  score: number;
};

type MediaPipeVisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>,
    ) => Promise<{
      detectForVideo: (
        video: HTMLVideoElement,
        timestampMs: number,
      ) => {
        faceLandmarks?: LiveLandmarkPoint[][];
        faceBlendshapes?: Array<{
          categories: MediaPipeCategory[];
        }>;
      };
      close?: () => void;
    }>;
  };
  HandLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>,
    ) => Promise<{
      detectForVideo: (
        video: HTMLVideoElement,
        timestampMs?: number,
      ) => {
        landmarks?: LiveLandmarkPoint[][];
        handedness?: Array<MediaPipeCategory[]>;
        handednesses?: Array<MediaPipeCategory[]>;
      };
      close?: () => void;
    }>;
  };
  PoseLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>,
    ) => Promise<{
      detectForVideo: (
        video: HTMLVideoElement,
        timestampMs: number,
      ) => {
        landmarks?: LiveLandmarkPoint[][];
      };
      close?: () => void;
    }>;
  };
};

const TASKS_VISION_IMPORT_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs";
const TASKS_VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const POSE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const annotateLandmarks = (
  landmarks: LiveLandmarkPoint[] = [],
  region: LiveLandmarkPoint["region"],
) =>
  landmarks.map((point) => ({
    ...point,
    region,
  }));

const getHandednessName = (entry?: MediaPipeCategory[]) =>
  entry?.[0]?.categoryName?.toLowerCase() ?? "";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

interface MotionPoint {
  id: string;
  x: number;
  y: number;
}

const getPoseSignalExpressions = (
  poseLandmarks: LiveLandmarkPoint[],
  handLandmarks: LiveLandmarkPoint[][],
  handednessEntries: Array<MediaPipeCategory[]>,
) => {
  const expressions: Record<string, number> = {};
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];

  if (poseLandmarks.length > 0) {
    expressions.poseDetected = 1;
    expressions.bodyDetected = 1;
  }

  if (handLandmarks.length > 0) {
    expressions.handsDetected = clamp01(handLandmarks.length / 2);
  }

  handednessEntries.forEach((entry) => {
    const handedness = getHandednessName(entry);

    if (handedness.includes("left")) {
      expressions.leftHandVisible = 1;
    }

    if (handedness.includes("right")) {
      expressions.rightHandVisible = 1;
    }
  });

  const leftArmRaised =
    leftShoulder && leftWrist && (leftShoulder.visibility ?? 1) > 0.35
      ? clamp01(leftShoulder.y - leftWrist.y + 0.5)
      : 0;
  const rightArmRaised =
    rightShoulder && rightWrist && (rightShoulder.visibility ?? 1) > 0.35
      ? clamp01(rightShoulder.y - rightWrist.y + 0.5)
      : 0;

  if (leftArmRaised > 0) {
    expressions.leftArmRaised = leftArmRaised;
  }

  if (rightArmRaised > 0) {
    expressions.rightArmRaised = rightArmRaised;
  }

  const armsRaised = Math.max(leftArmRaised, rightArmRaised);

  if (armsRaised > 0) {
    expressions.armsRaised = armsRaised;
    expressions.handsAboveShoulders = armsRaised;
  }

  return expressions;
};

const mergeExpressions = (...entries: Array<Record<string, number>>) =>
  entries.reduce<Record<string, number>>(
    (result, entry) => ({
      ...result,
      ...entry,
    }),
    {},
  );

const getMotionPoints = ({
  handLandmarks,
  handednessEntries,
  poseLandmarks,
}: {
  handLandmarks: LiveLandmarkPoint[][];
  handednessEntries: Array<MediaPipeCategory[]>;
  poseLandmarks: LiveLandmarkPoint[];
}) => {
  const motionPoints = handLandmarks
    .map((landmarks, index) => {
      const wrist = landmarks[0];

      if (!wrist) {
        return null;
      }

      const handedness = getHandednessName(handednessEntries[index]);

      return {
        id: handedness || `hand_${index}`,
        x: wrist.x,
        y: wrist.y,
      } satisfies MotionPoint;
    })
    .filter((entry): entry is MotionPoint => entry != null);

  if (motionPoints.length > 0) {
    return motionPoints;
  }

  const poseMotionPoints: MotionPoint[] = [];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];

  if (leftWrist && (leftWrist.visibility ?? 1) > 0.35) {
    poseMotionPoints.push({
      id: "pose_left_wrist",
      x: leftWrist.x,
      y: leftWrist.y,
    });
  }

  if (rightWrist && (rightWrist.visibility ?? 1) > 0.35) {
    poseMotionPoints.push({
      id: "pose_right_wrist",
      x: rightWrist.x,
      y: rightWrist.y,
    });
  }

  return poseMotionPoints;
};

export class MediaPipeLiveService {
  async createHolisticDetector(sourceId: string): Promise<LiveDetector> {
    // Real MediaPipe connection points:
    // - move import/model URLs into env/config when wiring production setup
    // - add API keys or signed URLs here if models/assets become protected
    // - keep this module isolated so editor UI and canvas rendering don't need refactors
    const mediaPipe = (await import(
      /* @vite-ignore */ TASKS_VISION_IMPORT_URL
    )) as MediaPipeVisionModule;
    const vision = await mediaPipe.FilesetResolver.forVisionTasks(
      TASKS_VISION_WASM_URL,
    );

    const [faceResult, handResult, poseResult] = await Promise.allSettled([
      mediaPipe.FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
      mediaPipe.HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      }),
      mediaPipe.PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_LANDMARKER_MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    ]);

    const faceLandmarker = faceResult.status === "fulfilled" ? faceResult.value : null;
    const handLandmarker = handResult.status === "fulfilled" ? handResult.value : null;
    const poseLandmarker = poseResult.status === "fulfilled" ? poseResult.value : null;

    if (!faceLandmarker && !handLandmarker && !poseLandmarker) {
      throw new Error("MediaPipe detectors could not be initialized.");
    }

    let previousMotionPoints = new Map<string, MotionPoint>();
    let smoothedHandMotion = 0;

    return {
      detect(video, timestampMs): LiveDetectionFrame {
        const faceOutput = faceLandmarker?.detectForVideo(video, timestampMs);
        const handOutput = handLandmarker?.detectForVideo(video, timestampMs);
        const poseOutput = poseLandmarker?.detectForVideo(video, timestampMs);

        const faceLandmarks = faceOutput?.faceLandmarks?.[0] ?? [];
        const faceBlendshapes = faceOutput?.faceBlendshapes?.[0]?.categories ?? [];
        const handLandmarks = handOutput?.landmarks ?? [];
        const handednessEntries =
          handOutput?.handedness ?? handOutput?.handednesses ?? [];
        const poseLandmarks = poseOutput?.landmarks?.[0] ?? [];

        const faceExpressions = Object.fromEntries(
          faceBlendshapes.map((entry) => [entry.categoryName, entry.score]),
        );
        const smile =
          ((faceExpressions.mouthSmileLeft ?? 0) + (faceExpressions.mouthSmileRight ?? 0)) / 2;

        if (smile > 0) {
          faceExpressions.smile = smile;
        }

        const poseExpressions = getPoseSignalExpressions(
          poseLandmarks,
          handLandmarks,
          handednessEntries,
        );
        const motionPoints = getMotionPoints({
          handLandmarks,
          handednessEntries,
          poseLandmarks,
        });
        const nextMotionPoints = new Map<string, MotionPoint>();
        let frameMotion = 0;

        motionPoints.forEach((point) => {
          const previousPoint = previousMotionPoints.get(point.id);

          if (previousPoint) {
            const deltaX = point.x - previousPoint.x;
            const deltaY = point.y - previousPoint.y;
            frameMotion = Math.max(
              frameMotion,
              Math.sqrt(deltaX * deltaX + deltaY * deltaY),
            );
          }

          nextMotionPoints.set(point.id, point);
        });

        previousMotionPoints = nextMotionPoints;
        smoothedHandMotion = clamp01(
          smoothedHandMotion * 0.7 + frameMotion * 8 * 0.3,
        );

        const motionExpressions: Record<string, number> = {};

        if (smoothedHandMotion > 0.01) {
          motionExpressions.handMotion = smoothedHandMotion;
        }
        const expressions = mergeExpressions(
          faceExpressions,
          poseExpressions,
          motionExpressions,
        );
        const primaryExpressionEntry = Object.entries(expressions).sort(
          (left, right) => right[1] - left[1],
        )[0];

        return {
          sourceId,
          faceCount: faceLandmarks.length > 0 ? 1 : 0,
          handCount: handLandmarks.length,
          poseCount: poseLandmarks.length > 0 ? 1 : 0,
          landmarks: [
            ...annotateLandmarks(faceLandmarks, "face"),
            ...handLandmarks.flatMap((landmarks) => annotateLandmarks(landmarks, "hand")),
            ...annotateLandmarks(poseLandmarks, "pose"),
          ],
          expressions,
          primaryExpression:
            primaryExpressionEntry && primaryExpressionEntry[1] > 0.2
              ? primaryExpressionEntry[0]
              : undefined,
          updatedAt: Date.now(),
        };
      },
      dispose() {
        faceLandmarker?.close?.();
        handLandmarker?.close?.();
        poseLandmarker?.close?.();
      },
    };
  }
}

export const mediaPipeLiveService = new MediaPipeLiveService();
