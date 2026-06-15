# API Stability And Compatibility

## Scope

Read this guardrail for changes to agent/tool contracts, model providers,
prompt inputs, exported package entry points, dynamic tools, skills, public CLI
data shapes, or OpenAI-compatible schemas.

## Compatibility Surfaces

- Tool names, descriptions, parameter schemas, defaults, and result formats.
- Dynamic tool describe/execute protocol and `.tool` text schema format.
- Skill discovery, `SKILL.md` loading, slash-command registration, and argument
  placeholder behavior.
- Provider IDs, model IDs, request options, middleware behavior, and token
  accounting.
- Package bin entries and imports used by downstream scripts.

## Required Checks

- Add or update focused tests for changed contracts.
- Run `npm run typecheck` for type-level contract changes.
- Run affected tests under `test/tools/`, `test/models/`, `test/skills/`,
  `test/agent/`, or `test/commands/`.
- Run `npm run check` before handoff when code/config changed unless the task
  explicitly scopes a narrower verification.

## Common Failure Modes

- Using `.optional()` in provider-facing Zod tool schemas when compatible
  providers expect all fields in `required`; prefer nullable schemas with
  `.default(null)` for omitted-at-runtime values.
- Renaming a tool, provider, command, or field without a compatibility path.
- Changing prompt/tool output in a way that breaks tests, docs, or saved
  workflows.
- Forgetting docs or ADR updates for durable behavior changes.

## Related Docs

- `docs/dynamic-tools.md`
- `docs/skills.md`
- `ARCHITECTURE.md`
- `docs/adr/003-tool-calling-interface.md`
- `docs/adr/009-dynamic-tool-loading.md`
- `docs/adr/011-dynamic-tools-enhancement.md`
