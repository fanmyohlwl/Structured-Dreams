import type {
  AnimatedExportPayload,
  AnimatedExportResult,
  AnimatedMediaExporter,
  StaticImageExportPayload,
  StaticImageExportResult,
  StaticImageExporter,
} from "../types";
import { BrowserWebMExporter } from "./BrowserWebMExporter";
import { BrowserStaticImageExporter } from "./BrowserStaticImageExporter";

export class PrototypeExportService {
  constructor(
    private readonly staticImageExporter: StaticImageExporter,
    private readonly animatedMediaExporter?: AnimatedMediaExporter,
  ) {}

  exportStaticImage(payload: StaticImageExportPayload): Promise<StaticImageExportResult> {
    return this.staticImageExporter.export(payload);
  }

  exportAnimatedMedia(payload: AnimatedExportPayload): Promise<AnimatedExportResult> {
    if (!this.animatedMediaExporter) {
      throw new Error(
        `Animated export is not implemented yet for ${payload.options.format}.`,
      );
    }

    return this.animatedMediaExporter.export(payload);
  }
}

export const prototypeExportService = new PrototypeExportService(
  new BrowserStaticImageExporter(),
  new BrowserWebMExporter(),
);

/*
当前 animated export 统一继续走 `exportAnimatedMedia(...)`：

- WebM 由浏览器端专用导出 canvas + MediaRecorder 生成
- MP4 / GIF 先生成 WebM，再交给 backend 本地 ffmpeg 转码

注意：
后续如果继续扩展新的动画导出格式，仍应复用单独的 export
frame pipeline，而不是录制浏览器里的 Live Preview DOM 或页面标签页。
*/
