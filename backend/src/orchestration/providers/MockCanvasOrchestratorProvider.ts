import type { StoredDesignDocument } from "../../documents/types.js";
import type { CanvasOrchestratorProvider } from "./CanvasOrchestratorProvider.js";
import type {
  BuildAgentProfileRequest,
  BuildAgentProfileResponse,
  ImageIntent,
  MediaGenerationSpec,
  OrchestrationPlan,
  OrchestrationPlannedBlock,
  TypographyAdjustment,
  OrchestratorRequest,
  OrchestratorResponse,
} from "../types.js";
import { semanticTypographyPresets } from "../semanticTypographyPresets.js";
import {
  sanitizeAgentProfile,
  createDefaultAgentProfile,
} from "./OpenAIOrchestratorProvider.js";

const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const createImageAssetFromSlotSource = (
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
) => {
  const source = slot.content.trim();

  if (
    !source ||
    (!source.startsWith("data:image/") &&
      !source.startsWith("http://") &&
      !source.startsWith("https://") &&
      !source.startsWith("/api/assets/"))
  ) {
    return null;
  }

  return {
    assetId: `${slot.id}_reference_asset`,
    kind: "raster" as const,
    src: source,
    mimeType: source.startsWith("data:image/")
      ? source.slice(5, source.indexOf(";")) || "image/png"
      : "image/png",
    fileName: `${slot.name || "semantic-image-reference"}.png`,
  };
};

const getHeadlineCopy = (document: StoredDesignDocument, slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number]) =>
  slot.content ||
  document.semanticBrief?.mustIncludeCopy?.[0] ||
  document.semanticBrief?.brandName ||
  "Campaign Headline";

const getBodyCopy = (document: StoredDesignDocument, slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number]) =>
  slot.content ||
  document.semanticBrief?.campaignGoal ||
  document.semanticBrief?.designNotes ||
  "Describe the main idea, product value, or campaign message here.";

const resolveBackgroundColor = (document: StoredDesignDocument) => {
  const toneKeywords = document.semanticBrief?.toneKeywords?.map((keyword) =>
    keyword.toLowerCase(),
  ) ?? [];

  if (toneKeywords.some((keyword) => ["luxury", "editorial", "warm"].includes(keyword))) {
    return "#f5ebde";
  }

  if (toneKeywords.some((keyword) => ["tech", "cool", "digital"].includes(keyword))) {
    return "#e6efff";
  }

  if (toneKeywords.some((keyword) => ["nature", "organic", "fresh"].includes(keyword))) {
    return "#eaf5eb";
  }

  return document.canvas.backgroundColor;
};

const inferRatioMode = (frame: { width: number; height: number }) => {
  const ratio = frame.width / Math.max(frame.height, 1);

  if (ratio > 1.55) {
    return "16:9" as const;
  }

  if (ratio > 1.2) {
    return "4:3" as const;
  }

  if (ratio < 0.7) {
    return "9:16" as const;
  }

  if (ratio < 0.9) {
    return "3:4" as const;
  }

  return "follow-block" as const;
};

const inferSlotKind = (
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
) => {
  if (slot.slotKind) {
    return slot.slotKind;
  }

  if (slot.contentType === "ai-video") {
    return "ai-video" as const;
  }

  if (slot.contentType === "ai-image") {
    return "ai-image" as const;
  }

  if (slot.contentType === "live" || slot.preferredBlockType === "live") {
    return "live" as const;
  }

  if (slot.contentType === "image" || slot.preferredBlockType === "image") {
    return "image" as const;
  }

  if (slot.preferredBlockType === "ai-generation" || slot.allowAIGeneration) {
    return "ai-image" as const;
  }

  return "text" as const;
};

const createTextBlock = (
  id: string,
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
  content: string,
  fontSize: number,
): OrchestrationPlannedBlock => ({
  id,
  type: "text",
  name: `${slot.name} Text`,
  frame: slot.frame,
  showBorder: true,
  data: {
    content,
    fontFamily: "Georgia, Times New Roman, serif",
    fontSize,
    fontWeight: slot.role === "headline" ? 700 : 500,
    textColor: "#111827",
    backgroundColor: null,
    padding: 0,
    textAlign:
      slot.role === "headline" || slot.role === "subheadline" ? "left" : "left",
    letterSpacing: slot.role === "headline" ? -0.8 : 0,
    lineHeight: slot.role === "headline" ? 0.88 : 1.05,
  },
});

