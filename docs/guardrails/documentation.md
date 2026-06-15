# Documentation

## Scope

Read this guardrail for README, CONTRIBUTING, ARCHITECTURE, docs under `docs/`,
ADRs, specs, task workflow docs, research, plans, and generated indexes.

## Compatibility Surfaces

- Published user docs and command/config examples.
- Architecture maps and implementation-location references.
- ADR decision history and generated ADR index.
- AHM-managed task, research, and ExecPlan indexes.
- Agent routing in `AGENTS.md` and focused guardrails in this directory.

## Required Checks

- Read `.agents/DOCS.md` before documentation audits or broad doc updates.
- Use `docs/adr/README.md` before creating or changing ADR lifecycle state.
- Update `ARCHITECTURE.md` when files are added/removed or implementation
  moves.
- Update `README.md` when docs or user-visible features are added/removed.
- Do not edit generated indexes by hand; use `ahm index` after source metadata
  edits that require regeneration.

## Common Failure Modes

- Duplicating authoritative procedure instead of linking to the specialized doc.
- Adding broad docs that are not tied to changed behavior.
- Letting README, architecture, and docs index disagree.
- Editing generated indexes directly.

## Related Docs

- `.agents/DOCS.md`
- `.agents/TASKS.md`
- `.agents/RESEARCH.md`
- `.agents/PLANS.md`
- `docs/adr/README.md`
- `docs/README.md`
