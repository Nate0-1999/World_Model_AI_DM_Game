# WorldModel DND Agentic DM

Local MVP for a dungeon-master loop that uses OpenRouter as the DM brain and a lightweight browser world as the playable surface. The current build is intentionally local-first: open the app, enter a setting and character, generate a scene, play it, and let the DM observe and transition you forward.

## What Works

- Single-page playable MVP with embedded world view
- OpenRouter-backed scene generation and observation
- Deterministic fallback logic when model calls fail
- Auto-transition to the next scene when the objective is cleared
- Optional Odyssey backend endpoints for later world-model integration

## Requirements

- `uv`
- Python `3.13`

This repo includes [`.python-version`](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/.python-version) and [pyproject.toml](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/pyproject.toml) so `uv` can manage the environment directly.

## Quick Setup

```bash
cd /Users/nateoswalt/WorldModel_DND_w_Agent_DM
cp .env.example .env
uv sync
uv run server.py
```

Open `http://localhost:8787`.

## How To Play

1. Fill in `D&D Setting` and `Character`.
2. Click `Generate Opening Scene`.
3. Click inside the embedded world and move with `WASD` or arrow keys.
4. Click `Observe Now` or `Start Auto Observe`.
5. Reach the glowing objective to clear the scene.
6. Leave `Auto-transition` enabled if you want the DM to move you forward automatically.

## Configuration

- `PORT`: defaults to `8787`
- `OPENROUTER_API_KEY`: required for real DM model calls
- `OPENROUTER_TEXT_MODEL`: defaults to `google/gemini-3-flash`
- `OPENROUTER_VISION_MODEL`: defaults to `google/gemini-3-flash`
- `OPENROUTER_SITE_URL`: defaults to `http://localhost:8787`
- `OPENROUTER_SITE_NAME`: defaults to `WorldModel DND DM Local`
- `ODYSSEY_API_KEY`: optional for Odyssey integration work
- `ODYSSEY_DEFAULT_PORTRAIT`: defaults to `false`

If OpenRouter is unset, the app still runs with deterministic fallback scene and observation logic.

## Odyssey Endpoints

The backend already exposes scaffolding for Odyssey simulation flows:

- `GET /api/odyssey/health`
- `POST /api/odyssey/simulations/start`
- `GET /api/odyssey/simulations/status?job_id=...`
- `GET /api/odyssey/simulations/list?limit=...&offset=...`
- `POST /api/odyssey/simulations/cancel`
- `GET /api/odyssey/recording?stream_id=...`

These are not required for the playable MVP. They are there for the next integration step.

The Odyssey SDK is intentionally not pinned in [pyproject.toml](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/pyproject.toml) yet. The docs import path is wired in the backend, but the exact package install path still needs to be confirmed against Odyssey's current Python SDK distribution before making it a default dependency.

## Repo Notes

- [server.py](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/server.py) is the only backend entrypoint.
- [public/app.js](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/public/app.js) orchestrates the DM loop and world embedding.
- [public/world.js](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/public/world.js) is the local playable runtime.
- [AGENTS.md](/Users/nateoswalt/WorldModel_DND_w_Agent_DM/AGENTS.md) tracks planning decisions and timestamped status updates.
