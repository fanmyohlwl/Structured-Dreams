import type { EditorState } from "./types";
import { GLOBAL_LIVE_SOURCE_ID } from "../../live/runtime/sharedLiveCamera";
import {
  createDefaultOrchestrationState,
  createEmptySemanticBrief,
} from "../../../entities/semantic/types";

const now = () => new Date().toISOString();

const createDocumentId = () => {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return `document_${uuid}`;
};

const createCopyDocumentName = (name: string) => {
  const matched = name.match(/^(.*?)(?: Copy(?: (\d+))?)$/);

  if (!matched) {
    return `${name} Copy`;
  }

  const baseName = matched[1] ?? name;
  const nextIndex = matched[2] ? Number(matched[2]) + 1 : 2;

  return `${baseName} Copy ${nextIndex}`;
};

export const mockEditorState: EditorState = {
  document: {
    id: "document_v2_brand-kit",
    name: "Structured Dreams",
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    canvas: {
      width: 768,
      height: 1008,
      backgroundColor: "#ffffff",
      liveColorMapping: {
        enabled: false,
        sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
        defaultColor: "#ffffff",
        transitionMs: 600,
        rules: [
          {
            id: "rule_canvas_smile",
            expressionKey: "smile",
            threshold: 0.35,
            color: "#fff2b8",
          },
        ],
      },
    },
    grid: {
      columns: 12,
      rows: 16,
      padding: 24,
      showGrid: true,
      snapToGrid: true,
    },
    compositionMode: "manual",
    semanticBrief: createEmptySemanticBrief(),
    semanticSlots: [],
    orchestrationState: createDefaultOrchestrationState(),
    blocks: [
      {
        id: "block_text_brand",
        type: "text",
        name: "Brand Name",
        frame: {
          x: 48,
          y: 56,
          width: 280,
          height: 160,
        },
        zIndex: 1,
        locked: false,
        hidden: false,
        opacity: 1,
        showBorder: true,
        data: {
          content: "Type your text here",
          fontFamily: "Georgia, Times New Roman, serif",
          fontSize: 36,
          fontWeight: 700,
          textColor: "#000000",
          backgroundColor: "#ffffff",
          textAlign: "left",
          liveColorMapping: {
            enabled: false,
            sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
            defaultColor: "#ffffff",
            transitionMs: 600,
            rules: [
              {
                id: "rule_text_smile",
                expressionKey: "smile",
                threshold: 0.35,
                color: "#fff2b8",
              },
            ],
          },
          liveTypography: {
            enabled: false,
            sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
            transitionMs: 220,
            fontSizeMapping: {
              enabled: true,
              signalKey: "smile",
              min: 24,
              max: 64,
            },
            letterSpacingMapping: {
              enabled: true,
              signalKey: "smile",
              min: 0,
              max: 10,
            },
          },
        },
      },
      {
        id: "block_image_symbol",
        type: "image",
        name: "Logo Symbol",
        frame: {
          x: 376,
          y: 132,
          width: 216,
          height: 216,
        },
        zIndex: 2,
        locked: false,
        hidden: false,
        opacity: 1,
        showBorder: true,
        data: {
          asset: null,
          fitMode: "contain",
          backgroundColor: "#ffffff",
          liveColorMapping: {
            enabled: false,
            sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
            defaultColor: "#ffffff",
            transitionMs: 600,
            rules: [
              {
                id: "rule_image_smile",
                expressionKey: "smile",
                threshold: 0.35,
                color: "#fff2b8",
              },
            ],
          },
          liveLayout: {
            enabled: false,
            sourceBlockId: GLOBAL_LIVE_SOURCE_ID,
            countSignalKey: "smile",
            minCount: 1,
            maxCount: 9,
            layoutMode: "grid",
            gap: 12,
            waveSignalKey: "handMotion",
            waveAmplitude: 18,
            transitionMs: 220,
          },
        },
      },
      {
        id: "block_ai_texture",
        type: "ai-generation",
        name: "AI Visual",
        frame: {
          x: 120,
          y: 384,
          width: 472,
          height: 352,
        },
        zIndex: 3,
        locked: false,
        hidden: false,
        opacity: 1,
        showBorder: true,
        data: {
          prompt: "Soft editorial texture with modern luxury tone",
          status: "idle",
          mediaMode: "image",
          durationSeconds: 3,
          generationRatioMode: "follow-block",
          resultFitMode: "contain",
          matchCanvasBackground: false,
          continuousGenerationIntervalMs: 8000,
          placeholderLabel: "AI media area",
        },
      },
      {
        id: "block_live_camera",
        type: "live",
        name: "Live Camera",
        frame: {
          x: 72,
          y: 780,
          width: 256,
          height: 168,
        },
        zIndex: 4,
        locked: false,
        hidden: false,
        opacity: 1,
        showBorder: true,
        data: {
          source: "camera",
          detector: "holistic",
          status: "idle",
          backgroundColor: "#0f172a",
          showVideo: true,
          showLandmarks: true,
          placeholderLabel: "Live camera block",
        },
      },
    ],
  },
  selection: {
    selectedBlockIds: ["block_text_brand"],
  },
  ui: {
    activeTool: "select",
    leftPanelTab: "inspect",
    interaction: {
      type: "idle",
    },
    canvasZoom: 0.8,
  },
  history: {
    version: 1,
    canUndo: false,
    canRedo: false,
  },
};

export const createMockEditorState = (options?: {
  documentId?: string;
  documentName?: string;
}): EditorState => {
  const nextState = structuredClone(mockEditorState);
  const timestamp = now();

  nextState.document.id = options?.documentId ?? createDocumentId();
  nextState.document.name = options?.documentName ?? nextState.document.name;
  nextState.document.createdAt = timestamp;
  nextState.document.updatedAt = timestamp;
  nextState.selection = {
    selectedBlockIds: nextState.document.blocks[0] ? [nextState.document.blocks[0].id] : [],
  };
  nextState.history = {
    version: 1,
    canUndo: false,
    canRedo: false,
  };
  nextState.document.compositionMode = "manual";
  nextState.document.semanticBrief = createEmptySemanticBrief();
  nextState.document.semanticSlots = [];
  nextState.document.orchestrationState = createDefaultOrchestrationState();
  nextState.ui = {
    ...nextState.ui,
    activeTool: "select",
    interaction: {
      type: "idle",
    },
  };

  return nextState;
};

export const createTemplateDocument = (options?: {
  documentId?: string;
  documentName?: string;
}) => createMockEditorState(options).document;

export const createDocumentCopy = (document: EditorState["document"]) => {
  const nextDocument = structuredClone(document);
  const timestamp = now();

  nextDocument.id = createDocumentId();
  nextDocument.name = createCopyDocumentName(document.name);
  nextDocument.createdAt = timestamp;
  nextDocument.updatedAt = timestamp;

  return nextDocument;
};
