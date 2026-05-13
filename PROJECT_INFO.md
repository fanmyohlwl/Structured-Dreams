# Structured Dreams

Structured Dreams is a local-first visual design prototype for composing brand-oriented posters, media layouts, and live visual experiments. It combines a grid canvas editor, AI-assisted media generation, semantic layout planning, live camera signal mapping, preview modes, export tools, and a lightweight Node backend.

This repository is a clean public release baseline at version `1.0.0`.

## What It Does

- Compose structured layouts on a grid canvas.
- Create and edit text, image, AI media, and live camera blocks.
- Use Semantic Compose / AI Art Director to turn briefs and slots into constrained layout plans.
- Generate AI images and videos through backend provider adapters.
- Preview the current document in a live rendering panel and exhibition overlay.
- Export static images (`PNG`, `JPG`) and animated media (`WebM`, `MP4`, `GIF`).
- Save documents, assets, users, and sessions through the local backend.

## Main Application Areas

### Workspace

The main workspace is a three-column editor:

- Left: document controls, block tools, inspector controls, semantic controls, file actions, export actions.
- Center: grid canvas for placing, resizing, ordering, hiding, and editing blocks.
- Right: live preview that reuses the same rendering model as export and exhibition mode.

### Block Types

- Text blocks: content, typography, color, alignment, background, and live typography mapping.
- Image blocks: uploads, URLs, fit modes, color mapping, and live layout mapping.
- AI media blocks: image or video generation, generation status, results, posters, and persisted asset URLs.
- Live blocks: shared camera stream and MediaPipe-powered face, hand, pose, or holistic signal visualization.

### Semantic And AI Workflow

Semantic Compose lets a user describe intent through a brief and structured slots. The backend orchestrator can return a constrained plan with layout edits, typography guidance, image intents, media generation specs, and live mapping patches.

The project keeps AI responsibilities separated:

- The frontend owns interaction, state, canvas editing, preview, and export.
- The backend owns API keys, provider selection, retries, provider payloads, error normalization, asset persistence, and orchestration.
- The PromptBuilder owns final image-provider prompts compiled from semantic intent and provider capabilities.

Supported backend provider paths include:

- `mock` for local demos without credentials.
- `apimart` for image/video provider integrations.
- `openai` for image generation and orchestration.
- `openrouter` for image generation, multimodal style analysis, and orchestration.

## Repository Structure

```text
.
  package.json
  package-lock.json
  ARCHITECTURE.md
  LOCAL_SETUP.md
  PROJECT_INFO.md
  backend/
    .env.example
    .data/
      assets/.gitkeep
      documents/.gitkeep
      sessions/.gitkeep
      users/.gitkeep
    package.json
    package-lock.json
    src/
  frontend/
    index.html
    package.json
    package-lock.json
    src/
```

## Runtime Data

The backend writes local runtime data to `backend/.data/` by default:

- `assets/`: uploaded images, AI results, videos, posters, and metadata.
- `documents/`: saved design documents.
- `sessions/`: local login sessions.
- `users/`: local user records.

The public repository keeps only empty directory placeholders. Real runtime data and API keys should not be committed.

## Useful Docs

- `LOCAL_SETUP.md`: install, configure, run, build, and deploy locally.
- `ARCHITECTURE.md`: current frontend/backend boundaries and module map.
- `backend/.env.example`: environment variable template for local backend configuration.