const buildFallbackImagePlaceholder = (
  document: StoredDesignDocument,
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
) => {
  const toneKeywords = document.semanticBrief?.toneKeywords?.slice(0, 2) ?? [];
  const fragments = [
    slot.visualIntent || slot.content || slot.name,
    `Role: ${slot.role}`,
    toneKeywords.length ? `Tone: ${toneKeywords.join(", ")}` : undefined,
  ].filter(Boolean);

  return fragments.length > 0
    ? fragments.join(". ")
    : `A focused visual for the ${slot.role} area.`;
};

const createImageIntent = (
  blockId: string,
  document: StoredDesignDocument,
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
): ImageIntent => ({
  id: `${slot.id}_intent`,
  targetSlotId: slot.id,
  targetBlockId: blockId,
  subject: slot.content || slot.visualIntent || `${slot.role} visual`,
  mood: document.semanticBrief?.toneKeywords?.slice(0, 2).join(", ") || "focused",
  composition: `Fit the existing ${slot.role} slot without changing its frame.`,
  colorIntent: "Use colors that support the canvas and brand direction.",
  styleHint: slot.visualIntent || "Brand-aware campaign visual",
  abstractionLevel: "stylized",
  priority: slot.priority,
  avoid: document.semanticBrief?.avoidKeywords ?? [],
  referenceIds: document.semanticBrief?.references?.map((reference) => reference.id) ?? [],
});

const createTypographyAdjustment = (
  blockId: string,
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
): TypographyAdjustment => {
  const preset =
    slot.role === "headline"
      ? semanticTypographyPresets.find((item) => item.id === "compressed-poster")
      : semanticTypographyPresets.find((item) => item.id === "editorial-serif");

  return {
    targetSlotId: slot.id,
    targetBlockId: blockId,
    textRole: slot.role,
    fontCategory: preset?.category ?? (slot.role === "headline" ? "display" : "serif"),
    fontPreset: preset?.id,
    fontFamily: preset?.family,
    fontSource: "preset",
    fontWeight: slot.role === "headline" ? 900 : 600,
    fontSizeScale:
      slot.role === "headline"
        ? 1.55
        : slot.role === "subheadline"
          ? 1.15
          : 0.95,
    letterSpacing:
      slot.role === "headline"
        ? preset?.defaultLetterSpacing ?? -1.2
        : preset?.defaultLetterSpacing ?? 0.2,
    lineHeight:
      slot.role === "headline"
        ? preset?.defaultLineHeight ?? 0.85
        : preset?.defaultLineHeight ?? 1.08,
    alignment: slot.role === "headline" ? "center" : "left",
    textColor: slot.role === "headline" ? "#111827" : "#1f2933",
    backgroundColor: null,
    rationale: "Mock fallback typography uses a visible semantic preset while preserving user structure.",
  };
};

