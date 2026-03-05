# Eval Checklist

Run this checklist before merging DM prompt or policy updates.

## Contract Validity

- Scene response parses as JSON.
- Observation response parses as JSON.
- Required keys present and typed correctly.
- No markdown fences or non-JSON wrapper text.

## Gameplay Logic

- Opening scene generates from new setting/character.
- Observation can keep scene active when not cleared.
- Scene clear increments exactly once.
- Exactly one reward is added per cleared scene.
- Next scene transition succeeds after clear.

## Failure Handling

- Simulate malformed model output; fallback activates.
- Simulate timeout; fallback activates and loop continues.
- Simulate provider error; retry once then fallback.

## Cost/Latency

- Log model call latency for scene and observe endpoints.
- Confirm budget accounting updates per model call.
- Confirm cap behavior (hard stop or configured behavior) works.

## Release Gate

- Pass all checks above in one run.
- Document any known risk in `AGENTS.md` status update.
