# Task Index

This index summarizes the task files in this directory. Use it as the manually maintained work queue, then open the linked task file for the full problem statement, files involved, and acceptance notes.

## Status Summary

- Completed: 0
- Pending: 6
- Tracking: 0
- Open: 0
- Blocked: 0

## How to Choose Next Work

1. Prefer the lowest priority number first: `P0`, then `P1`, `P2`, `P3`, and `P4`.
2. Skip tasks marked `Completed`, `Blocked`, or `Tracking`.
3. Treat parent tracker tasks as planning references, not direct implementation tasks.
4. Check the `Depends on` column before starting. If a dependency is incomplete, do that dependency first.
5. Check the `Effort` column before implementation. `L` and `XL` tasks require an ExecPlan before code changes begin.

## Next Ready Queue

1. [001](001.md) — Add per-model-request timing telemetry (P1, M)
2. [002](002.md) — Log per-turn input token time series (P2, S)
3. [004](004.md) — Surface Bash exit code and duration prominently in tool result (P2, S)
4. [003](003.md) — Log tool-call serialized size (P2, S, depends on 001)
5. [006](006.md) — Build a tool-call parallelism benchmark harness (P2, M, depends on 003)
6. [005](005.md) — Track edits-reverted-within-session metric (P3, M)

## Parent Trackers

None active.

## All Tasks

| ID | Title | Status | Priority | Effort | ExecPlan | Depends on |
|----|-------|--------|----------|--------|----------|------------|
| [001](001.md) | Add per-model-request timing telemetry | Pending | P1 | M | none | none |
| [002](002.md) | Log per-turn input token time series | Pending | P2 | S | none | none |
| [003](003.md) | Log tool-call serialized size | Pending | P2 | S | none | 001 |
| [004](004.md) | Surface Bash exit code and duration prominently in tool result | Pending | P2 | S | none | none |
| [005](005.md) | Track edits-reverted-within-session metric | Pending | P3 | M | none | none |
| [006](006.md) | Build a tool-call parallelism benchmark harness | Pending | P2 | M | none | 003 |

## Notes

Tasks 001–006 are the foundational instrumentation needed to investigate the slowness reported in `analysis.md`. They are pure measurement work (telemetry, session metadata, benchmarking). The remediation tasks suggested in `analysis.md` (timeout caps, smaller-diff Edit tool, fixing the dead `minimalPrompt` branch, system-prompt tweaks) are intentionally not captured here — they should be created and prioritized once the instrumentation lets us measure their impact.
