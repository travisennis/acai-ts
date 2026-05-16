# Task Workflow

This document explains how tasks are handled in this repository. When you are asked to create, choose, update, or work on a task, read this file first, then use `.agents/.tasks/index.md` as the task queue and open the relevant task file under `.agents/.tasks/active/` or `.agents/.tasks/completed/`.

## Task Storage

Tasks live in `.agents/.tasks/active/` while they are not complete, and `.agents/.tasks/completed/` after they are finished. Each task is a Markdown file named with a stable task id, such as `046.md` or `109.md`. Parent tasks may have lettered child tasks, such as `047a.md`, `047b.md`, and `047c.md`.

The file `.agents/.tasks/index.md` is the generated queue and summary. It lists status counts, the next ready work, blocked or untriaged tasks, parent trackers, and links to the generated active and completed indexes. Use the index to orient yourself, but always open the task file before making changes or deciding the implementation approach.

The generated indexes are:

- `.agents/.tasks/index.md` for the concise dashboard and next ready queue.
- `.agents/.tasks/active/index.md` for all active, blocked, open, pending, and tracking tasks.
- `.agents/.tasks/completed/index.md` for historical lookup of completed tasks.

Do not edit generated indexes by hand. After changing task metadata, moving tasks between `active/` and `completed/`, or creating tasks, run:

```bash
npm run task-index
```

This wraps `python3 .agents/scripts/generate-task-indexes.py`. To check that generated indexes are current without rewriting them, run:

```bash
npm run task-index:check
```

## Choosing Work

If the user names a task id or title, work from that task even if another task is higher in the queue. If the user asks for the next task, choose from `.agents/.tasks/index.md` using these rules:

1. Prefer the lowest priority number first: `P0`, then `P1`, `P2`, `P3`, and `P4`.
2. Skip tasks marked `Completed`, `Blocked`, `Open`, or `Tracking`.
3. Check dependencies before starting. If a dependency is incomplete, do the dependency first or tell the user why the requested task is blocked.
4. Treat parent tracker tasks as planning references. Work their child tasks in the order stated by the parent tracker or the index.
5. Use task labels to filter by type, area, or risk when the user asks for focused work.

Before editing code, read the full task file and inspect the relevant source files. If the task is vague, stale, or conflicts with the current code, update the task with the discovery or ask the user for the missing product decision.

## Creating Tasks

Create new tasks in `.agents/.tasks/active/` with the next available three-digit id across both `active/` and `completed/`. For example, if the highest numbered task is `109.md`, the next unrelated task is `110.md`. Use letter suffixes only for subtasks that belong to a parent tracker, such as `110a.md`.

A new task should include enough context for another agent to work it later without the original conversation. Use this shape unless the existing task family clearly uses a narrower format:

- Front matter with id, title, status, priority, effort, ExecPlan, and dependencies.
- Title as the first heading.
- Created date when useful.
- Summary or problem statement.
- Relevant files, modules, commands, or observed behavior.
- Fix direction or implementation notes.
- Acceptance notes describing how to know the task is complete.

Use this front matter shape so the indexes can be generated:

```markdown
---
id: 001
title: Short Imperative Task Title
status: Pending
priority: P2
effort: S
labels: type:task, area:cli
exec_plan: none
depends_on: none
---
```

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

Use labels to make work easier to filter and route. Prefer a small set of stable labels over one-off tags:

- Type labels: `type:bug`, `type:feature`, `type:task`, `type:docs`, `type:maintenance`, `type:refactor`, `type:test`, `type:security`.
- Area labels: `area:cli`, `area:agent`, `area:tools`, `area:config`, `area:session`, `area:model`, `area:prompts`, `area:logger`, `area:output`, `area:ci`, `area:deps`, `area:dev-env`.
- Risk labels: `risk:breaking-change`, `risk:security-sensitive`, `risk:external-service`, `risk:migration`, `risk:release`.

Every task should have at least one `type:*` label and one `area:*` label. Add `risk:*` labels only when they help reviewers or agents choose validation depth.

Use this standard status set:

- `Open` means newly captured work that still needs triage before it is ready for the queue.
- `Pending` means ready backlog work that can be picked up when its priority and dependencies allow.
- `Blocked` means the task is not ready because it is underspecified, waiting on another task, or needs a product or design decision.
- `Tracking` means a parent task whose implementation happens through child tasks.
- `Completed` means the work is finished.

## Updating Tasks

Tasks are working records. When you complete a task, discover it is blocked, change its priority, revise labels, add or finish dependencies, or split it into subtasks, update the task file front matter and regenerate indexes.

Keep task storage consistent with status:

- Non-completed tasks stay in `.agents/.tasks/active/`.
- Completed tasks move to `.agents/.tasks/completed/`.
- When moving a task, keep the same filename so the stable task id is preserved.
- After moving or editing task metadata, regenerate the indexes with `npm run task-index`.

If a generated index is stale, do not patch the index directly. Fix the task file metadata or location, then rerun the generator.

## Working a Task

When implementing a task, keep the change scoped to the task's problem statement and acceptance notes. Preserve unrelated worktree changes, and do not commit unless the user explicitly asks.

Before implementing any task, check its `Effort` field.

- `Effort: L` and `Effort: XL` tasks must have an ExecPlan before code changes begin.
- If no ExecPlan exists for an `L` or `XL` task, create one under `.agents/exec-plans/active/` using `.agents/PLANS.md` before implementation.
- Update the task file to point to the ExecPlan and record whether the task is blocked on, tracked by, or completed by that plan.
- Update `.agents/exec-plans/active/index.md` when creating, completing, or moving an ExecPlan.
- For `Effort: S` or `Effort: M`, an ExecPlan is optional unless the task is a significant refactor, cross-cutting behavior change, or has substantial unknowns.

After finishing a task that changes code, config, or dependencies, run the project's Full Check from `AGENTS.md` (`npm run check`). For docs-only task updates, verify Markdown and links; broad validation is not required unless code, config, or dependency files changed.
