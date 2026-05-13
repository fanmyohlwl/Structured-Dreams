import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { backendServerConfig } from "./ai/config/providerConfig.js";
import { aiGenerationService } from "./ai/services/AIGenerationService.js";
import { aiVideoGenerationService } from "./ai/services/AIVideoGenerationService.js";
import type {
  BackendGenerateImagePayload,
  AIProviderId,
  AIServiceError,
} from "./ai/types.js";
import type { BackendGenerateVideoPayload } from "./ai/videoTypes.js";
import { AssetService } from "./assets/AssetService.js";
import { AuthService, SESSION_COOKIE_MAX_AGE_SECONDS, SESSION_COOKIE_NAME } from "./auth/AuthService.js";
import { DocumentService } from "./documents/DocumentService.js";
import type { StoredDesignDocument } from "./documents/types.js";
import {
  VideoTranscodeService,
  type VideoTranscodeTargetFormat,
} from "./export/VideoTranscodeService.js";
import {
  GenerationQueueService,
  type CreateGenerationJobPayload,
} from "./generation/GenerationQueueService.js";
import { UserService } from "./users/UserService.js";
import { orchestrationService, OrchestrationServiceError } from "./orchestration/OrchestrationService.js";
import type {
  BuildAgentProfileRequest,
  OrchestratorRequest,
} from "./orchestration/types.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": backendServerConfig.corsOrigin,
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

const assetService = new AssetService(backendServerConfig.dataDirectory);
const userService = new UserService(backendServerConfig.dataDirectory);
const authService = new AuthService(backendServerConfig.dataDirectory, userService);
const documentService = new DocumentService(
  backendServerConfig.dataDirectory,
  assetService,
);
const videoTranscodeService = new VideoTranscodeService(
  backendServerConfig.ffmpegPath,
);
const generationQueueService = new GenerationQueueService(aiGenerationService);

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders?: Record<string, string>,
) => {
  response.writeHead(statusCode, {
    ...jsonHeaders,
    ...corsHeaders,
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
};

const getErrorStatusCode = (error: AIServiceError) => {
  switch (error.code) {
    case "INVALID_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "PAYMENT_REQUIRED":
      return 402;
    case "PERMISSION_DENIED":
      return 403;
    case "RATE_LIMITED":
      return 429;
    case "GENERATION_NOT_FOUND":
    case "PROVIDER_NOT_FOUND":
      return 404;
    default:
      return typeof error.details?.httpStatus === "number"
        ? error.details.httpStatus
        : 500;
  }
};

const parseBody = async <T>(request: IncomingMessage) =>
  new Promise<T>((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      if (!raw) {
        resolve({} as T);
        return;
      }

      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });

const parseBinaryBody = async (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    request.on("error", reject);
  });

const getProviderIdFromUrl = (url: URL) =>
  (url.searchParams.get("providerId") as AIProviderId | null) ?? undefined;

const getGenerationIdFromPath = (pathname: string) => {
  const parts = pathname.split("/").filter(Boolean);
  return parts[3];
};

const getDocumentIdFromPath = (pathname: string) => {
  const parts = pathname.split("/").filter(Boolean);
  return parts[2];
};

const getAssetIdFromPath = (pathname: string) => {
  const parts = pathname.split("/").filter(Boolean);
  return parts[2];
};

const isImageDataUrl = (value: unknown): value is string =>
  typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);

const getDataUrlMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/i);

  return match?.[1]?.toLowerCase() ?? "application/octet-stream";
};

type HttpStatusError = Error & {
  statusCode?: number;
  code?: string;
};

