# Local Setup

This guide explains how to run Structured Dreams locally.

## Requirements

- Node.js 18 or newer
- npm
- ffmpeg for `MP4` / `GIF` export transcoding

Check the tools:

```bash
node -v
npm -v
ffmpeg -version
```

`WebM` export uses browser APIs. `MP4` and `GIF` export call the backend, which uses ffmpeg.

## Install

From the repository root:

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

The root package only forwards scripts into `frontend/` and `backend/`.

## Configure Environment

Create a local backend env file:

```bash
cp backend/.env.example backend/.env
```

The example defaults to mock providers so the app can run without API keys:

```env
AI_DEFAULT_PROVIDER=mock
AI_DEFAULT_VIDEO_PROVIDER=mock
AI_DEFAULT_ORCHESTRATOR_PROVIDER=mock
AI_BACKEND_PORT=8787
AI_BACKEND_CORS_ORIGIN=http://localhost:5173
FFMPEG_PATH=ffmpeg
```

To use a real provider, edit `backend/.env` and set the matching provider plus credentials. Do not commit `backend/.env`.

### AI Image Providers

APIMart:

```env
AI_DEFAULT_PROVIDER=apimart
APIMART_API_KEY=your_apimart_api_key_here
APIMART_BASE_URL=https://api.apimart.ai
APIMART_MODEL=doubao-seedance-4-0
```

OpenAI image provider:

```env
AI_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_IMAGE_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=gpt-image-1.5
```

OpenRouter image provider:

```env
AI_DEFAULT_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_IMAGE_MODEL=openai/gpt-5.4-image-2
OPENROUTER_IMAGE_SIZE=1K
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_TITLE=Structured Dreams
```

### AI Video Provider

```env
AI_DEFAULT_VIDEO_PROVIDER=apimart
APIMART_VIDEO_API_KEY=your_apimart_video_api_key_here
APIMART_VIDEO_BASE_URL=https://api.apimart.ai
APIMART_VIDEO_MODEL=doubao-seedance-2.0-fast
APIMART_VIDEO_RESOLUTION=720p
```

### Semantic Compose / AI Art Director

OpenAI orchestration:

```env
AI_DEFAULT_ORCHESTRATOR_PROVIDER=openai
ORCHESTRATOR_OPENAI_API_KEY=your_openai_or_compatible_api_key_here
ORCHESTRATOR_OPENAI_BASE_URL=https://api.openai.com/v1
ORCHESTRATOR_OPENAI_MODEL=gpt-4.1-mini
```

OpenRouter orchestration:

```env
AI_DEFAULT_ORCHESTRATOR_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_ORCHESTRATOR_MODEL=openai/gpt-5.5
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_TITLE=Structured Dreams
```

The orchestration provider is independent from image and video providers.

## Run In Development

Start the backend:

```bash
npm run dev:backend
```

Start the frontend in another terminal:

```bash
npm run dev:frontend
```

Default local URLs:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8787
Health:   http://localhost:8787/api/health
```

The Vite dev server proxies `/api/*` to the backend.

## Runtime Data

The backend stores local runtime data in:

```text
backend/.data/
  assets/
  documents/
  sessions/
  users/
```

These directories are kept in the repository with `.gitkeep` files, but generated contents are ignored.

## Build

Build both apps:

```bash
npm run build
```

Or build separately:

```bash
npm run build:frontend
npm run build:backend
```

Outputs:

```text
frontend/dist/
backend/dist/
```

## Production Deployment Notes

A typical deployment is:

1. Build the frontend and host `frontend/dist/` as static assets.
2. Build the backend and run `backend/dist/server.js` with Node.
3. Reverse proxy frontend `/api/*` requests to the backend.
4. Store real API keys only in backend environment variables.
5. Provide persistent storage for `backend/.data/` or set `BACKEND_DATA_DIR`.

## Troubleshooting

If the page opens but AI generation fails:

- Confirm the backend is running.
- Open `http://localhost:8787/api/health`.
- Confirm `backend/.env` is using either `mock` or a provider with real credentials.
- Restart the backend after changing env variables.

If `MP4` or `GIF` export fails:

- Confirm the backend is running.
- Confirm `ffmpeg -version` works.
- Set `FFMPEG_PATH` in `backend/.env` if ffmpeg is not on `PATH`.

If saved documents do not appear:

- Confirm you are signed in when using server-backed save/open flows.
- Check that `backend/.data/documents/`, `backend/.data/assets/`, `backend/.data/users/`, and `backend/.data/sessions/` exist.
