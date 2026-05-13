import { createAnimatedExportFrameRenderer } from "./AnimatedExportFrameRenderer";
import { backendVideoTranscodeService } from "./BackendVideoTranscodeService";
import type {
  AnimatedExportFormat,
  AnimatedExportPayload,
  AnimatedExportResult,
  AnimatedMediaExporter,
} from "../types";

const MIN_MEDIA_RECORDER_CHUNK_BYTES = 1;

const slugifyFileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "design-export";

const supportsMediaRecorder = () =>
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function";

const resolveWebMMimeType = () => {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
};

const waitForAnimationFrame = () =>
  new Promise<number>((resolve) => {
    window.requestAnimationFrame(resolve);
  });

const getAnimatedExportResultMimeType = (format: AnimatedExportFormat) => {
  switch (format) {
    case "webm":
      return "video/webm";
    case "mp4":
      return "video/mp4";
    case "gif":
      return "image/gif";
  }
};

const getAnimatedExportResultExtension = (format: AnimatedExportFormat) => {
  switch (format) {
    case "webm":
      return "webm";
    case "mp4":
      return "mp4";
    case "gif":
      return "gif";
  }
};

const renderWebMBlob = async (
  payload: AnimatedExportPayload,
  webmMimeType: string,
) => {
  const canvas = document.createElement("canvas");
  const renderer = await createAnimatedExportFrameRenderer({
    payload,
    canvas,
  });
  const stream = canvas.captureStream(payload.options.frameRate);
  const chunks: BlobPart[] = [];

  try {
    await renderer.renderFrame(0);
    await waitForAnimationFrame();
    payload.options.onStageChange?.("rendering-webm");

    const blob = await new Promise<Blob>((resolve, reject) => {
      let stopped = false;
      let recorder: MediaRecorder;

      const cleanup = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      const stopRecorder = () => {
        if (stopped) {
          return;
        }

        stopped = true;

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      const handleRenderError = (error: unknown) => {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error("Animated export failed while rendering WebM."),
        );
      };

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: webmMimeType,
        });
      } catch (error) {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to initialize WebM recorder."),
        );
        return;
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size >= MIN_MEDIA_RECORDER_CHUNK_BYTES) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        cleanup();
        reject(
          event.error ??
            new Error("Animated export failed while recording WebM."),
        );
      };

      recorder.onstop = () => {
        cleanup();
        resolve(
          new Blob(chunks, {
            type: webmMimeType,
          }),
        );
      };

      recorder.start();
      const startedAt = performance.now();

      const tick = async () => {
        try {
          const elapsedMs = performance.now() - startedAt;
          const frameTimestamp = Math.min(
            elapsedMs,
            payload.options.durationMs,
          );

          await renderer.renderFrame(frameTimestamp);

          if (elapsedMs >= payload.options.durationMs) {
            stopRecorder();
            return;
          }

          await waitForAnimationFrame();

          if (!stopped) {
            void tick();
          }
        } catch (error) {
          stopRecorder();
          handleRenderError(error);
        }
      };

      void tick();
    });

    return blob;
  } finally {
    renderer.dispose();
  }
};

export class BrowserWebMExporter implements AnimatedMediaExporter {
  async export(payload: AnimatedExportPayload): Promise<AnimatedExportResult> {
    if (!supportsMediaRecorder()) {
      throw new Error(
        "Animated export is not supported in this browser environment.",
      );
    }

    const webmMimeType = resolveWebMMimeType();

    if (!webmMimeType) {
      throw new Error("WebM recording is not supported by this browser.");
    }

    const webmBlob = await renderWebMBlob(payload, webmMimeType);
    const slug = slugifyFileName(payload.document.name);

    if (payload.options.format === "webm") {
      return {
        blob: webmBlob,
        fileName: `${slug}.webm`,
        mimeType: getAnimatedExportResultMimeType("webm"),
      };
    }

    payload.options.onStageChange?.("transcoding");

    const transcodedBlob = await backendVideoTranscodeService.transcode({
      source: webmBlob,
      targetFormat: payload.options.format,
      fileName: slug,
    });

    return {
      blob: transcodedBlob,
      fileName: `${slug}.${getAnimatedExportResultExtension(
        payload.options.format,
      )}`,
      mimeType: getAnimatedExportResultMimeType(payload.options.format),
    };
  }
}
