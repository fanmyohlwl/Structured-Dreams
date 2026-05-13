import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export type VideoTranscodeTargetFormat = "mp4" | "gif";

export interface VideoTranscodeRequest {
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  fileName: string;
  targetFormat: VideoTranscodeTargetFormat;
}

export interface VideoTranscodeResult {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

const sanitizeBaseFileName = (value: string) => {
  const slug = basename(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "export";
};

const getSourceExtension = (mimeType?: string) => {
  switch (mimeType) {
    case "video/webm":
      return "webm";
    case "video/mp4":
      return "mp4";
    default:
      return "webm";
  }
};

const getTargetMimeType = (format: VideoTranscodeTargetFormat) => {
  switch (format) {
    case "mp4":
      return "video/mp4";
    case "gif":
      return "image/gif";
  }
};

const getTargetExtension = (format: VideoTranscodeTargetFormat) => format;

const collectProcessOutput = (chunks: Buffer[]) =>
  Buffer.concat(chunks).toString("utf8").trim();

export class VideoTranscodeService {
  constructor(private readonly ffmpegPath: string) {}

  private runFfmpeg(args: string[], label: string) {
    return new Promise<void>((resolvePromise, reject) => {
      const stderrChunks: Buffer[] = [];
      const stdoutChunks: Buffer[] = [];
      const child = spawn(this.ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(
              `ffmpeg was not found at "${this.ffmpegPath}". Install ffmpeg or set FFMPEG_PATH.`,
            ),
          );
          return;
        }

        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        const stderr = collectProcessOutput(stderrChunks);
        const stdout = collectProcessOutput(stdoutChunks);
        reject(
          new Error(
            stderr ||
              stdout ||
              `ffmpeg step "${label}" exited with code ${code ?? "unknown"}.`,
          ),
        );
      });
    });
  }

  private async transcodeToMp4(inputPath: string, outputPath: string) {
    await this.runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      "transcode-mp4",
    );
  }

  private async normalizeGifSource(inputPath: string, normalizedPath: string) {
    await this.runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-an",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p,setsar=1",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        normalizedPath,
      ],
      "normalize-gif-source",
    );
  }

  private async transcodeToGif(
    inputPath: string,
    palettePath: string,
    outputPath: string,
  ) {
    await this.runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "fps=12,scale=iw:-1:flags=lanczos,format=rgb24,palettegen=reserve_transparent=0",
        palettePath,
      ],
      "generate-gif-palette",
    );

    await this.runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-i",
        palettePath,
        "-filter_complex",
        "fps=12,scale=iw:-1:flags=lanczos,format=rgb24[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
        "-loop",
        "0",
        outputPath,
      ],
      "render-gif",
    );
  }

  async transcode({
    sourceBuffer,
    sourceMimeType,
    fileName,
    targetFormat,
  }: VideoTranscodeRequest): Promise<VideoTranscodeResult> {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "promptblocks-export-"),
    );
    const safeBaseName = sanitizeBaseFileName(fileName);
    const inputPath = resolve(
      workingDirectory,
      `${safeBaseName}.${getSourceExtension(sourceMimeType)}`,
    );
    const outputPath = resolve(
      workingDirectory,
      `${safeBaseName}.${getTargetExtension(targetFormat)}`,
    );

    try {
      await writeFile(inputPath, sourceBuffer);

      if (targetFormat === "mp4") {
        await this.transcodeToMp4(inputPath, outputPath);
      } else {
        const normalizedInputPath = resolve(
          workingDirectory,
          `${safeBaseName}-normalized.mp4`,
        );
        const palettePath = resolve(workingDirectory, `${safeBaseName}-palette.png`);
        await this.normalizeGifSource(inputPath, normalizedInputPath);
        await this.transcodeToGif(normalizedInputPath, palettePath, outputPath);
      }

      const buffer = await readFile(outputPath);

      return {
        buffer,
        mimeType: getTargetMimeType(targetFormat),
        fileName: `${safeBaseName}.${getTargetExtension(targetFormat)}`,
      };
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Video transcode failed: ${error.message}`
          : "Video transcode failed.",
      );
    } finally {
      await rm(workingDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}
