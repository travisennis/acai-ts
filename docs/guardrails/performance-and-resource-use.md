# Performance And Resource Use

## Scope

Read this guardrail for token usage, streaming, caching, process execution,
filesystem scans, logs, large sessions, terminal rendering, and operations that
can produce large outputs.

## Compatibility Surfaces

- Token tracking and session summaries.
- Middleware caching and rate limiting.
- Bash/tool output truncation and binary-output handling.
- Log file size, session file size, and large directory behavior.
- Terminal rendering latency and width calculations.

## Required Checks

- Add focused tests or measurements for changed limits, truncation, caching, or
  streaming behavior.
- Use `tail` for `~/.acai/logs/current.log`; do not read large logs directly.
- Use the dynamic-read-session tool for session files when available instead of
  reading large JSON files directly.
- Prefer `rg`/structured scans over recursive naive reads.

## Common Failure Modes

- Loading full logs, sessions, or file trees into memory.
- Emitting unbounded command output into prompts or terminal buffers.
- Adding repeated token counting or width calculation inside hot render paths.
- Ignoring binary output or very long lines from shell commands.

## Related Docs

- `ARCHITECTURE.md`
- `docs/adr/008-token-tracking-strategy.md`
- `source/tokens/`
- `source/middleware/`
- `source/terminal/`
