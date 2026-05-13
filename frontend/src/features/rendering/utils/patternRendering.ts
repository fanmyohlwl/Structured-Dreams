import type {
  PatternBlockData,
  PatternBlockType,
} from "../../../entities/block/types";

export const patternTypes: PatternBlockType[] = [
  "halftone",
  "dither",
  "line-specimen",
  "checker",
  "stripe",
  "dot-grid",
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const normalizePatternBlockData = (
  data: Partial<PatternBlockData> | undefined,
): PatternBlockData => ({
  patternType: patternTypes.includes(data?.patternType as PatternBlockType)
    ? (data?.patternType as PatternBlockType)
    : "dot-grid",
  foregroundColor: data?.foregroundColor ?? "#111827",
  backgroundColor: data?.backgroundColor ?? null,
  density:
    typeof data?.density === "number" && Number.isFinite(data.density)
      ? clamp(data.density, 0.05, 1)
      : 0.55,
  scale:
    typeof data?.scale === "number" && Number.isFinite(data.scale)
      ? clamp(data.scale, 4, 96)
      : 18,
  angle:
    typeof data?.angle === "number" && Number.isFinite(data.angle)
      ? clamp(data.angle, -180, 180)
      : 0,
  seed:
    typeof data?.seed === "number" && Number.isFinite(data.seed)
      ? data.seed
      : undefined,
  label: data?.label,
});

export const getPatternCssBackground = (data: Partial<PatternBlockData>) => {
  const pattern = normalizePatternBlockData(data);
  const color = pattern.foregroundColor;
  const bg = pattern.backgroundColor ?? "transparent";
  const step = Math.max(pattern.scale, 4);
  const dot = Math.max(1, step * pattern.density * 0.32);
  const line = Math.max(1, step * pattern.density * 0.18);

  if (pattern.patternType === "stripe") {
    return {
      backgroundColor: bg,
      backgroundImage: `repeating-linear-gradient(${pattern.angle}deg, ${color} 0 ${line}px, transparent ${line}px ${step}px)`,
    };
  }

  if (pattern.patternType === "checker") {
    return {
      backgroundColor: bg,
      backgroundImage: `linear-gradient(45deg, ${color} 25%, transparent 25%, transparent 75%, ${color} 75%), linear-gradient(45deg, ${color} 25%, transparent 25%, transparent 75%, ${color} 75%)`,
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: `0 0, ${step / 2}px ${step / 2}px`,
    };
  }

  if (pattern.patternType === "line-specimen") {
    return {
      backgroundColor: bg,
      backgroundImage: `repeating-linear-gradient(${pattern.angle}deg, ${color} 0 1px, transparent 1px ${Math.max(3, step * (1.1 - pattern.density))}px)`,
    };
  }

  if (pattern.patternType === "halftone" || pattern.patternType === "dot-grid") {
    return {
      backgroundColor: bg,
      backgroundImage: `radial-gradient(circle, ${color} 0 ${dot}px, transparent ${dot + 0.5}px)`,
      backgroundSize: `${step}px ${step}px`,
    };
  }

  return {
    backgroundColor: bg,
    backgroundImage: `radial-gradient(circle at 25% 25%, ${color} 0 ${Math.max(1, dot * 0.65)}px, transparent ${Math.max(2, dot * 0.65 + 0.5)}px), radial-gradient(circle at 75% 75%, ${color} 0 ${Math.max(1, dot * 0.38)}px, transparent ${Math.max(2, dot * 0.38 + 0.5)}px)`,
    backgroundSize: `${step}px ${step}px`,
  };
};

export const renderPatternSvgContent = ({
  data,
  width,
  height,
  id,
}: {
  data: Partial<PatternBlockData>;
  width: number;
  height: number;
  id: string;
}) => {
  const pattern = normalizePatternBlockData(data);
  const color = escapeXml(pattern.foregroundColor);
  const bg = pattern.backgroundColor ? escapeXml(pattern.backgroundColor) : "none";
  const step = Math.max(pattern.scale, 4);
  const dot = Math.max(1, step * pattern.density * 0.32);
  const line = Math.max(1, step * pattern.density * 0.18);
  const patternId = `pattern_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const background = pattern.backgroundColor
    ? `<rect width="${width}" height="${height}" fill="${bg}" />`
    : "";

  if (pattern.patternType === "stripe" || pattern.patternType === "line-specimen") {
    const spacing =
      pattern.patternType === "line-specimen"
        ? Math.max(3, step * (1.1 - pattern.density))
        : step;
    return `
      ${background}
      <g transform="rotate(${pattern.angle}, ${width / 2}, ${height / 2})" stroke="${color}" stroke-width="${pattern.patternType === "line-specimen" ? 1 : line}">
        ${Array.from({ length: Math.ceil((width + height) / spacing) + 4 }, (_, index) => {
          const x = -height + index * spacing;
          return `<line x1="${x}" y1="${-height}" x2="${x + height * 2}" y2="${height * 2}" />`;
        }).join("")}
      </g>
    `;
  }

  if (pattern.patternType === "checker") {
    return `
      ${background}
      <pattern id="${patternId}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="${step / 2}" height="${step / 2}" fill="${color}" />
        <rect x="${step / 2}" y="${step / 2}" width="${step / 2}" height="${step / 2}" fill="${color}" />
      </pattern>
      <rect width="${width}" height="${height}" fill="url(#${patternId})" />
    `;
  }

  const radius = pattern.patternType === "dither" ? Math.max(1, dot * 0.62) : dot;

  return `
    ${background}
    <pattern id="${patternId}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">
      <circle cx="${step / 2}" cy="${step / 2}" r="${radius}" fill="${color}" />
      ${
        pattern.patternType === "dither"
          ? `<circle cx="${step * 0.18}" cy="${step * 0.22}" r="${Math.max(0.7, radius * 0.42)}" fill="${color}" opacity="0.72" />`
          : ""
      }
    </pattern>
    <rect width="${width}" height="${height}" fill="url(#${patternId})" />
  `;
};

export const drawPatternToCanvas = ({
  context,
  data,
  x,
  y,
  width,
  height,
}: {
  context: CanvasRenderingContext2D;
  data: Partial<PatternBlockData>;
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const pattern = normalizePatternBlockData(data);
  const step = Math.max(pattern.scale, 4);
  const dot = Math.max(1, step * pattern.density * 0.32);
  const line = Math.max(1, step * pattern.density * 0.18);

  if (pattern.backgroundColor) {
    context.fillStyle = pattern.backgroundColor;
    context.fillRect(x, y, width, height);
  }

  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((pattern.angle * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  context.fillStyle = pattern.foregroundColor;
  context.strokeStyle = pattern.foregroundColor;

  if (pattern.patternType === "stripe" || pattern.patternType === "line-specimen") {
    const spacing =
      pattern.patternType === "line-specimen"
        ? Math.max(3, step * (1.1 - pattern.density))
        : step;
    context.lineWidth = pattern.patternType === "line-specimen" ? 1 : line;
    for (let offset = -height; offset < width + height; offset += spacing) {
      context.beginPath();
      context.moveTo(offset, -height);
      context.lineTo(offset + height * 2, height * 2);
      context.stroke();
    }
    context.restore();
    return;
  }

  if (pattern.patternType === "checker") {
    for (let yy = 0; yy < height + step; yy += step / 2) {
      for (let xx = 0; xx < width + step; xx += step / 2) {
        if ((Math.floor(xx / (step / 2)) + Math.floor(yy / (step / 2))) % 2 === 0) {
          context.fillRect(xx, yy, step / 2, step / 2);
        }
      }
    }
    context.restore();
    return;
  }

  const radius = pattern.patternType === "dither" ? Math.max(1, dot * 0.62) : dot;
  for (let yy = step / 2; yy < height + step; yy += step) {
    for (let xx = step / 2; xx < width + step; xx += step) {
      context.beginPath();
      context.arc(xx, yy, radius, 0, Math.PI * 2);
      context.fill();
      if (pattern.patternType === "dither") {
        context.globalAlpha = 0.72;
        context.beginPath();
        context.arc(xx - step * 0.3, yy - step * 0.26, Math.max(0.7, radius * 0.42), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
  }
  context.restore();
};
