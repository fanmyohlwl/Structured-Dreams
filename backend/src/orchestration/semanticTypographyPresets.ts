export type SemanticTypographyCategory =
  | "serif"
  | "sans"
  | "mono"
  | "display"
  | "script"
  | "system";

export interface SemanticTypographyPreset {
  id: string;
  label: string;
  family: string;
  category: SemanticTypographyCategory;
  defaultWeight?: number | string;
  defaultLetterSpacing?: number;
  defaultLineHeight?: number;
}

export const semanticTypographyPresets: SemanticTypographyPreset[] = [
  {
    id: "editorial-serif",
    label: "Editorial Serif",
    family: "Georgia, Times New Roman, Songti SC, serif",
    category: "serif",
    defaultWeight: 700,
    defaultLetterSpacing: -0.3,
    defaultLineHeight: 0.9,
  },
  {
    id: "compressed-poster",
    label: "Compressed Poster",
    family: "Impact, Avenir Next Condensed, Arial Narrow, sans-serif",
    category: "display",
    defaultWeight: 900,
    defaultLetterSpacing: -1.2,
    defaultLineHeight: 0.82,
  },
  {
    id: "brutalist-mono",
    label: "Brutalist Mono",
    family: "IBM Plex Mono, SFMono-Regular, Menlo, Courier New, monospace",
    category: "mono",
    defaultWeight: 700,
    defaultLetterSpacing: -0.2,
    defaultLineHeight: 0.95,
  },
  {
    id: "soft-humanist",
    label: "Soft Humanist",
    family: "Avenir Next, Helvetica Neue, Arial, sans-serif",
    category: "sans",
    defaultWeight: 500,
    defaultLetterSpacing: 0.1,
    defaultLineHeight: 1.12,
  },
  {
    id: "luxury-contrast",
    label: "Luxury Contrast",
    family: "Bodoni 72, Didot, Georgia, Times New Roman, serif",
    category: "serif",
    defaultWeight: 600,
    defaultLetterSpacing: 0.6,
    defaultLineHeight: 0.92,
  },
  {
    id: "tech-mono",
    label: "Tech Mono",
    family: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    category: "mono",
    defaultWeight: 600,
    defaultLetterSpacing: 0.4,
    defaultLineHeight: 1,
  },
  {
    id: "script-accent",
    label: "Script Accent",
    family: "Snell Roundhand, Brush Script MT, Kaiti SC, cursive",
    category: "script",
    defaultWeight: 500,
    defaultLetterSpacing: 0,
    defaultLineHeight: 0.95,
  },
  {
    id: "chinese-editorial",
    label: "Chinese Editorial",
    family: "Songti SC, SimSun, Noto Serif CJK SC, serif",
    category: "serif",
    defaultWeight: 700,
    defaultLetterSpacing: 1.2,
    defaultLineHeight: 1.05,
  },
  {
    id: "neo-grotesk",
    label: "Neo Grotesk",
    family: "Helvetica Neue, Avenir Next, Arial, PingFang SC, sans-serif",
    category: "sans",
    defaultWeight: 700,
    defaultLetterSpacing: -0.1,
    defaultLineHeight: 0.95,
  },
  {
    id: "playful-display",
    label: "Playful Display",
    family: "Cooper Black, Chalkboard SE, Avenir Next, sans-serif",
    category: "display",
    defaultWeight: 800,
    defaultLetterSpacing: 0.2,
    defaultLineHeight: 0.88,
  },
];

export const semanticTypographyPresetIds = new Set(
  semanticTypographyPresets.map((preset) => preset.id),
);
