import type { TextBlock } from "../../entities/block/types";
import type { RenderDocumentSnapshot } from "../../entities/document/types";
import { loadOnlineFontForFamily } from "./onlineFontCatalog";

export type FontCatalogCategory =
  | "Sans"
  | "Serif"
  | "Mono"
  | "Chinese Sans"
  | "Chinese Serif"
  | "Handwriting"
  | "Other";

export interface FontCatalogEntry {
  id: string;
  label: string;
  family: string;
  category: FontCatalogCategory;
  source: "system" | "fallback" | "online";
}

export type LocalFontCatalogLoadStatus =
  | "idle"
  | "loading"
  | "unsupported"
  | "blocked"
  | "success"
  | "error";

export interface LocalFontCatalogLoadResult {
  status: LocalFontCatalogLoadStatus;
  entries: FontCatalogEntry[];
  message?: string;
}

type LocalFontRecord = {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
};

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontRecord[]>;
  }
}

const categoryOrder: FontCatalogCategory[] = [
  "Sans",
  "Serif",
  "Mono",
  "Chinese Sans",
  "Chinese Serif",
  "Handwriting",
  "Other",
];

const quoteFamily = (family: string) => `"${family.replace(/"/g, '\\"')}"`;

const inferFontCategory = (label: string): FontCatalogCategory => {
  const normalized = label.toLowerCase();

  if (
    normalized.includes("mono") ||
    normalized.includes("code") ||
    normalized.includes("courier") ||
    normalized.includes("menlo")
  ) {
    return "Mono";
  }

  if (
    normalized.includes("song") ||
    normalized.includes("simsun") ||
    normalized.includes("ming") ||
    normalized.includes("宋")
  ) {
    return "Chinese Serif";
  }

  if (
    normalized.includes("pingfang") ||
    normalized.includes("hiragino") ||
    normalized.includes("yahei") ||
    normalized.includes("黑") ||
    normalized.includes("sans gb")
  ) {
    return "Chinese Sans";
  }

  if (
    normalized.includes("kai") ||
    normalized.includes("cursive") ||
    normalized.includes("hand") ||
    normalized.includes("script")
  ) {
    return "Handwriting";
  }

  if (
    normalized.includes("serif") ||
    normalized.includes("georgia") ||
    normalized.includes("times") ||
    normalized.includes("baskerville")
  ) {
    return "Serif";
  }

  if (
    normalized.includes("sans") ||
    normalized.includes("helvetica") ||
    normalized.includes("avenir") ||
    normalized.includes("inter") ||
    normalized.includes("arial")
  ) {
    return "Sans";
  }

  return "Other";
};

