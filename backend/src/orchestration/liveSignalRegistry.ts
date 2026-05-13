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
export type LiveSignalGroup = "expression" | "motion" | "pose" | "environment";

export const liveSignalKeySet = new Set<string>(liveSignalKeys);

export const getLiveSignalGroup = (
  signalKey?: string,
): LiveSignalGroup => {
  switch (signalKey) {
    case "smile":
    case "mouthSmileLeft":
    case "mouthSmileRight":
    case "jawOpen":
    case "browInnerUp":
    case "eyeBlinkLeft":
    case "eyeBlinkRight":
      return "expression";
    case "handMotion":
    case "handsDetected":
    case "leftHandVisible":
    case "rightHandVisible":
      return "motion";
    case "leftArmRaised":
    case "rightArmRaised":
    case "armsRaised":
    case "handsAboveShoulders":
    case "poseDetected":
    case "bodyDetected":
      return "pose";
    default:
      return "environment";
  }
};

export const getFallbackLiveSignalKey = (
  mappingType?: string,
): LiveSignalKey => {
  if (mappingType === "image-layout" || mappingType === "live-visual") {
    return "handMotion";
  }

  if (mappingType === "text-typography") {
    return "smile";
  }

  return "smile";
};
