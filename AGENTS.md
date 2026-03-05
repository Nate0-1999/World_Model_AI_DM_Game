# World Model AI DM Game - Working Plan

## Objective Function
Get to a working local alpha as fast as possible, without creating obvious security or buildability failure modes.

## Alpha Definition (Locked)
- Working alpha means:
  - Player can open first level.
  - Player can pass first level.
  - DM sends player to next level.

## Constraints (Current)
- Local-first execution for now.
- Safety should exist in architecture, but local run is acceptable for alpha.
- If expected transition behavior fails, session is a fail (no soft pass).
- Observation loop is critical:
  - Must support screenshot capture and/or direct game-state monitoring.
  - Genie runtime outputs/callbacks must be researched and mapped.
- Budget guardrail target:
  - Start with `$50/day` cap (adjust after real Genie pricing is confirmed).

## High-Level Plan
1. Lock contracts before deeper implementation.
   - Define `WorldAdapter`, `Observer`, `DMEngine`, `TransitionPolicy`, `BudgetGuard`.
2. Implement one strict vertical slice.
   - Intro form -> first level launch -> clear detection -> DM transition -> second level launch.
3. Build robust observation path.
   - Primary: direct runtime state/events if Genie supports it.
   - Fallback: screenshot polling + multimodal inference.
4. Add local safety + cost controls.
   - Server-side key handling, moderation shim, per-session budget accounting, request/time caps.
5. Validate against alpha gate.
   - Pass/fail checklist for the locked alpha definition.

## Open Questions To Resolve Next
1. Genie integration surface:
   - Is Genie controlled by API, browser session, SDK, or other runtime?
2. Genie observability:
   - Do we get structured state/events directly, or only visual output?
3. Transition trigger policy:
   - What exact conditions mark a level as "passed"?
   - Is there a manual override during alpha?
4. DM model strategy:
   - Single model for both narration + observation, or split models?
5. Latency envelope:
   - Max acceptable delay for scene transition and observation loop?
6. Budget enforcement:
   - Hard stop at daily cap vs warning + degrade mode?
7. Local runtime UX:
   - Separate world/DM windows (current) vs integrated view for alpha?

## Parallelization Plan (When Spec Is Locked)
- `codex/alpha-genie-adapter`
  - Genie runtime integration + observation hook mapping.
- `codex/alpha-dm-engine`
  - Scene generation, transition decisions, reward logic.
- `codex/alpha-ui-loop`
  - Local play UX and transition experience.
- `codex/alpha-guardrails`
  - Safety hooks, budget meter, retry/fallback policy, run logs.

## Status Updates (Timestamped)
- [2026-02-08 13:11:50 CST] Captured user decisions for alpha definition, failure handling, safety posture, observation priority, and budget target.
- [2026-02-08 13:11:50 CST] Wrote initial plan, open questions, and parallel worktree strategy into `AGENTS.md`.
- [2026-02-08 13:12:19 CST] Prepared prioritized decision questions for next spec pass and implementation planning.
- [2026-03-01 12:01:35 CST] Selected Odyssey-2 as world model path for alpha; pending user credentials and integration constraints.
- [2026-03-01 12:04:16 CST] Re-checked market options: Odyssey remains strongest fit for interactive alpha; Google Genie consumer access exists but no public developer API surfaced.
- [2026-03-01 12:11:01 CST] Created local `.env` and added Odyssey API key for upcoming SDK integration.
- [2026-03-01 12:14:40 CST] Added Odyssey Python SDK backend endpoints for simulate/status/list/cancel/recording plus docs and env template updates.
- [2026-03-01 12:55:36 CST] Verified Odyssey docs alignment for simulations endpoints; backend wired, compile-checked, and awaiting live run in user environment with official SDK package install command from docs UI.
- [2026-03-01 12:58:15 CST] Created and validated new skill `openrouter-gemini-dm` with prompt pack, contract spec, and eval checklist for OpenRouter DM brain workflow.
- [2026-03-01 13:00:47 CST] Set OpenRouter model defaults to Gemini Flash in env templates and documented model-ID override guidance.
- [2026-03-01 13:12:20 CST] Upgraded MVP loop to single-page playable mode: embedded world iframe, host handshake fixes, deterministic clear detection, and auto scene transition.
- [2026-03-01 13:16:47 CST] Confirmed branch sync state with remote and updated local `.env` with project-specific OpenRouter API key.
- [2026-03-05 15:49:18 CST] Hardened repo handoff: added `uv` project files, expanded ignore rules, aligned README/setup docs, verified `uv run server.py`, and prepared review branch push.