const buildFontFamilyStack = (
  familyLabel: string,
  category: FontCatalogCategory,
) => {
  const primary = quoteFamily(familyLabel);

  if (category === "Mono") {
    return `${primary}, "Menlo", "Courier New", monospace`;
  }

  if (category === "Serif") {
    return `${primary}, "Georgia", "Times New Roman", serif`;
  }

  if (category === "Chinese Serif") {
    return `${primary}, "Songti SC", "SimSun", serif`;
  }

  if (category === "Chinese Sans") {
    return `${primary}, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  }

  if (category === "Handwriting") {
    return `${primary}, "Kaiti SC", "Songti SC", serif`;
  }

  return `${primary}, "Helvetica Neue", "Avenir Next", sans-serif`;
};

const createFontCatalogEntry = (
  label: string,
  source: "system" | "fallback",
): FontCatalogEntry => {
  const category = inferFontCategory(label);

  return {
    id: `${source}:${label.toLowerCase()}`,
    label,
    family: buildFontFamilyStack(label, category),
    category,
    source,
  };
};

const fallbackFontLabels = [
  "Helvetica Neue",
  "Avenir Next",
  "Arial",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Georgia",
  "Times New Roman",
  "Songti SC",
  "SimSun",
  "Kaiti SC",
  "Menlo",
  "Courier New",
];

const fallbackCatalog = fallbackFontLabels.map((label) =>
  createFontCatalogEntry(label, "fallback"),
);

export const getFallbackFontCatalog = () => fallbackCatalog;

let cachedSystemFontCatalog: FontCatalogEntry[] | null = null;

const dedupeFontCatalog = (entries: FontCatalogEntry[]) => {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = entry.label.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const sortFontCatalog = (entries: FontCatalogEntry[]) =>
  [...entries].sort((left, right) => {
    const categoryDelta =
      categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);

    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    if (left.source !== right.source) {
      return left.source === "system" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

const buildAvailableFontCatalog = (systemFonts: FontCatalogEntry[] = []) =>
  sortFontCatalog(dedupeFontCatalog([...systemFonts, ...fallbackCatalog]));

const querySystemFontCatalog = async (): Promise<FontCatalogEntry[]> => {
  if (
    typeof window === "undefined" ||
    typeof window.queryLocalFonts !== "function"
  ) {
    throw new Error("Local Font Access API is not supported in this browser.");
  }

  const localFonts = await window.queryLocalFonts();
  const seenFamilies = new Set<string>();

  return localFonts
    .map((font) => font.family?.trim())
    .filter((family): family is string => Boolean(family))
    .filter((family) => {
      const key = family.toLowerCase();

      if (seenFamilies.has(key)) {
        return false;
      }

      seenFamilies.add(key);
      return true;
    })
    .map((family) => createFontCatalogEntry(family, "system"));
};

const isFontAccessBlockedError = (error: unknown) => {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" ||
      error.name === "SecurityError" ||
      error.name === "AbortError")
  ) {
    return true;
  }

  if (error instanceof Error) {
    return /gesture|permission|denied|not allowed|security/i.test(error.message);
  }

  return false;
};

export const getAvailableFontCatalog = () =>
  buildAvailableFontCatalog(cachedSystemFontCatalog ?? []);

export const getLoadedSystemFontCatalog = () => cachedSystemFontCatalog ?? [];

export const requestLocalFontCatalog = async (): Promise<LocalFontCatalogLoadResult> => {
  if (
    typeof window === "undefined" ||
    typeof window.queryLocalFonts !== "function"
  ) {
    return {
      status: "unsupported",
      entries: getAvailableFontCatalog(),
      message: "Local font access is not supported in this browser.",
    };
  }

  if (cachedSystemFontCatalog) {
    return {
      status: "success",
      entries: getAvailableFontCatalog(),
      message: "Local fonts are ready.",
    };
  }

  try {
    const systemFonts = await querySystemFontCatalog();
    cachedSystemFontCatalog = systemFonts;

    return {
      status: "success",
      entries: getAvailableFontCatalog(),
      message:
        systemFonts.length > 0
          ? "Local fonts loaded."
          : "Local font access succeeded, but no additional families were returned.",
    };
  } catch (error) {
    return {
      status: isFontAccessBlockedError(error) ? "blocked" : "error",
      entries: getAvailableFontCatalog(),
      message:
        isFontAccessBlockedError(error)
          ? "Local font access was denied or needs a direct user gesture. You can try again."
          : error instanceof Error
            ? error.message
            : "Local fonts could not be loaded.",
    };
  }
};

export const groupFontCatalogEntries = (entries: FontCatalogEntry[]) =>
  categoryOrder
    .map((category) => ({
      category,
      entries: entries.filter((entry) => entry.category === category),
    }))
    .filter((group) => group.entries.length > 0);

const extractPrimaryFontLabel = (fontFamily: string) => {
  const [rawPrimary] = fontFamily.split(",");
  return rawPrimary.trim().replace(/^["']|["']$/g, "");
};

export const ensureCurrentFontCatalogEntry = (
  entries: FontCatalogEntry[],
  fontFamily: string,
) => {
  const normalizedFamily = fontFamily.trim();

  if (entries.some((entry) => entry.family === normalizedFamily)) {
    return entries;
  }

  const label = extractPrimaryFontLabel(normalizedFamily);
  const category = inferFontCategory(label);

  return sortFontCatalog(
    dedupeFontCatalog([
      {
        id: `current:${label.toLowerCase()}`,
        label,
        family: normalizedFamily,
        category,
        source: "fallback",
      },
      ...entries,
    ]),
  );
};

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

export const ensureDocumentFontsLoaded = async (
  document: RenderDocumentSnapshot,
) => {
  if (
    typeof globalThis.document === "undefined" ||
    !("fonts" in globalThis.document)
  ) {
    return;
  }

  const fonts = globalThis.document.fonts;
  const textBlocks = document.blocks.filter(
    (block): block is TextBlock => block.type === "text",
  );
  const fontRequests = textBlocks.flatMap((block) => {
    const fontFamily = block.data.fontFamily;
    const fontSize = Math.max(block.data.fontSize, 12);
    const fontWeight = String(block.data.fontWeight ?? 400);

    return [
      fonts.load(`${fontWeight} ${fontSize}px ${fontFamily}`),
      fonts.load(`400 ${fontSize}px ${fontFamily}`),
      fonts.load(`700 ${fontSize}px ${fontFamily}`),
    ];
  });

  await Promise.allSettled(
    textBlocks.map((block) => loadOnlineFontForFamily(block.data.fontFamily)),
  );

  if (fontRequests.length === 0) {
    return;
  }

  await Promise.allSettled(fontRequests);

  if ("ready" in fonts) {
    await Promise.race([fonts.ready, wait(400)]);
  }
};
