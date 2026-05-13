import type {
  OrchestrationPlan,
  OrchestrationPlanBlockOp,
  OrchestrationPlannedBlock,
  OrchestratorResponse,
} from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRect = (value: unknown) =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.width) &&
  isFiniteNumber(value.height);

const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isImageIntent = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.targetSlotId === "string" &&
  (value.targetBlockId === undefined || typeof value.targetBlockId === "string") &&
  typeof value.subject === "string" &&
  typeof value.mood === "string" &&
  typeof value.composition === "string" &&
  typeof value.colorIntent === "string" &&
  typeof value.styleHint === "string" &&
  (value.abstractionLevel === "literal" ||
    value.abstractionLevel === "stylized" ||
    value.abstractionLevel === "abstract") &&
  isFiniteNumber(value.priority) &&
  (value.avoid === undefined || isStringArray(value.avoid)) &&
  (value.referenceIds === undefined || isStringArray(value.referenceIds));

const isTypographyAdjustment = (value: unknown) =>
  isRecord(value) &&
  typeof value.targetSlotId === "string" &&
  (value.targetBlockId === undefined || typeof value.targetBlockId === "string") &&
  typeof value.textRole === "string" &&
  (value.fontCategory === "serif" ||
    value.fontCategory === "sans" ||
    value.fontCategory === "mono" ||
    value.fontCategory === "display" ||
    value.fontCategory === "script" ||
    value.fontCategory === "system") &&
  (value.fontPreset === undefined || typeof value.fontPreset === "string") &&
  (value.fontId === undefined || typeof value.fontId === "string") &&
  (value.fontFamily === undefined || typeof value.fontFamily === "string") &&
  (value.fontSource === undefined ||
    value.fontSource === "preset" ||
    value.fontSource === "local" ||
    value.fontSource === "online") &&
  (value.fontWeight === undefined ||
    typeof value.fontWeight === "string" ||
    isFiniteNumber(value.fontWeight)) &&
  (value.fontSizeScale === undefined || isFiniteNumber(value.fontSizeScale)) &&
  (value.letterSpacing === undefined || isFiniteNumber(value.letterSpacing)) &&
  (value.lineHeight === undefined || isFiniteNumber(value.lineHeight)) &&
  (value.alignment === undefined ||
    value.alignment === "left" ||
    value.alignment === "center" ||
    value.alignment === "right") &&
  (value.textColor === undefined || typeof value.textColor === "string") &&
  (value.backgroundColor === undefined ||
    value.backgroundColor === null ||
    typeof value.backgroundColor === "string") &&
  (value.rationale === undefined || typeof value.rationale === "string");

const isDesignCritique = (value: unknown) =>
  isRecord(value) &&
  (value.readabilityScore === undefined || isFiniteNumber(value.readabilityScore)) &&
  (value.hierarchyScore === undefined || isFiniteNumber(value.hierarchyScore)) &&
  (value.brandAlignmentScore === undefined ||
    isFiniteNumber(value.brandAlignmentScore)) &&
  isStringArray(value.warnings) &&
  isStringArray(value.suggestions);

const isMediaGenerationSpec = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.intentId === undefined || typeof value.intentId === "string") &&
  typeof value.targetSlotId === "string" &&
  (value.targetBlockId === undefined || typeof value.targetBlockId === "string") &&
  (value.mediaType === "image" || value.mediaType === "video") &&
  (value.imageIntent === undefined || isImageIntent(value.imageIntent)) &&
  (value.compiledPrompt === undefined || typeof value.compiledPrompt === "string") &&
  (value.outputSize === undefined ||
    (isRecord(value.outputSize) &&
      isFiniteNumber(value.outputSize.width) &&
      isFiniteNumber(value.outputSize.height))) &&
  (value.format === undefined ||
    value.format === "png" ||
    value.format === "jpeg" ||
    value.format === "webp") &&
  (value.background === undefined ||
    value.background === "transparent" ||
    value.background === "solid") &&
    (value.referenceAssetIds === undefined || isStringArray(value.referenceAssetIds)) &&
  (value.metadata === undefined || isRecord(value.metadata)) &&
  isFiniteNumber(value.priority) &&
  (value.status === undefined ||
    value.status === "planned" ||
    value.status === "queued" ||
    value.status === "skipped") &&
  (value.rationale === undefined || typeof value.rationale === "string");

const isLiveArtDirection = (value: unknown) =>
  isRecord(value) &&
  typeof value.summary === "string" &&
  isStringArray(value.observations) &&
  isStringArray(value.primarySignals) &&
  typeof value.direction === "string" &&
  (value.colorStrategy === undefined || typeof value.colorStrategy === "string") &&
  (value.motionStrategy === undefined || typeof value.motionStrategy === "string") &&
  (value.imageRegenerationStrategy === undefined ||
    typeof value.imageRegenerationStrategy === "string") &&
  isStringArray(value.warnings);

