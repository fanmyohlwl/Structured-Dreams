import type { StoredDesignDocument } from "../../documents/types.js";
import type {
  ImageIntent,
  LayoutContextSummary,
  MediaGenerationSpec,
  VisualStyleProfile,
} from "../../orchestration/types.js";
import type {
  AIGenerationBackground,
  AIGenerationImageFormat,
  AIGenerationReferenceAsset,
  ProviderCapabilities,
  Size,
} from "../types.js";

type SemanticBrief = StoredDesignDocument["semanticBrief"];
type SemanticReferenceItem = NonNullable<
  NonNullable<SemanticBrief>["references"]
>[number];

export interface PromptBuilderOutputConstraints {
  outputSize: Size;
  format?: AIGenerationImageFormat;
  background?: AIGenerationBackground;
}

export interface PromptBuilderInput {
  imageIntent: ImageIntent;
  semanticBrief?: SemanticBrief;
  references: SemanticReferenceItem[];
  providerCapabilities: ProviderCapabilities;
  outputConstraints: PromptBuilderOutputConstraints;
  liveContextGuidance?: string;
  transientReferenceAssets?: AIGenerationReferenceAsset[];
  fuseCapturedPortrait?: boolean;
  visualStyleProfiles?: VisualStyleProfile[];
  layoutContext?: LayoutContextSummary;
}

export interface PromptBuilderOutput {
  finalPrompt: string;
  negativeText?: string;
  selectedReferenceAssetIds: string[];
  referenceAssets: AIGenerationReferenceAsset[];
  mediaGenerationSpec: MediaGenerationSpec;
  warnings: string[];
}

const truncate = (value: string | undefined, maxLength = 220) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
};

const describeReference = (reference: SemanticReferenceItem) =>
  [
    reference.title,
    reference.type === "url" ? reference.url : undefined,
    reference.fileName,
    truncate(reference.description, 180),
  ]
    .filter(Boolean)
    .join(" - ");

const isImageReference = (reference: SemanticReferenceItem) =>
  reference.type === "image" && Boolean(reference.src);