const buildSlotPlan = (
  document: StoredDesignDocument,
  slot: NonNullable<StoredDesignDocument["semanticSlots"]>[number],
) => {
  const blockId = `${slot.id}_block`;
  const imageIntents: ImageIntent[] = [];
  const typographyAdjustments: TypographyAdjustment[] = [];
  const mediaGenerationSpecs: MediaGenerationSpec[] = [];
  let block: OrchestrationPlannedBlock | null = null;
  const slotKind = inferSlotKind(slot);

  if (slotKind === "text") {
    block = createTextBlock(
      blockId,
      slot,
      slot.role === "headline"
        ? getHeadlineCopy(document, slot)
        : slot.role === "cta"
          ? slot.content || document.semanticBrief?.mustIncludeCopy?.at(-1) || "Learn More"
          : getBodyCopy(document, slot),
      slot.role === "headline"
        ? clamp(slot.frame.height * 0.35, 28, 72)
        : slot.role === "subheadline"
          ? clamp(slot.frame.height * 0.2, 18, 42)
          : clamp(slot.frame.height * 0.12, 14, 28),
    );
    typographyAdjustments.push(createTypographyAdjustment(blockId, slot));
  } else if (slotKind === "live") {
    block = {
      id: blockId,
      type: "live",
      name: `${slot.name} Live`,
      frame: slot.frame,
      showBorder: true,
      data: {
        detector: "holistic",
        showVideo: true,
        showLandmarks: slot.visualIntent.toLowerCase().includes("landmark"),
        backgroundColor: "#111827",
      },
    };
  } else if (slotKind === "ai-image" || slotKind === "ai-video") {
    const placeholderPrompt = buildFallbackImagePlaceholder(document, slot);
    block = {
      id: blockId,
      type: "ai-generation",
      name: `${slot.name} AI Media`,
      frame: slot.frame,
      showBorder: true,
      data: {
        prompt: placeholderPrompt,
        mediaMode: slotKind === "ai-video" ? "video" : "image",
        generationRatioMode: inferRatioMode(slot.frame),
        resultFitMode: "cover",
        matchCanvasBackground: true,
        placeholderLabel: `${slot.role} semantic visual`,
      },
    };

    if (
      slotKind === "ai-image" &&
      slot.allowAIGeneration &&
      document.semanticBrief?.allowAIGeneration !== false
    ) {
      const imageIntent = createImageIntent(blockId, document, slot);
      imageIntents.push(imageIntent);
      mediaGenerationSpecs.push({
        id: `${slot.id}_media_spec`,
        intentId: imageIntent.id,
        targetSlotId: slot.id,
        targetBlockId: blockId,
        mediaType: "image",
        imageIntent,
        priority: imageIntent.priority,
        status: "planned",
        rationale: "PromptBuilder should turn this image intent into a provider-specific prompt.",
      });
    }
  } else {
    block = {
      id: blockId,
      type: "image",
      name: `${slot.name} Image`,
      frame: slot.frame,
      showBorder: true,
      data: {
        asset: createImageAssetFromSlotSource(slot),
        fitMode: "cover",
        backgroundColor: "#e5e7eb",
      },
    };
  }

  return {
    blockId,
    block,
    imageIntents,
    typographyAdjustments,
    mediaGenerationSpecs,
  };
};

export class MockCanvasOrchestratorProvider implements CanvasOrchestratorProvider {
  readonly id = "mock";

  async buildAgentProfile(
    request: BuildAgentProfileRequest,
  ): Promise<BuildAgentProfileResponse> {
    const brief = request.plainLanguageBrief.trim();
    const lowerBrief = brief.toLowerCase();
    const base = createDefaultAgentProfile(brief);
    const profile = sanitizeAgentProfile(
      {
        ...base,
        ...(request.existingProfile ?? {}),
        plainLanguageBrief: brief || request.existingProfile?.plainLanguageBrief,
        agentName:
          request.existingProfile?.agentName ??
          (lowerBrief.includes("bold") || lowerBrief.includes("poster")
            ? "Bold Art Director"
            : "AI Design Director"),
        designDirection:
          brief ||
          request.existingProfile?.designDirection ||
          base.designDirection,
        compositionBias: lowerBrief.includes("experimental")
          ? "experimental-system"
          : lowerBrief.includes("poster")
            ? "poster-system"
            : lowerBrief.includes("minimal")
              ? "minimal-grid"
              : lowerBrief.includes("complex")
                ? "complex-grid"
                : "editorial-grid",
        typographyBias: lowerBrief.includes("serif")
          ? "Prefer editorial serif contrast with strong hierarchy."
          : lowerBrief.includes("mono")
            ? "Prefer technical mono details with sharp typographic rhythm."
            : "Use expressive, readable hierarchy with decisive type contrast.",
        colorBias: lowerBrief.includes("warm")
          ? "Favor warm, inviting color temperature with clear contrast."
          : lowerBrief.includes("dark")
            ? "Favor deep, cinematic palettes with controlled highlights."
            : "Favor campaign-appropriate color systems with confident contrast.",
        imageTreatmentBias: lowerBrief.includes("abstract")
          ? "Favor abstract, material, and atmospheric imagery."
          : "Favor brand-aligned imagery with a clear visual role.",
        layoutComplexity: lowerBrief.includes("minimal") ? 0.25 : 0.58,
        visualDensity: lowerBrief.includes("dense") ? 0.72 : 0.48,
        riskLevel: lowerBrief.includes("safe") ? 0.25 : lowerBrief.includes("wild") ? 0.82 : 0.5,
      },
      brief,
    );

    return {
      profile,
      summary:
        "Built a safe local AgentProfile from the natural-language design director brief.",
      warnings: request.referenceImages?.length
        ? ["Reference images were ignored by the mock agent profile builder."]
        : [],
    };
  }

