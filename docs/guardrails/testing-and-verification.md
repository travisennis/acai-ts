# Testing And Verification

## Scope

Read this guardrail before deciding what checks to run for code, config,
dependency, docs, workflow, or generated-artifact changes.

## Compatibility Surfaces

- Test commands and expected local development workflow.
- TypeScript, Biome, ast-grep, Node test runner, coverage, Knip, and Fallow.
- Manual REPL/TUI validation through tmux.
- Generated indexes owned by AHM.

## Required Checks

- Run focused tests while iterating: `node --no-warnings --require
  ./test/setup.js --test test/path/to/file.test.ts`.
- Run `npm run typecheck` after type-heavy changes.
- Run `npm run build` for package, entry point, or compiler changes.
- Run `npm run check` when completing code, config, dependency, fixture, or
  template changes.
- For docs-only handoff, run available markdown/link checks if present; if none
  exist, say so. Before committing, still run `npm run check`.

## Common Failure Modes

- Treating `npm test` as full verification while skipping lint/format.
- Running interactive REPL commands without tmux.
- Forgetting that `npm test` has a `pretest` typecheck.
- Failing to mention skipped checks and residual risk.

## Related Docs

- `CONTRIBUTING.md`
- `.agents/skills/manual-testing/SKILL.md`
- `.agents/skills/preflight/SKILL.md`
- `.agents/skills/fallow/SKILL.md`
