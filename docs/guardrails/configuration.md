# Configuration

## Scope

Read this guardrail for `.env`, `.acai/acai.json`, global/project config,
AGENTS.md discovery, generated rules, provider environment variables, and any
change to defaults or precedence.

## Compatibility Surfaces

- Environment variable names and supported provider credentials.
- `acai.json` shape, default values, expansion behavior, and merge precedence.
- Project-level and global AGENTS.md loading.
- Configured skill paths, tool settings, notifications, logging, and generated
  rules.

## Required Checks

- Add or update config tests for schema, defaults, precedence, and env
  expansion.
- Run `node scripts/show-config.ts` when useful to inspect resolved config.
- Update `docs/configuration.md` for any user-facing config change.

## Common Failure Modes

- Committing literal secrets or encouraging users to store secrets in
  `acai.json`.
- Changing precedence between project and global config.
- Treating undefined environment references differently without documenting it.
- Adding a provider variable without updating docs and health/config checks.

## Related Docs

- `docs/configuration.md`
- `ARCHITECTURE.md`
- `source/config/index.ts`
- `test/config.test.ts`