  async generatePlan(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const slots = (request.document.semanticSlots ?? [])
      .filter((slot) =>
        request.selectedSlotIds?.length
          ? request.selectedSlotIds.includes(slot.id)
          : true,
      )
      .filter((slot) => !slot.hidden);
    const warnings: string[] = [];

    if (slots.length === 0) {
      warnings.push("No semantic slots were available to orchestrate.");
    }

    const blockOps: OrchestrationPlan["blockOps"] = [];
    const slotLinks: OrchestrationPlan["slotLinks"] = [];
    const imageIntents: OrchestrationPlan["imageIntents"] = [];
    const typographyAdjustments: OrchestrationPlan["typographyAdjustments"] = [];
    const mediaGenerationSpecs: NonNullable<OrchestrationPlan["mediaGenerationSpecs"]> = [];
    const decorativeOps: NonNullable<OrchestrationPlan["decorativeOps"]> = [];
    const referenceCount = request.document.semanticBrief?.references?.length ?? 0;

    for (const slot of slots) {
      if (slot.lockedByUser) {
        warnings.push(`Skipped locked slot: ${slot.name}.`);
        continue;
      }

      const slotPlan = buildSlotPlan(request.document, slot);

      if (slotPlan.block) {
        blockOps.push({
          type: "replace-linked-blocks",
          slotId: slot.id,
          blocks: [slotPlan.block],
        });
        slotLinks.push({
          slotId: slot.id,
          linkedBlockIds: [slotPlan.blockId],
        });
      }

      imageIntents.push(...slotPlan.imageIntents);
      typographyAdjustments.push(...slotPlan.typographyAdjustments);
      mediaGenerationSpecs.push(...slotPlan.mediaGenerationSpecs);
    }

    if (request.document.semanticBrief?.compositionFreedom === "poster-system") {
      const archetype = request.document.semanticBrief.posterArchetype;
      const sourceSlot = slots[0];
      decorativeOps.push({
        id: createId("decorative"),
        type: "create-pattern",
        sourceSlotId: sourceSlot?.id,
        targetFrame: {
          x: request.document.canvas.width * 0.04,
          y: request.document.canvas.height * 0.04,
          width: request.document.canvas.width * 0.92,
          height: request.document.canvas.height * 0.92,
        },
        count: 1,
        treatment:
          archetype === "halftone-specimen"
            ? "black halftone specimen field"
            : "subtle graphic poster texture",
        patternType:
          archetype === "halftone-specimen" ? "halftone" : "line-specimen",
        rationale:
          "Adds a removable poster texture without replacing required information.",
        riskLevel: 0.28,
      });

      if (archetype === "oversized-type" && sourceSlot) {
        decorativeOps.push({
          id: createId("decorative"),
          type: "duplicate-text",
          sourceSlotId: sourceSlot.id,
          targetFrame: sourceSlot.frame,
          count: 5,
          treatment: "oversized repeated type texture",
          rationale:
            "Repeats existing copy as decorative texture while preserving the source text block.",
          riskLevel: 0.42,
        });
      }
    }

    const plan: OrchestrationPlan = {
      planId: createId("plan"),
      summary:
        slots.length > 0
          ? `Composed ${slots.length} semantic slots into a structured visual layout${
              referenceCount > 0
                ? ` using ${referenceCount} reference item${referenceCount === 1 ? "" : "s"}.`
                : "."
            }`
          : "No semantic layout changes were generated.",
      canvasPatch: {
        backgroundColor: resolveBackgroundColor(request.document),
      },
      slotLinks,
      blockOps,
      blockPatches: [],
      imageIntents,
      typographyAdjustments,
      mediaGenerationSpecs,
      liveArtDirection: undefined,
      liveMappingPatches: undefined,
      layoutPatches: [],
      remixSummary: {
        mode: "none",
        warnings: [],
      },
      decorativeOps,
      critique: {
        readabilityScore: 76,
        hierarchyScore: 78,
        brandAlignmentScore: referenceCount > 0 ? 82 : 70,
        warnings,
        suggestions:
          imageIntents.length > 0
            ? ["Run PromptBuilder before sending image intents to the image API."]
            : ["Add an AI Image slot if you want generated campaign visuals."],
      },
      generationRequests: [],
      refreshPolicy: {
        recommendedIntervalMs: 15000,
        allowAutoRefresh: true,
      },
      warnings,
    };

    return {
      plan,
      appliedGenerationRequests: [],
      meta: {
        providerId: this.id,
        runMode: request.runMode,
      },
      warnings,
    };
  }
}
