import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBackendEnv } from "../../config/loadEnv.js";
import type {
  AIProviderId,
  AIProviderSelectionConfig,
} from "../types.js";
import type { OrchestratorProviderId } from "../../orchestration/types.js";

loadBackendEnv();

const backendRootDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const fallbackDefaultProvider: AIProviderId = process.env.OPENAI_API_KEY
  ? "openai"
  : process.env.APIMART_API_KEY
    ? "apimart"
    : "mock";

const fallbackDefaultVideoProvider: AIProviderId = process.env.APIMART_VIDEO_API_KEY
  ? "apimart"
  : "mock";

const fallbackDefaultOrchestratorProvider: OrchestratorProviderId =
  process.env.OPENROUTER_API_KEY
    ? "openrouter"
    : process.env.ORCHESTRATOR_OPENAI_API_KEY
      ? "openai"
      : "mock";

export const backendAiProviderSelectionConfig: AIProviderSelectionConfig = {
  defaultProvider:
    (process.env.AI_DEFAULT_PROVIDER as AIProviderId | undefined) ??
    fallbackDefaultProvider,
  providers: {
    mock: {
      enabled: true,
    },
    apimart: {
      enabled: Boolean(process.env.APIMART_API_KEY),
      apiKey: process.env.APIMART_API_KEY,
      baseUrl: process.env.APIMART_BASE_URL,
      model: process.env.APIMART_MODEL ?? "doubao-seedance-4-0",
    },
    openai: {
      enabled: Boolean(process.env.OPENAI_API_KEY),
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_IMAGE_BASE_URL,
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    },
    openrouter: {
      enabled: Boolean(process.env.OPENROUTER_API_KEY),
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl:
        process.env.OPENROUTER_BASE_URL ??
        "https://openrouter.ai/api/v1",
      model:
        process.env.OPENROUTER_IMAGE_MODEL ??
        "openai/gpt-5.4-image-2",
      resolution: process.env.OPENROUTER_IMAGE_SIZE ?? "1K",
      extraHeaders: {
        ...(process.env.OPENROUTER_SITE_URL
          ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
          : {}),
        ...(process.env.OPENROUTER_APP_TITLE
          ? { "X-Title": process.env.OPENROUTER_APP_TITLE }
          : {}),
      },
    },
  },
};

export const backendAIVideoProviderSelectionConfig: AIProviderSelectionConfig = {
  defaultProvider:
    (process.env.AI_DEFAULT_VIDEO_PROVIDER as AIProviderId | undefined) ??
    fallbackDefaultVideoProvider,
  providers: {
    mock: {
      enabled: true,
    },
    apimart: {
      enabled: Boolean(process.env.APIMART_VIDEO_API_KEY),
      apiKey: process.env.APIMART_VIDEO_API_KEY,
      baseUrl: process.env.APIMART_VIDEO_BASE_URL,
      model:
        process.env.APIMART_VIDEO_MODEL ?? "doubao-seedance-2.0-fast",
      resolution: process.env.APIMART_VIDEO_RESOLUTION ?? "720p",
    },
  },
};

export const backendOrchestratorProviderSelectionConfig: {
  defaultProvider: OrchestratorProviderId;
  providers: Record<
    OrchestratorProviderId,
    {
      enabled: boolean;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      siteUrl?: string;
      appTitle?: string;
    }
  >;
} = {
  defaultProvider:
    (process.env.AI_DEFAULT_ORCHESTRATOR_PROVIDER as
      | OrchestratorProviderId
      | undefined) ?? fallbackDefaultOrchestratorProvider,
  providers: {
    mock: {
      enabled: true,
    },
    openai: {
      enabled: Boolean(process.env.ORCHESTRATOR_OPENAI_API_KEY),
      apiKey: process.env.ORCHESTRATOR_OPENAI_API_KEY,
      baseUrl: process.env.ORCHESTRATOR_OPENAI_BASE_URL,
      model: process.env.ORCHESTRATOR_OPENAI_MODEL ?? "gpt-4.1-mini",
    },
    openrouter: {
      enabled: Boolean(process.env.OPENROUTER_API_KEY),
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl:
        process.env.OPENROUTER_BASE_URL ??
        "https://openrouter.ai/api/v1",
      model:
        process.env.OPENROUTER_ORCHESTRATOR_MODEL ??
        "openai/gpt-5.5",
      siteUrl: process.env.OPENROUTER_SITE_URL,
      appTitle: process.env.OPENROUTER_APP_TITLE,
    },
  },
};

export const backendServerConfig = {
  port: Number(process.env.AI_BACKEND_PORT ?? 8787),
  corsOrigin: process.env.AI_BACKEND_CORS_ORIGIN ?? "http://localhost:5173",
  dataDirectory: resolve(
    backendRootDirectory,
    process.env.BACKEND_DATA_DIR ?? ".data",
  ),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
};
