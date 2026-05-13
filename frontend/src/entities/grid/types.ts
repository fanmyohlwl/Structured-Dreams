export interface GridSettings {
  columns: number;
  rows: number;
  /**
   * Equal margin between the canvas edge and the editable grid area.
   * The actual column/row track sizes are derived from the canvas size.
   */
  padding: number;
  showGrid: boolean;
  snapToGrid: boolean;
}

export interface GridBounds {
  width: number;
  height: number;
}
