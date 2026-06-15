# Dependencies, Build, CI, And Release

## Scope

Read this guardrail for dependency changes, npm scripts, Node version support,
build output, package metadata, hooks, CI, release, and publishing behavior.

## Compatibility Surfaces

- Node.js >=24 support.
- `bin/acai` and package `bin` entries.
- `npm run` script names and semantics used by contributors and CI.
- Lockfile integrity and runtime dependency footprint.
- Conventional Commit validation and PR expectations.

## Required Checks

- Run `npm install` only when dependency metadata changes.
- Run `npm run typecheck`, `npm test`, and relevant lint/format checks for
  build or dependency changes.
- Run `npm run build` for package entry point or compiler config changes.
- Before committing, run `npm run check`.

## Common Failure Modes

- Adding a dependency for a single-use problem that standard library or existing
  utilities cover.
- Updating `package.json` without `package-lock.json`.
- Breaking `prepack` or the global `acai` executable.
- Changing scripts without updating `CONTRIBUTING.md`.

## Related Docs

- `CONTRIBUTING.md`
- `package.json`
- `package-lock.json`
- `commitlint.config.js`
