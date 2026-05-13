import { liveSignalKeys } from "./liveSignalRegistry";

const liveSignalLabels: Record<(typeof liveSignalKeys)[number], string> = {
  smile: "Smile",
  mouthSmileLeft: "Mouth Smile Left",
  mouthSmileRight: "Mouth Smile Right",
  jawOpen: "Jaw Open",
  browInnerUp: "Brow Inner Up",
  eyeBlinkLeft: "Eye Blink Left",
  eyeBlinkRight: "Eye Blink Right",
  handMotion: "Hand Motion",
  handsDetected: "Hands Detected",
  leftHandVisible: "Left Hand Visible",
  rightHandVisible: "Right Hand Visible",
  leftArmRaised: "Left Arm Raised",
  rightArmRaised: "Right Arm Raised",
  armsRaised: "Arms Raised",
  handsAboveShoulders: "Hands Above Shoulders",
  poseDetected: "Pose Detected",
  bodyDetected: "Body Detected",
};

export const expressionOptions = liveSignalKeys.map((value) => ({
  value,
  label: liveSignalLabels[value],
}));
