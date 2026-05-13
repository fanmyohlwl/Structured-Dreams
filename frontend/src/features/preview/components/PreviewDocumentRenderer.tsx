import type { RefObject } from "react";
import type { PreviewModel } from "../types";
import { DocumentRenderer } from "../../rendering/components/DocumentRenderer";

interface PreviewDocumentRendererProps {
  model: PreviewModel;
  viewportRef?: RefObject<HTMLDivElement>;
}

export function PreviewDocumentRenderer({
  model,
  viewportRef,
}: PreviewDocumentRendererProps) {
  return (
    <DocumentRenderer
      document={model.document}
      mode="preview"
      scale={model.scale}
      showGrid={model.showGridOverlay}
      viewportRef={viewportRef}
      viewportClassName="preview-viewport"
      scaledClassName="preview-viewport__scaled"
    />
  );
}
