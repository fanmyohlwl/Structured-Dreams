import type { AgentProfile } from "./types";

export const AGENT_PROFILE_STORAGE_KEY =
  "promptblocks.activeAgentProfile.v1";
export const AGENT_PROFILE_LIBRARY_STORAGE_KEY =
  "promptblocks.agentProfileLibrary.v1";

const compositionBiases = new Set<AgentProfile["compositionBias"]>([
  "minimal-grid",
  "editorial-grid",
  "complex-grid",
  "poster-system",
  "experimental-system",
]);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimText = (value: unknown, fallback: string, maxLength: number) => {
  const text = typeof value === "string" ? value.trim() : fallback;

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const toNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => trimText(item, "", 96))
        .filter(Boolean)
        .slice(0, 12)
    : [];

export const createDefaultAgentProfile = (): AgentProfile => ({
  version: 1,
  agentName: "AI Design Director",
  plainLanguageBrief: "",
  designDirection:
    "Create visually coherent brand compositions while preserving user-defined structure.",
  compositionBias: "editorial-grid",
  typographyBias: "Use confident hierarchy with readable but expressive type.",
  colorBias: "Use campaign-appropriate color systems with clear contrast.",
  imageTreatmentBias:
    "Use brand-aligned imagery, material detail, and atmosphere without generic stock-photo cues.",
  layoutComplexity: 0.5,
  visualDensity: 0.5,
  riskLevel: 0.45,
  avoid: [],
  liveDirectionBehavior: {
    preferMappingOnly: true,
    respondToExpression: true,
    respondToBodyMotion: true,
    respondToEnvironment: true,
  },
});

export const sanitizeAgentProfile = (value: unknown): AgentProfile => {
  const profile = isRecord(value) ? value : {};
  const fallback = createDefaultAgentProfile();
  const liveDirectionBehavior = isRecord(profile.liveDirectionBehavior)
    ? profile.liveDirectionBehavior
    : {};

  return {
    version: 1,
    agentName: trimText(profile.agentName, fallback.agentName, 72),
    plainLanguageBrief: trimText(
      profile.plainLanguageBrief,
      fallback.plainLanguageBrief,
      1500,
    ),
    designDirection: trimText(
      profile.designDirection,
      fallback.designDirection,
      900,
    ),
    compositionBias:
      typeof profile.compositionBias === "string" &&
      compositionBiases.has(profile.compositionBias as AgentProfile["compositionBias"])
        ? (profile.compositionBias as AgentProfile["compositionBias"])
        : fallback.compositionBias,
    typographyBias: trimText(
      profile.typographyBias,
      fallback.typographyBias,
      700,
    ),
    colorBias: trimText(profile.colorBias, fallback.colorBias, 700),
    imageTreatmentBias: trimText(
      profile.imageTreatmentBias,
      fallback.imageTreatmentBias,
      700,
    ),
    layoutComplexity: clamp(toNumber(profile.layoutComplexity, 0.5), 0, 1),
    visualDensity: clamp(toNumber(profile.visualDensity, 0.5), 0, 1),
    riskLevel: clamp(toNumber(profile.riskLevel, 0.45), 0, 1),
    avoid: toStringArray(profile.avoid),
    liveDirectionBehavior: {
      preferMappingOnly:
        typeof liveDirectionBehavior.preferMappingOnly === "boolean"
          ? liveDirectionBehavior.preferMappingOnly
          : true,
      respondToExpression:
        typeof liveDirectionBehavior.respondToExpression === "boolean"
          ? liveDirectionBehavior.respondToExpression
          : true,
      respondToBodyMotion:
        typeof liveDirectionBehavior.respondToBodyMotion === "boolean"
          ? liveDirectionBehavior.respondToBodyMotion
          : true,
      respondToEnvironment:
        typeof liveDirectionBehavior.respondToEnvironment === "boolean"
          ? liveDirectionBehavior.respondToEnvironment
          : true,
    },
  };
};

export const loadStoredAgentProfile = () => {
  try {
    const raw = window.localStorage.getItem(AGENT_PROFILE_STORAGE_KEY);

    return raw ? sanitizeAgentProfile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const persistAgentProfile = (profile: AgentProfile | null) => {
  if (!profile) {
    window.localStorage.removeItem(AGENT_PROFILE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    AGENT_PROFILE_STORAGE_KEY,
    JSON.stringify(sanitizeAgentProfile(profile)),
  );
};

export const loadStoredAgentProfileLibrary = () => {
  try {
    const raw = window.localStorage.getItem(AGENT_PROFILE_LIBRARY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];

    return Array.isArray(parsed)
      ? parsed.map(sanitizeAgentProfile).slice(0, 20)
      : [];
  } catch {
    return [];
  }
};

export const persistAgentProfileLibrary = (profiles: AgentProfile[]) => {
  window.localStorage.setItem(
    AGENT_PROFILE_LIBRARY_STORAGE_KEY,
    JSON.stringify(profiles.map(sanitizeAgentProfile).slice(0, 20)),
  );
};