const describeVisualStyleProfile = (profile: VisualStyleProfile) =>
  [
    `Style profile: ${profile.title}`,
    truncate(profile.summary, 180)
      ? `Summary: ${truncate(profile.summary, 180)}`
      : undefined,
    truncate(profile.composition, 180)
      ? `Composition logic: ${truncate(profile.composition, 180)}`
      : undefined,
    truncate(profile.typography, 160)
      ? `Typography contrast: ${truncate(profile.typography, 160)}`
      : undefined,
    truncate(profile.color, 140)
      ? `Color system: ${truncate(profile.color, 140)}`
      : undefined,
    truncate(profile.imageTreatment, 160)
      ? `Image treatment: ${truncate(profile.imageTreatment, 160)}`
      : undefined,
    profile.spatialRules.length > 0
      ? `Spatial rules: ${profile.spatialRules.slice(0, 4).join("; ")}`
      : undefined,
    profile.layoutRules.length > 0
      ? `Layout rules: ${profile.layoutRules.slice(0, 4).join("; ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

const createReferenceAsset = (
  reference: SemanticReferenceItem,
): AIGenerationReferenceAsset | null => {
  if (!reference.src) {
    return null;
  }

  return {
    assetId: reference.assetId ?? reference.id,
    url: reference.src,
    mimeType: reference.mimeType,
  };
};

const summarizeFrame = (frame: { x: number; y: number; width: number; height: number }) =>
  `x${Math.round(frame.x)} y${Math.round(frame.y)} ${Math.round(frame.width)}x${Math.round(frame.height)}`;

const describeLayoutContext = (layoutContext?: LayoutContextSummary) => {
  if (!layoutContext) {
    return {
      lines: [] as string[],
      negativeTerms: [] as string[],
      warnings: [] as string[],
    };
  }

  const lines: string[] = ["Layout-aware composition guidance:"];
  const negativeTerms: string[] = [];
  const warnings: string[] = [];
  const targetSlot = layoutContext.targetSlot;

  if (targetSlot) {
    lines.push(
      `- Target semantic role: ${targetSlot.role}; frame ${summarizeFrame(targetSlot.frame)}${targetSlot.contentType ? `; content type ${targetSlot.contentType}` : ""}.`,
    );
  }

  const neighborLines = layoutContext.neighbors.slice(0, 6).map((neighbor) =>
    [
      neighbor.role ?? neighbor.blockType,
      neighbor.relation,
      summarizeFrame(neighbor.frame),
      neighbor.locked ? "locked" : undefined,
    ]
      .filter(Boolean)
      .join(" / "),
  );

  if (neighborLines.length) {
    lines.push(`- Neighboring semantic/visual areas: ${neighborLines.join("; ")}.`);
  }

  const occupiedLines = layoutContext.occupiedRegions.slice(0, 5).map((region) =>
    `${region.sourceType} ${region.sourceId} at ${summarizeFrame(region.frame)} (${truncate(region.note, 90) ?? "occupied visual field"})`,
  );

  if (occupiedLines.length) {
    lines.push(`- Occupied visual regions: ${occupiedLines.join("; ")}.`);
  }

  const avoidLines = layoutContext.avoidRegions.slice(0, 5).map((region) =>
    `${summarizeFrame(region.frame)}: ${truncate(region.reason, 100) ?? "avoid competing with this area"}`,
  );

  if (avoidLines.length) {
    lines.push(`- Avoid regions: ${avoidLines.join("; ")}.`);
  }

  const hasPatternOccupancy = layoutContext.occupiedRegions.some(
    (region) => region.sourceType === "pattern",
  );
  const targetOverlapsPattern = layoutContext.avoidRegions.some((region) =>
    region.reason.toLowerCase().includes("texture"),
  );

  if (hasPatternOccupancy) {
    lines.push(
      "- Avoid repeating nearby decorative texture; keep this generated image composition distinct from pattern, halftone, stripe, checker, or specimen layers already occupying the poster.",
    );
    negativeTerms.push(
      "duplicate halftone texture",
      "repeated decorative pattern field",
      "competing texture layer",
      "duplicate collage field",
    );
  }

  if (targetOverlapsPattern) {
    warnings.push(
      "Target slot overlaps decorative pattern field; prompt included texture-avoidance guidance.",
    );
  }

  if (layoutContext.neighbors.some((neighbor) => neighbor.blockType === "text")) {
    lines.push(
      "- Respect neighboring headline/body regions; do not create a competing central text-like focal area inside the image.",
    );
    negativeTerms.push("text-like focal point competing with headline");
  }

  return { lines, negativeTerms, warnings };
};

export class PromptBuilder {
  buildImagePrompt({
    imageIntent,
    semanticBrief,
    references,
    providerCapabilities,
    outputConstraints,
    liveContextGuidance,
    transientReferenceAssets,
    fuseCapturedPortrait,
    visualStyleProfiles,
    layoutContext,
  }: PromptBuilderInput): PromptBuilderOutput {
    const warnings: string[] = [];
    const allowedReferenceIds = new Set(imageIntent.referenceIds ?? []);
    const selectedReferences = references.filter((reference) =>
      allowedReferenceIds.size > 0 ? allowedReferenceIds.has(reference.id) : false,
    );
    const textualReferences = selectedReferences
      .map(describeReference)
      .filter(Boolean);
    const referenceAssets = providerCapabilities.supportsReferenceImages
      ? selectedReferences
          .filter(isImageReference)
          .map(createReferenceAsset)
          .filter(
            (referenceAsset): referenceAsset is AIGenerationReferenceAsset =>
              referenceAsset != null,
          )
      : [];

    if (!providerCapabilities.supportsReferenceImages) {
      const imageReferenceCount = selectedReferences.filter(isImageReference).length;
      const transientReferenceCount = transientReferenceAssets?.length ?? 0;

      if (imageReferenceCount > 0 || transientReferenceCount > 0) {
        warnings.push(
          "Provider used live moment as text guidance only because it does not support reference images.",
        );
      }
    } else {
      const unsupportedImageReferenceCount = selectedReferences.filter(
        (reference) => reference.type === "image" && !reference.src,
      ).length;

      if (unsupportedImageReferenceCount > 0) {
        warnings.push(
          "Some image references did not include a usable source and were omitted.",
        );
      }
    }

    if (
      outputConstraints.background === "transparent" &&
      !providerCapabilities.supportsTransparentBackground
    ) {
      warnings.push(
        "Provider does not support transparent backgrounds; background was requested as provider default.",
      );
    }

    const briefContext = [
      semanticBrief?.brandName ? `Brand: ${semanticBrief.brandName}` : undefined,
      semanticBrief?.campaignGoal
        ? `Campaign goal: ${truncate(semanticBrief.campaignGoal, 180)}`
        : undefined,
      semanticBrief?.audience ? `Audience: ${semanticBrief.audience}` : undefined,
      semanticBrief?.toneKeywords?.length
        ? `Tone keywords: ${semanticBrief.toneKeywords.slice(0, 5).join(", ")}`
        : undefined,
    ].filter(Boolean);
    const intentLines = [
      `Subject: ${imageIntent.subject}`,
      `Mood: ${imageIntent.mood}`,
      `Composition: ${imageIntent.composition}`,
      `Color intent: ${imageIntent.colorIntent}`,
      `Style: ${imageIntent.styleHint}`,
      `Abstraction: ${imageIntent.abstractionLevel}`,
      `Output size: ${outputConstraints.outputSize.width}x${outputConstraints.outputSize.height}`,
      outputConstraints.format ? `Format: ${outputConstraints.format}` : undefined,
      outputConstraints.background
        ? `Background: ${outputConstraints.background}`
        : undefined,
    ].filter(Boolean);
    const referenceLines = textualReferences.length
      ? [`Reference context:`, ...textualReferences.map((reference) => `- ${reference}`)]
      : [];
    const visualStyleLines = visualStyleProfiles?.length
      ? [
          "Visual style profile guidance (composition reference only, not content reference):",
          ...visualStyleProfiles
            .slice(0, 4)
            .map((profile) => describeVisualStyleProfile(profile)),
          "Emulate grid rhythm, hierarchy, density, spacing logic, typography contrast, color system, and image treatment. Do not copy exact poster/image content.",
        ]
      : [];
    const transientReferenceLines = transientReferenceAssets?.length
      ? [
          "Transient visual references supplied separately to the provider:",
          ...transientReferenceAssets.map((asset) => {
            const role =
              asset.role === "live-capture"
                ? "live camera capture"
                : asset.role === "previous-ai-result"
                  ? "previous AI result"
                  : "visual reference";

            return `- ${role}${asset.mimeType ? ` (${asset.mimeType})` : ""}`;
          }),
        ]
      : [];
    const liveContextLines = liveContextGuidance
      ? [
          liveContextGuidance,
          fuseCapturedPortrait
            ? "Regenerate the visual with live-responsive energy while preserving the original semantic slot, brand intent, composition role, and layout frame. The captured portrait may guide character identity or portrait treatment when useful."
            : "Regenerate the visual with live-responsive energy while preserving the original semantic slot, brand intent, composition role, and layout frame. Use expression, action, lighting, and environment as abstract direction only; do not copy the captured person's face or identity.",
        ]
      : [];
    const layoutGuidance = describeLayoutContext(layoutContext);
    warnings.push(...layoutGuidance.warnings);

    const finalPrompt = [
      "Create a brand-ready visual for the specified semantic slot.",
      ...briefContext,
      ...intentLines,
      ...visualStyleLines,
      ...referenceLines,
      ...transientReferenceLines,
      ...liveContextLines,
      ...layoutGuidance.lines,
      "Respect the existing layout frame; do not add text unless explicitly required by the subject.",
    ].join("\n");
    const portraitProtectionAvoids =
      liveContextGuidance && fuseCapturedPortrait !== true
        ? [
            "do not copy the captured person's face",
            "do not reproduce facial likeness",
            "do not identify or depict the captured real person",
            "use expression/action/environment as abstract direction only",
          ]
        : [];
    const negativeTerms = [
      ...(imageIntent.avoid ?? []),
      ...(semanticBrief?.avoidKeywords ?? []),
      ...(visualStyleProfiles ?? []).flatMap((profile) => profile.avoid),
      ...(visualStyleProfiles?.length
        ? ["do not copy exact reference image", "do not copy exact poster content"]
        : []),
      ...layoutGuidance.negativeTerms,
      ...portraitProtectionAvoids,
    ].filter((term, index, allTerms) => term && allTerms.indexOf(term) === index);
    const negativeText = negativeTerms.length ? negativeTerms.join(", ") : undefined;

    return {
      finalPrompt,
      negativeText,
      selectedReferenceAssetIds: referenceAssets
        .map((asset) => asset.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
      referenceAssets,
      mediaGenerationSpec: {
        id: `compiled_${imageIntent.id}`,
        intentId: imageIntent.id,
        targetSlotId: imageIntent.targetSlotId,
        targetBlockId: imageIntent.targetBlockId,
        mediaType: "image",
        imageIntent,
        compiledPrompt: finalPrompt,
        outputSize: outputConstraints.outputSize,
        format: outputConstraints.format,
        background: outputConstraints.background,
        metadata: layoutContext ? { layoutContext } : undefined,
        referenceAssetIds: referenceAssets
          .map((asset) => asset.assetId)
          .filter((assetId): assetId is string => Boolean(assetId)),
        priority: imageIntent.priority,
      },
      warnings,
    };
  }
}
