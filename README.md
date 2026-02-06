# WorldModel DND Agentic DM (Local Prototype)

Fast local prototype with two windows:
- `DM Console`: defines setting/character, generates scenes, observes world, awards items, creates next scenes.
- `World Window`: local procedural world that can be loaded from DM scene prompts.

The DM loop runs with:
- OpenRouter configured (`OPENROUTER_API_KEY`): scene generation + multimodal observation.
- No key: fallback heuristics still run locally.

## Quick start

```bash
cp .env.example .env
python3 server.py
```

Open [http://localhost:8787](http://localhost:8787).

## How to use

1. Enter your D&D setting and character.
2. Click `Generate Opening Scene`.
3. Click `Open World Window` (allow popups for localhost).
4. Move in the world with WASD/arrows.
5. Click `Observe World` or `Start Auto Observe`.
6. DM feed decides whether the scene is likely cleared and can award one item.
7. Click `Generate Next Scene` to continue.

## Environment variables

- `PORT` (default `8787`)
- `OPENROUTER_API_KEY`
- `OPENROUTER_TEXT_MODEL` (default `openai/gpt-4.1-mini`)
- `OPENROUTER_VISION_MODEL` (default `openai/gpt-4.1-mini`)
- `OPENROUTER_SITE_URL` (default `http://localhost:8787`)
- `OPENROUTER_SITE_NAME` (default `WorldModel DND DM Local`)

## Notes

- This is deliberately simple and local-first.
- The world runtime is a local canvas sandbox, used as a fast stand-in while you iterate DM logic.
- The screenshot-to-DM loop is already wired via frame capture, so you can later swap in a real world model runtime adapter.

## Next likely step

Replace `public/world.html` and `public/world.js` with an adapter that connects to your target world model runtime (Genie or other) and keep the same `/api/dm/observe` + `/api/dm/scene` contracts.
