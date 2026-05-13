export const liveSignalKeys = [
  "smile",
  "mouthSmileLeft",
  "mouthSmileRight",
  "jawOpen",
  "browInnerUp",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "handMotion",
  "handsDetected",
  "leftHandVisible",
  "rightHandVisible",
  "leftArmRaised",
  "rightArmRaised",
  "armsRaised",
  "handsAboveShoulders",
  "poseDetected",
  "bodyDetected",
] as const;

export type LiveSignalKey = (typeof liveSignalKeys)[number];

export const liveSignalKeySet = new Set<string>(liveSignalKeys);

export const normalizeLiveSignalKey = (
  signalKey: string | undefined,
  fallback: LiveSignalKey = "smile",
) =>
  signalKey && liveSignalKeySet.has(signalKey)
    ? (signalKey as LiveSignalKey)
    : fallback;
