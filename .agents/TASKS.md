# Task Workflow

This document explains how tasks are handled in this repository. When you are asked to create, choose, update, or work on a task, read this file first, then use `.agents/.tasks/index.md` as the task queue and open the relevant task file under `.agents/.tasks/`.

## Task Storage

Tasks live in `.agents/.tasks/`. Each task is a Markdown file named with a stable task id, such as `046.md` or `109.md`. Parent tasks may have lettered child tasks, such as `047a.md`, `047b.md`, and `047c.md`.

The file `.agents/.tasks/index.md` is the queue and summary. It lists status counts, the next ready work, parent trackers, and all known tasks. Use the index to orient yourself, but always open the task file before making changes or deciding the implementation approach.

## Choosing Work

If the user names a task id or title, work from that task even if another task is higher in the queue. If the user asks for the next task, choose from `.agents/.tasks/index.md` using these rules:

1. Prefer the lowest priority number first: `P0`, then `P1`, `P2`, `P3`, and `P4`.
2. Skip tasks marked `Completed`, `Blocked`, or `Tracking`.
3. Check dependencies before starting. If a dependency is incomplete, do the dependency first or tell the user why the requested task is blocked.
4. Treat parent tracker tasks as planning references. Work their child tasks in the order stated by the parent tracker or the index.

Before editing code, read the full task file and inspect the relevant source files. If the task is vague, stale, or conflicts with the current code, update the task with the discovery or ask the user for the missing product decision.

## Creating Tasks

Create new tasks in `.agents/.tasks/` with the next available three-digit id. For example, if the highest numbered task is `109.md`, the next unrelated task is `110.md`. Use letter suffixes only for subtasks that belong to a parent tracker, such as `110a.md`.

A new task should include enough context for another agent to work it later without the original conversation. Use this shape unless the existing task family clearly uses a narrower format:

- Title as the first heading.
- Status, created date when useful, priority when known, effort, ExecPlan, and dependencies when known.
- Summary or problem statement.
- Relevant files, modules, commands, or observed behavior.
- Fix direction or implementation notes.
- Acceptance notes describing how to know the task is complete.

Use this priority scale:

- `P0` (Critical/Blocker): Emergencies needing immediate attention, such as data loss, broken installs, or severe security issues.
- `P1` (High): Essential tasks that must be fixed before release or in the next immediate update.
- `P2` (Medium): Important issues that should be resolved in the current or upcoming sprint.
- `P3` (Low): Nice-to-have improvements or non-critical small bugs that can wait.
- `P4` (Wishlist): Deferred tasks or potential improvements for future releases.

Use this effort scale:

- `XS` means a small code fix or typo correction.
- `S` means a small, localized change.
- `M` means a moderate change with limited cross-module impact.
- `L` means a larger feature, refactor, or behavior change that needs an ExecPlan before implementation.
- `XL` means a broad or high-risk feature, refactor, or behavior change that needs an ExecPlan before implementation.

Use this standard status set:

- `Open` means newly captured work that still needs triage before it is ready for the queue.
- `Pending` means ready backlog work that can be picked up when its priority and dependencies allow.
- `Blocked` means the task is not ready because it is underspecified, waiting on another task, or needs a product or design decision.
- `Tracking` means a parent task whose implementation happens through child tasks.
- `Completed` means the work is finished.

## Updating Tasks

Tasks are working records. When you complete a task, discover it is blocked, change its priority, add or finish dependencies, or split it into subtasks, update both the task file and `.agents/.tasks/index.md` in the same change.

Keep the index consistent with the task files:

- Update the status summary counts.
- Update the next ready queue when readiness changes.
- Update parent tracker rows when child ordering or status changes.
- Update the all-tasks table for title, status, priority, effort, ExecPlan, and dependencies.

There is no task-index generator checked into this repository. Treat index maintenance as manual unless a generator is added later.

## Working a Task

When implementing a task, keep the change scoped to the task's problem statement and acceptance notes. Preserve unrelated worktree changes, and do not commit unless the user explicitly asks.

Before implementing any task, check its `Effort` field.

- `Effort: L` and `Effort: XL` tasks must have an ExecPlan before code changes begin.
- If no ExecPlan exists for an `L` or `XL` task, create one under `.agents/exec-plans/active/` using `.agents/PLANS.md` before implementation.
- Update the task file to point to the ExecPlan and record whether the task is blocked on, tracked by, or completed by that plan.
- Update `.agents/exec-plans/active/index.md` when creating, completing, or moving an ExecPlan.
- For `Effort: S` or `Effort: M`, an ExecPlan is optional unless the task is a significant refactor, cross-cutting behavior change, or has substantial unknowns.

After finishing a task that changes code, config, or dependencies, run the project's Full Check from `AGENTS.md`. For docs-only task updates, verify the Markdown and links; full checks are not required unless code, config, or dependency files changed.
