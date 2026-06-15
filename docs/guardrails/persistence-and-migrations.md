# Persistence, Migrations, And File Formats

## Scope

Read this guardrail for sessions, history, resume, share output, logs, cached
data, selections, persisted rules, and any serialized file format.

## Compatibility Surfaces

- `~/.acai/sessions/*.json` session records and resume behavior.
- `~/.acai/logs/` paths and log format expectations.
- `.acai/selections/`, `.acai/rules/`, `.acai/tools/`, and project data
  directories.
- Share/export formats and history command output.
- Backward compatibility with older persisted data.

## Required Checks

- Add migration or fallback tests when reading older persisted records changes.
- Run affected tests under `test/sessions/`, `test/commands/`, and
  `test/config.test.ts`.
- Manually verify resume/history/share behavior for risky format changes.
- Document intentional migrations and compatibility breaks.

## Common Failure Modes

- Requiring all existing session files to match only the newest schema.
- Reading large session files directly instead of using a summarized tool.
- Changing log/session locations without updating config and docs.
- Treating export/share output as internal when users may consume it.

## Related Docs

- `docs/adr/004-session-persistence-format.md`
- `specs/session-storage.md`
- `specs/session-token-usage.md`
- `specs/share-command.md`
- `ARCHITECTURE.md`
