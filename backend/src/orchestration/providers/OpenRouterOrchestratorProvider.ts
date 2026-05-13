import type { CanvasOrchestratorProvider } from "./CanvasOrchestratorProvider.js";
import type {
  BuildAgentProfileRequest,
  BuildAgentProfileResponse,
  OrchestratorRequest,
  OrchestratorResponse,
  VisualStyleAnalysisProviderRequest,
  VisualStyleAnalysisResponse,
  VisualStyleProfile,
} from "../types.js";
import {
  AGENT_PROFILE_SCHEMA_NAME,
  RESPONSE_SCHEMA_NAME,
  agentProfileBuildSchema,
  buildAgentProfileSystemPrompt,
  buildAgentProfileUserPayload,
  buildUserPayload,
  compileOrchestratorSystemPrompt,
  createProviderError,
  getLiveContextSnapshotDataUrl,
  orchestrationPlanSchema,
  parseModelJson,
  sanitizeAgentProfileBuildOutput,
  sanitizePlan,
  type OpenAIResponsesApiResponse,
} from "./OpenAIOrchestratorProvider.js";

interface OpenRouterOrchestratorProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  siteUrl?: string;
  appTitle?: string;
}

interface OpenRouterChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

type OpenRouterUserContent =
  | string
  | Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "image_url";
          image_url: {
            url: string;
          };
        }
    >;

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const stringArraySchema = {
  type: "array",
  items: {
    type: "string",
  },
};

const visualStyleProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "assetId",
    "title",
    "createdAt",
    "summary",
    "composition",
    "typography",
    "color",
    "imageTreatment",
    "spatialRules",
    "layoutRules",
    "avoid",
    "confidence",
  ],
  properties: {
    id: { type: "string" },
    assetId: { type: "string" },
    title: { type: "string" },
    createdAt: { type: "string" },
    summary: { type: "string" },
    composition: { type: "string" },
    typography: { type: "string" },
    color: { type: "string" },
    imageTreatment: { type: "string" },
    spatialRules: stringArraySchema,
    layoutRules: stringArraySchema,
    avoid: stringArraySchema,
    confidence: { type: "number" },
  },
};

const visualStyleAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["profile", "warnings"],
  properties: {
    profile: visualStyleProfileSchema,
    warnings: stringArraySchema,
  },
};

const VISUAL_STYLE_SCHEMA_NAME = "visual_style_profile_v1";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, "");

const extractOpenRouterContent = (payload: OpenRouterChatCompletionResponse) => {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return null;
};