const isLiveMappingPatch = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.targetSlotId === undefined || typeof value.targetSlotId === "string") &&
  (value.targetBlockId === undefined || typeof value.targetBlockId === "string") &&
  (value.mappingType === "canvas-color" ||
    value.mappingType === "block-color" ||
    value.mappingType === "image-layout" ||
    value.mappingType === "text-typography" ||
    value.mappingType === "live-visual") &&
  typeof value.signalKey === "string" &&
  isFiniteNumber(value.intensity) &&
  typeof value.rationale === "string";

const isDecorativeOp = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.type === "duplicate-text" ||
    value.type === "duplicate-image" ||
    value.type === "create-pattern" ||
    value.type === "image-slice") &&
  (value.sourceSlotId === undefined || typeof value.sourceSlotId === "string") &&
  (value.sourceBlockId === undefined || typeof value.sourceBlockId === "string") &&
  (value.targetFrame === undefined || isRect(value.targetFrame)) &&
  (value.count === undefined || isFiniteNumber(value.count)) &&
  typeof value.treatment === "string" &&
  (value.patternType === undefined ||
    value.patternType === "halftone" ||
    value.patternType === "dither" ||
    value.patternType === "line-specimen" ||
    value.patternType === "checker" ||
    value.patternType === "stripe" ||
    value.patternType === "dot-grid") &&
  typeof value.rationale === "string" &&
  isFiniteNumber(value.riskLevel);

const isPlannedBlock = (value: unknown): value is OrchestrationPlannedBlock => {
  if (!isRecord(value) || !isRect(value.frame) || typeof value.id !== "string") {
    return false;
  }

  if (
    value.type !== "text" &&
    value.type !== "image" &&
    value.type !== "ai-generation" &&
    value.type !== "live" &&
    value.type !== "pattern"
  ) {
    return false;
  }

  return isRecord(value.data);
};

const isBlockOp = (value: unknown): value is OrchestrationPlanBlockOp => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "replace-linked-blocks") {
    return (
      typeof value.slotId === "string" &&
      Array.isArray(value.blocks) &&
      value.blocks.every(isPlannedBlock)
    );
  }

  if (value.type === "update") {
    return typeof value.blockId === "string" && isRecord(value.patch);
  }

  if (value.type === "delete") {
    return typeof value.blockId === "string";
  }

  return false;
};

export const validateOrchestrationPlan = (
  value: unknown,
): value is OrchestrationPlan => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.planId === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.slotLinks) &&
    value.slotLinks.every(
      (link) =>
        isRecord(link) &&
        typeof link.slotId === "string" &&
        Array.isArray(link.linkedBlockIds) &&
        link.linkedBlockIds.every((blockId) => typeof blockId === "string"),
    ) &&
    Array.isArray(value.blockOps) &&
    value.blockOps.every(isBlockOp) &&
    Array.isArray(value.blockPatches) &&
    value.blockPatches.every(
      (patch) =>
        isRecord(patch) &&
        typeof patch.blockId === "string" &&
        isRecord(patch.patch),
    ) &&
    Array.isArray(value.imageIntents) &&
    value.imageIntents.every(isImageIntent) &&
    Array.isArray(value.typographyAdjustments) &&
    value.typographyAdjustments.every(isTypographyAdjustment) &&
    (value.mediaGenerationSpecs === undefined ||
      (Array.isArray(value.mediaGenerationSpecs) &&
        value.mediaGenerationSpecs.every(isMediaGenerationSpec))) &&
    (value.liveArtDirection === undefined ||
      isLiveArtDirection(value.liveArtDirection)) &&
    (value.liveMappingPatches === undefined ||
      (Array.isArray(value.liveMappingPatches) &&
        value.liveMappingPatches.every(isLiveMappingPatch))) &&
    (value.decorativeOps === undefined ||
      (Array.isArray(value.decorativeOps) &&
        value.decorativeOps.every(isDecorativeOp))) &&
    isDesignCritique(value.critique) &&
    Array.isArray(value.generationRequests) &&
    value.generationRequests.every(
      (request) =>
        isRecord(request) &&
        typeof request.slotId === "string" &&
        typeof request.targetBlockId === "string" &&
        (request.mode === "image" || request.mode === "video") &&
        typeof request.prompt === "string" &&
        typeof request.reason === "string" &&
        isRecord(request.outputHint) &&
        isRect(request.outputHint.frame),
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
};

export const validateOrchestratorResponse = (
  value: unknown,
): value is OrchestratorResponse =>
  isRecord(value) &&
  validateOrchestrationPlan(value.plan) &&
  (value.appliedGenerationRequests === undefined ||
    (Array.isArray(value.appliedGenerationRequests) &&
      value.appliedGenerationRequests.every(
        (request) =>
          isRecord(request) &&
          typeof request.slotId === "string" &&
          typeof request.targetBlockId === "string",
      ))) &&
  (value.meta === undefined ||
    (isRecord(value.meta) &&
      typeof value.meta.providerId === "string" &&
      (value.meta.runMode === "plan" ||
        value.meta.runMode === "refresh" ||
        value.meta.runMode === "live-direction"))) &&
  (value.warnings === undefined ||
    (Array.isArray(value.warnings) &&
      value.warnings.every((warning) => typeof warning === "string")));
