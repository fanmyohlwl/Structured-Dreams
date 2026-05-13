import type {
  StaticImageExporter,
  StaticImageExportPayload,
  StaticImageExportResult,
} from "../types";
import type {
  AIGenerationBlock,
  DesignBlock,
  ImageBlock,
} from "../../../entities/block/types";
import type { RenderDocumentSnapshot } from "../../../entities/document/types";
import { serializeDocumentToSvg } from "../../rendering/services/serializeDocumentToSvg";
import { ensureDocumentFontsLoaded } from "../../typography/fontCatalog";

const slugifyFileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "design-export";

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Failed to load the export render image."));
    image.src = url;
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to export blob."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });

const isDataUrl = (url: string) => url.startsWith("data:");

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read export image asset."));
    };
    reader.onerror = () => reject(new Error("Failed to read export image asset."));
    reader.readAsDataURL(blob);
  });

const createInlineImageResolver = () => {
  const cache = new Map<string, Promise<string>>();

  return (url: string, context: string) => {
    if (!url || isDataUrl(url)) {
      return Promise.resolve(url);
    }

    const cached = cache.get(url);

    if (cached) {
      return cached;
    }

    const promise = fetch(url, {
      credentials: "same-origin",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to inline ${context} for export (${response.status}).`,
          );
        }

        return response.blob();
      })
      .then(blobToDataUrl)
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to inline ${context} for export.`;
        throw new Error(message);
      });

    cache.set(url, promise);
    return promise;
  };
};

const inlineImageBlockAssets = async (
  block: ImageBlock,
  inlineImageUrl: (url: string, context: string) => Promise<string>,
): Promise<ImageBlock> => {
  if (!block.data.asset?.src) {
    return block;
  }

  return {
    ...block,
    data: {
      ...block.data,
      asset: {
        ...block.data.asset,
        src: await inlineImageUrl(block.data.asset.src, "image block asset"),
      },
    },
  };
};

const inlineAIBlockAssets = async (
  block: AIGenerationBlock,
  inlineImageUrl: (url: string, context: string) => Promise<string>,
): Promise<AIGenerationBlock> => {
  const data = {
    ...block.data,
  };

  if (data.resultPreviewUrl) {
    data.resultPreviewUrl = await inlineImageUrl(
      data.resultPreviewUrl,
      "generated image preview asset",
    );
  }

  if (data.resultImageUrl) {
    data.resultImageUrl = await inlineImageUrl(
      data.resultImageUrl,
      "generated image asset",
    );
  }

  if (data.resultPosterUrl) {
    data.resultPosterUrl = await inlineImageUrl(
      data.resultPosterUrl,
      "generated video poster asset",
    );
  }

  if (data.resultPreviewImageUrl) {
    data.resultPreviewImageUrl = await inlineImageUrl(
      data.resultPreviewImageUrl,
      "generated video preview image asset",
    );
  }

  return {
    ...block,
    data,
  };
};

const inlineBlockAssets = async (
  block: DesignBlock,
  inlineImageUrl: (url: string, context: string) => Promise<string>,
): Promise<DesignBlock> => {
  if (block.type === "image") {
    return inlineImageBlockAssets(block, inlineImageUrl);
  }

  if (block.type === "ai-generation") {
    return inlineAIBlockAssets(block, inlineImageUrl);
  }

  return block;
};

const createExportSafeDocument = async (
  document: RenderDocumentSnapshot,
): Promise<RenderDocumentSnapshot> => {
  const inlineImageUrl = createInlineImageResolver();
  const blocks = await Promise.all(
    document.blocks.map((block) => inlineBlockAssets(block, inlineImageUrl)),
  );

  return {
    ...document,
    blocks,
  };
};

export class BrowserStaticImageExporter implements StaticImageExporter {
  async export(
    payload: StaticImageExportPayload,
  ): Promise<StaticImageExportResult> {
    const { document, options } = payload;
    const pixelRatio = options.pixelRatio ?? window.devicePixelRatio ?? 1;
    const exportDocument = await createExportSafeDocument(document);
    await ensureDocumentFontsLoaded(exportDocument);
    const svgMarkup = serializeDocumentToSvg(exportDocument, {
      backgroundColor: options.backgroundColor ?? exportDocument.canvas.backgroundColor,
      includeGrid: false,
    });
    const svgBlob = new Blob([svgMarkup], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await loadImage(svgUrl);
      const canvas = window.document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("2D canvas context is not available for export.");
      }

      canvas.width = Math.round(exportDocument.canvas.width * pixelRatio);
      canvas.height = Math.round(exportDocument.canvas.height * pixelRatio);
      context.scale(pixelRatio, pixelRatio);

      if (options.format === "jpeg") {
        context.fillStyle =
          options.backgroundColor ?? exportDocument.canvas.backgroundColor ?? "#ffffff";
        context.fillRect(0, 0, exportDocument.canvas.width, exportDocument.canvas.height);
      }

      context.drawImage(
        image,
        0,
        0,
        exportDocument.canvas.width,
        exportDocument.canvas.height,
      );

      const mimeType = options.format === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await canvasToBlob(canvas, mimeType, options.quality ?? 0.92);

      return {
        mimeType,
        fileName: `${slugifyFileName(exportDocument.name)}.${options.format === "jpeg" ? "jpg" : "png"}`,
        blob,
      };
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }
}
