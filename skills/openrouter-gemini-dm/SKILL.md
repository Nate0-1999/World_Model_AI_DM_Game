---
name: openrouter-gemini-dm
description: Build and tune an OpenRouter-based dungeon-master loop for world-model gameplay using Gemini Flash models. Use when creating or updating DM prompts, JSON response contracts, scene progression logic, clear-condition and reward rules, screenshot/state observation policies, and fallback/budget guardrails in this project.
---

# OpenRouter Gemini DM

## Overview

Design a deterministic DM loop around OpenRouter + Gemini Flash: generate scene specs, observe player state (image and/or telemetry), decide clear/pass, and transition to the next world without free-form drift. Keep outputs machine-parseable and aligned with the alpha objective.

## Workflow

1. Lock response contracts before prompt writing.
2. Write strict system prompts and compact user payloads.
3. Add explicit transition policy for pass/fail and rewards.
4. Add fallback behavior for model errors, malformed JSON, and budget caps.
5. Run eval checklist before merging prompt or policy changes.

## Model Setup

1. Keep OpenRouter as DM brain.
2. Prefer one Gemini Flash model for both text and vision if account supports multimodal chat.
3. Split text/vision models only when latency, cost, or capability requires it.
4. Keep model IDs configurable via environment variables; never hardcode keys.

## Contract-First Rules

1. Return JSON only from DM endpoints.
2. Validate required keys and types before applying DM output.
3. Treat invalid JSON as a model failure and execute fallback path.
4. Keep "world cleared" monotonic per scene to prevent double rewards.
5. Keep prompt contracts stable across iterations; change version only when required.

Load `references/contracts.md` when editing API payloads or parser logic.

## Prompting Rules

1. Keep system prompts role-stable and short.
2. Keep user payload factual: state, telemetry, history, and hard constraints.
3. Ask for explicit fields instead of narrative text.
4. Include clear refusal behavior for unsupported or unsafe requests.
5. Keep token usage bounded with compact context summaries.

Load `references/prompt-pack.md` when drafting or revising DM prompts.

## Transition Policy

1. Declare pass criteria explicitly per scene.
2. Award at most one item per cleared world.
3. Require transition trigger: auto or user-button, selected at runtime.
4. If observation is inconclusive, keep player in current world and request another observation cycle.

## Guardrails

1. Enforce daily budget cap and per-request timeout.
2. Never expose provider keys in browser code.
3. Log model source, latency, and parse result for each call.
4. Keep deterministic fallback available when model or provider fails.

Load `references/eval-checklist.md` before releasing any prompt/policy change.

## References

- `references/contracts.md`: DM input/output JSON contracts and invariants.
- `references/prompt-pack.md`: prompt templates for scene generation and observation.
- `references/eval-checklist.md`: minimum test matrix before merge.