const toProviderErrorPayload = (
  payload: OpenRouterChatCompletionResponse,
): OpenAIResponsesApiResponse => ({
  id: payload.id,
  error: payload.error,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];

const sanitizeVisualStyleAnalysis = (
  value: unknown,
  request: VisualStyleAnalysisProviderRequest,
): VisualStyleAnalysisResponse => {
  const payload = isRecord(value) ? value : {};
  const rawProfile = isRecord(payload.profile) ? payload.profile : {};
  const confidence =
    typeof rawProfile.confidence === "number" && Number.isFinite(rawProfile.confidence)
      ? rawProfile.confidence
      : 0.6;
  const now = new Date().toISOString();
  const profile: VisualStyleProfile = {
    id: asString(rawProfile.id, `style_${request.assetId}`),
    assetId: request.assetId,
    title: asString(rawProfile.title, request.title ?? "Visual reference"),
    createdAt: asString(rawProfile.createdAt, now),
    summary: asString(
      rawProfile.summary,
      "Visual style analysis captured reusable composition cues.",
    ),
    composition: asString(rawProfile.composition, "Structured poster composition."),
    typography: asString(rawProfile.typography, "Contrasting typographic hierarchy."),
    color: asString(rawProfile.color, "Coherent color system."),
    imageTreatment: asString(rawProfile.imageTreatment, "Reference-informed image treatment."),
    spatialRules: stringArray(rawProfile.spatialRules),
    layoutRules: stringArray(rawProfile.layoutRules),
    avoid: stringArray(rawProfile.avoid),
    confidence: clamp(confidence, 0, 1),
  };

  return {
    profile,
    warnings: stringArray(payload.warnings),
  };
};

export class OpenRouterOrchestratorProvider implements CanvasOrchestratorProvider {
  readonly id = "openrouter" as const;

  private readonly baseUrl: string;

  constructor(private readonly config: OpenRouterOrchestratorProviderConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async generatePlan(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const userPayload = buildUserPayload(request);
    const snapshotDataUrl = getLiveContextSnapshotDataUrl(request);
    const userContent: OpenRouterUserContent =
      request.runMode === "live-direction" && snapshotDataUrl
        ? [
            {
              type: "text",
              text: JSON.stringify(userPayload),
            },
            {
              type: "image_url",
              image_url: {
                url: snapshotDataUrl,
              },
            },
          ]
        : JSON.stringify(userPayload);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.siteUrl
          ? { "HTTP-Referer": this.config.siteUrl }
          : undefined),
        ...(this.config.appTitle
          ? { "X-Title": this.config.appTitle }
          : undefined),
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: compileOrchestratorSystemPrompt(request.agentProfile),
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: RESPONSE_SCHEMA_NAME,
            strict: true,
            schema: orchestrationPlanSchema,
          },
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterChatCompletionResponse;
    const providerPayload = toProviderErrorPayload(payload);

    if (!response.ok) {
      throw createProviderError({
        message:
          payload.error?.message ??
          `OpenRouter orchestrator request failed with status ${response.status}.`,
        response,
        payload: providerPayload,
      });
    }

    const content = extractOpenRouterContent(payload);

    if (!content) {
      throw createProviderError({
        message: "OpenRouter orchestrator returned an empty structured output.",
        response,
        payload: providerPayload,
      });
    }

    let rawPlan: unknown;

    try {
      rawPlan = parseModelJson(content);
    } catch (error) {
      throw createProviderError({
        message:
          error instanceof Error
            ? error.message
            : "OpenRouter orchestrator returned invalid structured JSON.",
        response,
        payload: providerPayload,
      });
    }

    const plan = sanitizePlan(rawPlan, request);

    return {
      plan,
      appliedGenerationRequests: [],
      meta: {
        providerId: this.id,
        runMode: request.runMode,
      },
      warnings: plan.warnings,
    };
  }

  async buildAgentProfile(
    request: BuildAgentProfileRequest,
  ): Promise<BuildAgentProfileResponse> {
    const referenceImages = (request.referenceImages ?? [])
      .filter(
        (image) =>
          typeof image.dataUrl === "string" &&
          image.dataUrl.startsWith("data:image/"),
      )
      .slice(0, 3);
    const largeReferenceWarnings = referenceImages
      .filter(
        (image) =>
          (typeof image.byteSize === "number" && image.byteSize > 2_500_000) ||
          (typeof image.dataUrl === "string" && image.dataUrl.length > 3_500_000),
      )
      .map((image) =>
        `Reference image${image.title ? ` "${image.title}"` : ""} is large and may slow profile building; use a smaller image for faster analysis.`,
      );
    const userPayload = buildAgentProfileUserPayload(request);
    const userContent: OpenRouterUserContent =
      referenceImages.length > 0
        ? [
            {
              type: "text",
              text: JSON.stringify(userPayload),
            },
            ...referenceImages.map((image) => ({
              type: "image_url" as const,
              image_url: {
                url: image.dataUrl as string,
              },
            })),
          ]
        : JSON.stringify(userPayload);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.siteUrl
          ? { "HTTP-Referer": this.config.siteUrl }
          : undefined),
        ...(this.config.appTitle
          ? { "X-Title": this.config.appTitle }
          : undefined),
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content: buildAgentProfileSystemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: AGENT_PROFILE_SCHEMA_NAME,
            strict: true,
            schema: agentProfileBuildSchema,
          },
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterChatCompletionResponse;
    const providerPayload = toProviderErrorPayload(payload);

    if (!response.ok) {
      throw createProviderError({
        message:
          payload.error?.message ??
          `OpenRouter agent profile request failed with status ${response.status}.`,
        response,
        payload: providerPayload,
      });
    }

    const content = extractOpenRouterContent(payload);

    if (!content) {
      throw createProviderError({
        message: "OpenRouter agent profile builder returned an empty structured output.",
        response,
        payload: providerPayload,
      });
    }

    let rawProfile: unknown;

    try {
      rawProfile = parseModelJson(content);
    } catch (error) {
      throw createProviderError({
        message:
          error instanceof Error
            ? error.message
            : "OpenRouter agent profile builder returned invalid structured JSON.",
        response,
        payload: providerPayload,
      });
    }

    const result = sanitizeAgentProfileBuildOutput(rawProfile, request);

    return {
      ...result,
      warnings: [...result.warnings, ...largeReferenceWarnings].filter(
        (warning, index, warnings) => warnings.indexOf(warning) === index,
      ),
    };
  }

  async analyzeVisualStyle(
    request: VisualStyleAnalysisProviderRequest,
  ): Promise<VisualStyleAnalysisResponse> {
    if (!request.dataUrl.startsWith("data:image/")) {
      throw new Error("OpenRouter visual style analysis requires an image data URL.");
    }

    const systemPrompt = `You analyze graphic design references for reusable art-direction rules.
Focus on flat graphic composition style, not just depicted content.
Extract grid rhythm, hierarchy, typography contrast, color system, negative space, overlap logic, image treatment, density, focal axis, and reusable layout rules.
Do not recommend copying the exact poster, exact image content, brand marks, faces, or protected artwork.
Return only strict JSON matching the schema.`;
    const userPayload = {
      assetId: request.assetId,
      title: request.title ?? "Visual reference",
      mimeType: request.mimeType,
      instruction:
        "Analyze this uploaded poster/image as a design reference. Create a reusable VisualStyleProfile for future Semantic Compose art direction.",
    };
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.siteUrl
          ? { "HTTP-Referer": this.config.siteUrl }
          : undefined),
        ...(this.config.appTitle
          ? { "X-Title": this.config.appTitle }
          : undefined),
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify(userPayload),
              },
              {
                type: "image_url",
                image_url: {
                  url: request.dataUrl,
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: VISUAL_STYLE_SCHEMA_NAME,
            strict: true,
            schema: visualStyleAnalysisSchema,
          },
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as OpenRouterChatCompletionResponse;
    const providerPayload = toProviderErrorPayload(payload);

    if (!response.ok) {
      throw createProviderError({
        message:
          payload.error?.message ??
          `OpenRouter visual style analysis failed with status ${response.status}.`,
        response,
        payload: providerPayload,
      });
    }

    const content = extractOpenRouterContent(payload);

    if (!content) {
      throw createProviderError({
        message: "OpenRouter visual style analysis returned an empty structured output.",
        response,
        payload: providerPayload,
      });
    }

    let rawProfile: unknown;

    try {
      rawProfile = parseModelJson(content);
    } catch (error) {
      throw createProviderError({
        message:
          error instanceof Error
            ? error.message
            : "OpenRouter visual style analysis returned invalid structured JSON.",
        response,
        payload: providerPayload,
      });
    }

    return sanitizeVisualStyleAnalysis(rawProfile, request);
  }
}
