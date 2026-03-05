# DM Contracts

## Scene Generation Contract

Use for `/api/dm/scene` responses.

Required keys:
- `scene_title` (string)
- `scene_brief` (string)
- `world_prompt` (string)
- `clear_signal` (string)
- `mood` (string)
- `biome` (string)

Rules:
- Return JSON object only.
- Avoid markdown and commentary.
- Keep `world_prompt` operational and concise.

## Observation Contract

Use for `/api/dm/observe` responses.

Required keys:
- `summary` (string)
- `fun_signal` (string enum-like: `engaged`, `warming_up`, `frustrated`, etc.)
- `likely_cleared` (boolean)
- `reward_item` (string or null)
- `next_twist` (string)
- `dm_note` (string)

Rules:
- Set `reward_item` to `null` when `likely_cleared` is `false`.
- Keep one clear decision per observation cycle.

## Transition Decision Invariants

- Mark a scene cleared at most once.
- Award at most one item per cleared scene.
- Never decrement `worldsCleared`.
- If model output is malformed, use deterministic fallback and do not transition.

## Budget/Failure Contract

- If request timeout occurs, log timeout and use fallback response.
- If daily budget cap is reached, hard-stop model calls and return explicit budget error state.
- Keep provider/source metadata in logs (`openrouter`, fallback reason, parse status).