const createHttpStatusError = (
  statusCode: number,
  code: string,
  message: string,
) => {
  const error = new Error(message) as HttpStatusError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const resolveAgentProfileReferenceImages = async (
  referenceImages: BuildAgentProfileRequest["referenceImages"],
  ownerId?: string,
): Promise<NonNullable<BuildAgentProfileRequest["referenceImages"]>> => {
  const resolvedImages: NonNullable<BuildAgentProfileRequest["referenceImages"]> = [];

  for (const image of (referenceImages ?? []).slice(0, 3)) {
    if (image.assetId) {
      if (!ownerId) {
        throw createHttpStatusError(
          401,
          "UNAUTHORIZED",
          "Sign in to use uploaded reference images for AI Design Director profile building.",
        );
      }

      const assetPayload = await assetService.getAssetDataUrl(image.assetId);

      if (!assetPayload) {
        throw createHttpStatusError(
          404,
          "NOT_FOUND",
          "Reference image asset not found.",
        );
      }

      if (
        assetPayload.record.ownerId !== ownerId &&
        assetPayload.record.ownerId !== null
      ) {
        throw createHttpStatusError(
          403,
          "PERMISSION_DENIED",
          "You do not have access to this reference image asset.",
        );
      }

      if (!assetPayload.record.mimeType.startsWith("image/")) {
        throw createHttpStatusError(
          400,
          "INVALID_REQUEST",
          "Agent profile reference assets must be images.",
        );
      }

      resolvedImages.push({
        assetId: assetPayload.record.id,
        title: image.title ?? assetPayload.record.fileName,
        dataUrl: assetPayload.dataUrl,
        mimeType: assetPayload.record.mimeType,
        byteSize: assetPayload.record.byteSize,
      });
      continue;
    }

    if (image.dataUrl) {
      if (!isImageDataUrl(image.dataUrl)) {
        throw createHttpStatusError(
          400,
          "INVALID_REQUEST",
          "Agent profile reference image data must be an image data URL.",
        );
      }

      resolvedImages.push({
        title: image.title,
        dataUrl: image.dataUrl,
        mimeType: image.mimeType ?? getDataUrlMimeType(image.dataUrl),
        byteSize: image.byteSize,
      });
    }
  }

  return resolvedImages;
};

const parseCookies = (request: IncomingMessage) => {
  const rawCookieHeader = request.headers.cookie;

  if (!rawCookieHeader) {
    return {};
  }

  return Object.fromEntries(
    rawCookieHeader.split(";").map((pair) => {
      const [rawKey, ...rawValueParts] = pair.split("=");
      return [
        rawKey?.trim() ?? "",
        decodeURIComponent(rawValueParts.join("=").trim()),
      ];
    }),
  );
};

const getSessionIdFromRequest = (request: IncomingMessage) =>
  parseCookies(request)[SESSION_COOKIE_NAME];

const serializeSessionCookie = (sessionId: string) =>
  `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    sessionId,
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`;

const serializeClearedSessionCookie = () =>
  `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

const getAuthenticatedUserFromRequest = (request: IncomingMessage) =>
  authService.getAuthenticatedUser(getSessionIdFromRequest(request));

const sendAsset = (
  response: ServerResponse,
  payload: { mimeType: string; buffer: Buffer },
) => {
  response.writeHead(200, {
    ...corsHeaders,
    "Content-Type": payload.mimeType,
    "Content-Length": String(payload.buffer.byteLength),
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  response.end(payload.buffer);
};

const sendBinary = (
  response: ServerResponse,
  payload: { mimeType: string; fileName?: string; buffer: Buffer },
) => {
  response.writeHead(200, {
    ...corsHeaders,
    "Content-Type": payload.mimeType,
    "Content-Length": String(payload.buffer.byteLength),
    ...(payload.fileName
      ? {
          "Content-Disposition": `attachment; filename="${payload.fileName}"`,
        }
      : undefined),
  });
  response.end(payload.buffer);
};

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "structured-dreams-backend",
      ai: "ready",
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/auth/me") {
    try {
      const user = await getAuthenticatedUserFromRequest(request);
      sendJson(response, 200, { user });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error
              ? error.message
              : "Failed to resolve current session.",
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const payload = await parseBody<{
        email?: string;
        password?: string;
        displayName?: string;
      }>(request);
      const result = await authService.register({
        email: payload.email ?? "",
        password: payload.password ?? "",
        displayName: payload.displayName,
      });

      sendJson(
        response,
        200,
        { user: result.user },
        {
          "Set-Cookie": serializeSessionCookie(result.sessionId),
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to register.";
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message,
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const payload = await parseBody<{
        email?: string;
        password?: string;
      }>(request);
      const result = await authService.login({
        email: payload.email ?? "",
        password: payload.password ?? "",
      });

      sendJson(
        response,
        200,
        { user: result.user },
        {
          "Set-Cookie": serializeSessionCookie(result.sessionId),
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to log in.";
      const statusCode = /invalid email or password/i.test(message) ? 401 : 400;
      sendJson(response, statusCode, {
        error: {
          code: statusCode === 401 ? "UNAUTHORIZED" : "INVALID_REQUEST",
          message,
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    try {
      const sessionId = getSessionIdFromRequest(request);

      if (sessionId) {
        await authService.deleteSession(sessionId);
      }

      sendJson(
        response,
        200,
        { ok: true },
        {
          "Set-Cookie": serializeClearedSessionCookie(),
        },
      );
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error ? error.message : "Failed to log out.",
        },
      });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/documents") {
    const currentUser = await getAuthenticatedUserFromRequest(request);

    if (!currentUser) {
      sendJson(response, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to access saved documents.",
        },
      });
      return;
    }

    try {
      const documents = await documentService.listDocuments(currentUser.id);
      sendJson(response, 200, {
        documents,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error
              ? error.message
              : "Failed to list documents.",
        },
      });
    }
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/documents/")) {
    const documentId = getDocumentIdFromPath(url.pathname);

    if (!documentId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing document id.",
        },
      });
      return;
    }

    const currentUser = await getAuthenticatedUserFromRequest(request);

    if (!currentUser) {
      sendJson(response, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to open saved documents.",
        },
      });
      return;
    }

    try {
      const documentRecord = await documentService.getDocument(
        documentId,
        currentUser.id,
      );

      if (!documentRecord) {
        sendJson(response, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Document not found.",
          },
        });
        return;
      }

      sendJson(response, 200, documentRecord);
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load document.",
        },
      });
    }
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/documents/")) {
    const documentId = getDocumentIdFromPath(url.pathname);

    if (!documentId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing document id.",
        },
      });
      return;
    }

    const currentUser = await getAuthenticatedUserFromRequest(request);

    if (!currentUser) {
      sendJson(response, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to save documents to your account.",
        },
      });
      return;
    }

    try {
      console.log(`[server] PUT /api/documents/${documentId} start`);
      const payload = await parseBody<{ document?: StoredDesignDocument }>(request);

      if (!payload.document) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing document payload.",
          },
        });
        return;
      }

      console.log(
        `[server] PUT /api/documents/${documentId} payload received name="${payload.document.name}" blockCount=${payload.document.blocks.length}`,
      );
      const savedRecord = await documentService.saveDocument(
        documentId,
        payload.document,
        currentUser.id,
      );
      console.log(
        `[server] PUT /api/documents/${documentId} complete updatedAt=${savedRecord.updatedAt}`,
      );
      sendJson(response, 200, savedRecord);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save document.";
      const statusCode =
        /missing document payload|not valid/i.test(message) ? 400 : 500;

      console.error(
        `[server] PUT /api/documents/${documentId} failed status=${statusCode} error=${message}`,
      );

      sendJson(response, statusCode, {
        error: {
          code: statusCode === 400 ? "INVALID_REQUEST" : "UNKNOWN",
          message,
        },
      });
    }
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/assets/")) {
    const assetId = getAssetIdFromPath(url.pathname);

    if (!assetId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing asset id.",
        },
      });
      return;
    }

    try {
      const assetPayload = await assetService.getAssetContent(assetId);

      if (!assetPayload) {
        sendJson(response, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Asset not found.",
          },
        });
        return;
      }

      sendAsset(response, {
        mimeType: assetPayload.record.mimeType,
        buffer: assetPayload.buffer,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load asset.",
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/assets/upload") {
    const currentUser = await getAuthenticatedUserFromRequest(request);

    if (!currentUser) {
      sendJson(response, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to upload visual reference assets.",
        },
      });
      return;
    }

    try {
      const contentType = request.headers["content-type"] ?? "";
      let dataUrl: string;
      let fileName: string | undefined;
      let mimeType: string | undefined;

      if (contentType.startsWith("image/")) {
        const buffer = await parseBinaryBody(request);
        mimeType = contentType.split(";")[0]?.trim() || "image/png";
        fileName = url.searchParams.get("fileName") ?? undefined;
        dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      } else {
        const payload = await parseBody<{
          dataUrl?: string;
          fileName?: string;
          mimeType?: string;
        }>(request);

        if (!isImageDataUrl(payload.dataUrl)) {
          sendJson(response, 400, {
            error: {
              code: "INVALID_REQUEST",
              message: "Upload requires an image data URL or image binary body.",
            },
          });
          return;
        }

        dataUrl = payload.dataUrl;
        fileName = payload.fileName;
        mimeType = payload.mimeType;
      }

      const asset = await assetService.importAssetFromSource({
        sourceUrl: dataUrl,
        fileName,
        mimeType,
        mediaType: "image",
        role: "source",
        origin: "upload",
        ownerId: currentUser.id,
      });

      sendJson(response, 200, { asset });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "UNKNOWN",
          message:
            error instanceof Error ? error.message : "Failed to upload asset.",
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/exports/videos/transcode") {
    const format = url.searchParams.get("format") as
      | VideoTranscodeTargetFormat
      | null;
    const fileName = url.searchParams.get("fileName") ?? "design-export";

    if (format !== "mp4" && format !== "gif") {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Unsupported transcode target format.",
        },
      });
      return;
    }

    try {
      const sourceBuffer = await parseBinaryBody(request);

      if (sourceBuffer.byteLength === 0) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing WebM source payload for transcode.",
          },
        });
        return;
      }

      const result = await videoTranscodeService.transcode({
        sourceBuffer,
        sourceMimeType: request.headers["content-type"],
        targetFormat: format,
        fileName,
      });

      sendBinary(response, result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to transcode exported video.";
      const statusCode = /ffmpeg was not found/i.test(message) ? 501 : 500;

      sendJson(response, statusCode, {
        error: {
          code: statusCode === 501 ? "NOT_IMPLEMENTED" : "UNKNOWN",
          message,
        },
      });
    }
    return;
  }

  if (
    method === "POST" &&
    url.pathname === "/api/orchestrator/agent-profile/build"
  ) {
    try {
      const payload = await parseBody<BuildAgentProfileRequest>(request);
      const currentUser = await getAuthenticatedUserFromRequest(request);

      if (
        typeof payload.plainLanguageBrief !== "string" ||
        !payload.plainLanguageBrief.trim()
      ) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Agent profile brief is required.",
          },
        });
        return;
      }

      const referenceImages = await resolveAgentProfileReferenceImages(
        payload.referenceImages,
        currentUser?.id,
      );
      const responsePayload =
        await orchestrationService.buildAgentProfile({
          ...payload,
          referenceImages,
        });

      sendJson(response, 200, responsePayload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to build agent profile.";
      const httpError = error as HttpStatusError;
      const statusCode =
        typeof httpError.statusCode === "number"
          ? httpError.statusCode
          : error instanceof OrchestrationServiceError &&
              error.code === "PROVIDER_NOT_FOUND"
            ? 404
            : error instanceof OrchestrationServiceError &&
                error.code === "INVALID_REQUEST"
              ? 400
              : 500;

      sendJson(response, statusCode, {
        error: {
          code:
            typeof httpError.code === "string"
              ? httpError.code
              : error instanceof OrchestrationServiceError
                ? error.code
                : "UNKNOWN",
          message,
          ...(error instanceof OrchestrationServiceError && error.details
            ? { details: error.details }
            : undefined),
        },
      });
    }
    return;
  }

  if (
    method === "POST" &&
    url.pathname === "/api/orchestrator/style-analysis"
  ) {
    const currentUser = await getAuthenticatedUserFromRequest(request);

    if (!currentUser) {
      sendJson(response, 401, {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to analyze visual reference assets.",
        },
      });
      return;
    }

    try {
      const payload = await parseBody<{ assetId?: string; title?: string }>(request);

      if (!payload.assetId) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing assetId for style analysis.",
          },
        });
        return;
      }

      const assetPayload = await assetService.getAssetDataUrl(payload.assetId);

      if (!assetPayload) {
        sendJson(response, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Asset not found.",
          },
        });
        return;
      }

      if (
        assetPayload.record.ownerId !== currentUser.id &&
        assetPayload.record.ownerId !== null
      ) {
        sendJson(response, 403, {
          error: {
            code: "PERMISSION_DENIED",
            message: "You do not have access to this asset.",
          },
        });
        return;
      }

      const analysis = await orchestrationService.analyzeVisualStyle({
        assetId: assetPayload.record.id,
        title: payload.title ?? assetPayload.record.fileName,
        dataUrl: assetPayload.dataUrl,
        mimeType: assetPayload.record.mimeType,
      });

      sendJson(response, 200, analysis);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to analyze visual style.";
      const statusCode =
        error instanceof OrchestrationServiceError &&
        error.code === "PROVIDER_NOT_FOUND"
          ? 404
          : error instanceof OrchestrationServiceError &&
              error.code === "INVALID_REQUEST"
            ? 400
            : 500;

      sendJson(response, statusCode, {
        error: {
          code:
            error instanceof OrchestrationServiceError
              ? error.code
              : "UNKNOWN",
          message,
          ...(error instanceof OrchestrationServiceError && error.details
            ? { details: error.details }
            : undefined),
        },
      });
    }
    return;
  }

  if (
    method === "POST" &&
    (url.pathname === "/api/orchestrator/plan" ||
      url.pathname === "/api/orchestrator/refresh" ||
      url.pathname === "/api/orchestrator/live-direction")
  ) {
    try {
      const payload = await parseBody<OrchestratorRequest>(request);

      if (!payload.document?.id || !payload.document?.name) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required orchestrator document fields.",
          },
        });
        return;
      }

      const responsePayload = await orchestrationService.generatePlan({
        ...payload,
        runMode:
          url.pathname === "/api/orchestrator/live-direction"
            ? "live-direction"
            : url.pathname === "/api/orchestrator/refresh"
              ? "refresh"
              : "plan",
      });

      sendJson(response, 200, responsePayload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate orchestration plan.";
      const statusCode =
        error instanceof OrchestrationServiceError &&
        error.code === "PROVIDER_NOT_FOUND"
          ? 404
          : error instanceof OrchestrationServiceError &&
              error.code === "INVALID_REQUEST"
            ? 400
            : 500;

      sendJson(response, statusCode, {
        error: {
          code:
            error instanceof OrchestrationServiceError
              ? error.code
              : "UNKNOWN",
          message,
          ...(error instanceof OrchestrationServiceError && error.details
            ? { details: error.details }
            : undefined),
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/generation-jobs") {
    try {
      const payload = await parseBody<CreateGenerationJobPayload>(request);

      if (!payload.mediaGenerationSpec?.id) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing media generation spec.",
          },
        });
        return;
      }

      const job = generationQueueService.createJob(payload);
      sendJson(response, 202, { job });
    } catch (error) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create generation job.",
        },
      });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/generation-jobs") {
    const documentId = url.searchParams.get("documentId") ?? undefined;
    sendJson(response, 200, {
      jobs: generationQueueService.listJobs(documentId),
    });
    return;
  }

  if (
    method === "GET" &&
    url.pathname.startsWith("/api/generation-jobs/")
  ) {
    const jobId = url.pathname.split("/").filter(Boolean)[2];

    if (!jobId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing generation job id.",
        },
      });
      return;
    }

    const job = generationQueueService.getJob(jobId);

    if (!job) {
      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Generation job not found.",
        },
      });
      return;
    }

    sendJson(response, 200, { job });
    return;
  }

  if (
    method === "POST" &&
    url.pathname.startsWith("/api/generation-jobs/") &&
    url.pathname.endsWith("/retry")
  ) {
    const jobId = url.pathname.split("/").filter(Boolean)[2];

    if (!jobId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing generation job id.",
        },
      });
      return;
    }

    const job = generationQueueService.retryJob(jobId);

    if (!job) {
      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Generation job not found.",
        },
      });
      return;
    }

    sendJson(response, 202, { job });
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/generations") {
    try {
      const payload = await parseBody<BackendGenerateImagePayload>(request);

      if (!payload.request?.blockId || !payload.request.prompt) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required AI generation request fields.",
          },
        });
        return;
      }

      const result = await aiGenerationService.generateImage(
        payload.request,
        payload.providerId,
      );

      if (!result.ok) {
        sendJson(response, getErrorStatusCode(result.error), {
          error: result.error,
        });
        return;
      }

      sendJson(response, 200, result.data);
    } catch (error) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid JSON payload.",
        },
      });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/video-generations") {
    try {
      const payload = await parseBody<BackendGenerateVideoPayload>(request);

      if (!payload.request?.blockId || !payload.request.prompt) {
        sendJson(response, 400, {
          error: {
            code: "INVALID_REQUEST",
            message: "Missing required AI video generation request fields.",
          },
        });
        return;
      }

      const result = await aiVideoGenerationService.generateVideo(
        payload.request,
        payload.providerId,
      );

      if (!result.ok) {
        sendJson(response, getErrorStatusCode(result.error), {
          error: result.error,
        });
        return;
      }

      sendJson(response, 200, result.data);
    } catch (error) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid JSON payload.",
        },
      });
    }
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/ai/generations/")) {
    const generationId = getGenerationIdFromPath(url.pathname);

    if (!generationId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing generation id.",
        },
      });
      return;
    }

    const result = await aiGenerationService.getGenerationResult(
      generationId,
      getProviderIdFromUrl(url),
    );

    if (!result.ok) {
      sendJson(response, getErrorStatusCode(result.error), {
        error: result.error,
      });
      return;
    }

    sendJson(response, 200, result.data);
    return;
  }

  if (
    method === "POST" &&
    url.pathname.startsWith("/api/ai/generations/") &&
    url.pathname.endsWith("/cancel")
  ) {
    const generationId = getGenerationIdFromPath(url.pathname);

    if (!generationId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing generation id.",
        },
      });
      return;
    }

    const result = await aiGenerationService.cancelGeneration(
      generationId,
      getProviderIdFromUrl(url),
    );

    if (!result.ok) {
      sendJson(response, getErrorStatusCode(result.error), {
        error: result.error,
      });
      return;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (
    method === "GET" &&
    url.pathname.startsWith("/api/ai/video-generations/")
  ) {
    const generationId = getGenerationIdFromPath(url.pathname);

    if (!generationId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing video generation id.",
        },
      });
      return;
    }

    const result = await aiVideoGenerationService.getVideoGenerationResult(
      generationId,
      getProviderIdFromUrl(url),
    );

    if (!result.ok) {
      sendJson(response, getErrorStatusCode(result.error), {
        error: result.error,
      });
      return;
    }

    sendJson(response, 200, result.data);
    return;
  }

  if (
    method === "POST" &&
    url.pathname.startsWith("/api/ai/video-generations/") &&
    url.pathname.endsWith("/cancel")
  ) {
    const generationId = getGenerationIdFromPath(url.pathname);

    if (!generationId) {
      sendJson(response, 400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Missing video generation id.",
        },
      });
      return;
    }

    const result = await aiVideoGenerationService.cancelVideoGeneration(
      generationId,
      getProviderIdFromUrl(url),
    );

    if (!result.ok) {
      sendJson(response, getErrorStatusCode(result.error), {
        error: result.error,
      });
      return;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, {
    error: {
      code: "UNKNOWN",
      message: "Route not found.",
    },
  });
});

server.listen(backendServerConfig.port, () => {
  console.log(
    `AI backend listening on http://localhost:${backendServerConfig.port}`,
  );
});
