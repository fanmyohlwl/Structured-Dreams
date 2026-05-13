import type { RenderDocumentSnapshot } from "../../entities/document/types";

export interface PreviewModel {
  document: RenderDocumentSnapshot;
  showGridOverlay: boolean;
  scale: number;
}

export interface PreviewRenderer {
  render(model: PreviewModel): void | Promise<void>;
}
