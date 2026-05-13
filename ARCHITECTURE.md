# Architecture

Structured Dreams is split into a React frontend and a local Node backend. The frontend owns the editing experience; the backend owns AI/provider access, persistence, auth/session storage, and export transcoding.

## Runtime Shape

```text
Browser UI
  -> Vite dev proxy /api/*
  -> backend HTTP server
  -> provider adapters, persistence services, export services
  -> backend/.data runtime storage
```

Default local ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## Frontend

```text
frontend/src/
  app/              Application shell and top-level wiring
  entities/         Stable document, block, grid, and semantic models
  features/
    ai/             Frontend AI service facade and backend provider calls
    auth/           Client-side auth service wrapper
    editor/         Editor state, reducer, selectors, canvas, inspector, semantic sidebar
    export/         Static and animated export services
    generation/     Backend generation job polling
    live/           Shared camera runtime, MediaPipe service, live mappings
    orchestration/  Semantic Compose client, plan types, profile helpers
    persistence/    File menu, document/assets persistence, personal center
    preview/        Live preview and exhibition mode
    rendering/      Shared document renderer and SVG serialization
    typography/     Font catalog and semantic typography presets
  shared/           Common hooks, UI primitives, and small shared types
```

The frontend state flow is:

```text
Editor interactions
  -> editor reducer
  -> document state
  -> selectors
  -> render snapshots
  -> canvas / preview / export
```

Preview and export consume render snapshots instead of directly depending on UI component state. This keeps visual output consistent across the canvas, preview panel, exhibition mode, and export pipeline.

## Backend

```text
backend/src/
  server.ts         HTTP routes and request dispatch
  ai/               Image/video provider adapters, prompt building, service layer
  assets/           Asset persistence and data URL helpers
  auth/             Session cookies and auth service
  config/           Environment loading
  documents/        Saved document persistence and asset normalization
  export/           ffmpeg-backed video transcoding
  generation/       Async generation queue
  orchestration/    Semantic Compose providers and plan sanitization
  shared/           Filesystem helpers
  users/            Local user records
```

The backend is the only layer that should know provider credentials, provider-specific payloads, model names, retry details, and provider error formats.

## AI And Semantic Compose

AI work is intentionally split by responsibility:

- Frontend AI facades submit user requests to `/api/*`.
- Backend AI services choose enabled providers and normalize responses.
- Provider adapters integrate with `mock`, `apimart`, `openai`, or `openrouter`.
- Semantic Compose sends briefs, slots, existing document summaries, reference information, and live context to the orchestrator.
- Orchestration plans are sanitized before they are applied to editor state.
- Final image prompts are compiled by the backend PromptBuilder from structured `ImageIntent` data and provider capabilities.

This lets orchestration, image generation, and video generation be configured independently.

## Live Runtime

Live features sit mostly in `frontend/src/features/live/`:

- Shared camera access and device state.
- MediaPipe-powered face, hands, pose, and holistic detectors.
- Live expression and motion snapshots.
- Text typography mappings, image color mappings, image layout mappings, and live block rendering.

Semantic Compose can also consume a captured live moment and return live mapping patches or live image regeneration intents, depending on the selected run mode and permissions.

## Persistence

Local persistence is file-based:

```text
backend/.data/
  assets/
  documents/
  sessions/
  users/
```

`backend/.data` is runtime data. The repository keeps empty placeholders only, while `.gitignore` excludes generated contents.

## Build Outputs

Generated artifacts are intentionally not part of the release repository:

- `node_modules/`
- `frontend/dist/`
- `backend/dist/`
- Vite caches and generated Vite config files
- TypeScript build info files
- local `.env` files
