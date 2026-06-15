# Implementation Quality

## Scope

Read this guardrail for ordinary code changes, bug fixes, refactors, tests,
tool schemas, and review-readiness passes.

## Compatibility Surfaces

- Existing module boundaries and source layout in `ARCHITECTURE.md`.
- Strict TypeScript with ES modules and `.ts` relative imports.
- `node:test` and `node:assert/strict` test conventions.
- Provider-facing schemas, command outputs, and persisted data shapes.

## Required Checks

- Match existing style and local helper APIs.
- Keep changes scoped to the request; avoid speculative abstractions.
- Add focused tests for behavior changes and regression fixes.
- Run the narrowest useful tests while iterating, then scale verification to
  risk. Use `npm run check` for completed code/config changes.

## Common Failure Modes

- Refactoring adjacent code because it is nearby.
- Adding abstractions before there is repeated complexity.
- Using ad hoc parsers where structured APIs already exist.
- Adding comments that narrate edits rather than clarify code behavior.
- Forgetting `.ts` extensions on relative imports.

## Related Docs

- `CONTRIBUTING.md`
- `ARCHITECTURE.md`
- `docs/guardrails/testing-and-verification.md`
