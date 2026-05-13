import type { SemanticTypographyCategory } from "./semanticTypographyPresets";

export interface OnlineFontCatalogEntry {
  id: string;
  label: string;
  family: string;
  category: SemanticTypographyCategory;
  cssUrl: string;
  fallbackFamily: string;
}

export const onlineFontCatalog: OnlineFontCatalogEntry[] = [
  {
    id: "online:space-grotesk",
    label: "Space Grotesk",
    family: "Space Grotesk",
    category: "sans",
    cssUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap",
    fallbackFamily: "Avenir Next, Helvetica Neue, sans-serif",
  },
  {
    id: "online:fraunces",
    label: "Fraunces",
    family: "Fraunces",
    category: "serif",
    cssUrl: "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700;900&display=swap",
    fallbackFamily: "Georgia, Times New Roman, serif",
  },
  {
    id: "online:oswald",
    label: "Oswald",
    family: "Oswald",
    category: "display",
    cssUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap",
    fallbackFamily: "Impact, Avenir Next Condensed, sans-serif",
  },
  {
    id: "online:jetbrains-mono",
    label: "JetBrains Mono",
    family: "JetBrains Mono",
    category: "mono",
    cssUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
    fallbackFamily: "Menlo, Courier New, monospace",
  },
  {
    id: "online:playfair-display",
    label: "Playfair Display",
    family: "Playfair Display",
    category: "serif",
    cssUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&display=swap",
    fallbackFamily: "Georgia, Times New Roman, serif",
  },
  {
    id: "online:dm-serif-display",
    label: "DM Serif Display",
    family: "DM Serif Display",
    category: "display",
    cssUrl: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap",
    fallbackFamily: "Georgia, Times New Roman, serif",
  },
];

const loadedFontLinks = new Map<string, Promise<void>>();

const quoteFamily = (family: string) => `"${family.replace(/"/g, '\\"')}"`;

export const getOnlineFontById = (id: string | undefined) =>
  onlineFontCatalog.find((font) => font.id === id);

export const getOnlineFontByFamily = (fontFamily: string) =>
  onlineFontCatalog.find((font) =>
    fontFamily.includes(font.family),
  );

export const getOnlineFontFamilyStack = (font: OnlineFontCatalogEntry) =>
  `${quoteFamily(font.family)}, ${font.fallbackFamily}`;

export const loadOnlineFont = (font: OnlineFontCatalogEntry) => {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existing = loadedFontLinks.get(font.id);

  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = font.cssUrl;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });

  loadedFontLinks.set(font.id, promise);
  return promise;
};

export const loadOnlineFontForFamily = (fontFamily: string) => {
  const font = getOnlineFontByFamily(fontFamily);

  return font ? loadOnlineFont(font) : Promise.resolve();
};
