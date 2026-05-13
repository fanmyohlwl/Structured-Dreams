import type { CanvasSettings } from "../document/types";
import type { GridSettings } from "./types";

export interface GridGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  columnWidth: number;
  rowHeight: number;
}

const getSafeTrackCount = (value: number) => Math.max(Math.round(value), 1);

export const getGridGeometry = (
  canvas: CanvasSettings,
  grid: GridSettings,
): GridGeometry => {
  const maxPadding = Math.max(Math.min(canvas.width, canvas.height) / 2 - 1, 0);
  const padding = Math.min(Math.max(grid.padding, 0), maxPadding);
  const width = Math.max(canvas.width - padding * 2, 1);
  const height = Math.max(canvas.height - padding * 2, 1);

  return {
    left: padding,
    top: padding,
    width,
    height,
    columnWidth: width / getSafeTrackCount(grid.columns),
    rowHeight: height / getSafeTrackCount(grid.rows),
  };
};
