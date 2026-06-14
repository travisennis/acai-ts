# Task Workflow

This document explains how tasks are handled in this repository. For the first
task you work in a session, read this file, then use `ahm task next`,
`ahm task ready`, `ahm task list`, `ahm task blocked`, or
`ahm task show <id>` to inspect task state. Open the specific task file before
making changes. For later tasks in the same session, rerun the relevant
`ahm task ...` command and reread the specific task file unless this file
changed or the task changes task workflow semantics.

## Task Storage

Tasks live in `.agents/.tasks/active/` while they are not complete, `.agents/.tasks/completed/` after they are finished, and `.agents/.tasks/cancelled/` when they have been abandoned. Each task is a Markdown file named with a stable task id, such as `046.md` or `109.md`. Parent tasks may have lettered child tasks, such as `047a.md`, `047b.md`, and `047c.md`.

The `ahm task ...` commands are the primary task interface. Use them for queue
inspection, filtering, lifecycle changes, dependency updates, and completion.

The file `.agents/.tasks/index.md` is a generated read-only dashboard and
fallback reference. It lists status counts, the next ready work, blocked or
untriaged tasks, parent trackers, and links to the generated active,
completed, and cancelled indexes. Use it when `ahm` is unavailable or when you
need to inspect the deterministic generated artifact itself, but always open
the task file before making changes or deciding the implementation approach.

The generated indexes are:

- `.agents/.tasks/index.md` for the concise dashboard and next ready queue.
- `.agents/.tasks/active/index.md` for all active, blocked, open, pending, and tracking tasks.
- `.agents/.tasks/completed/index.md` for historical lookup of completed tasks.
- `.agents/.tasks/cancelled/index.md` for historical lookup of cancelled tasks.

Do not edit generated indexes by hand. Prefer `ahm task ...` commands for
task changes. After changing task metadata by hand, moving tasks between
`active/`, `completed/`, and `cancelled/` by hand, or creating tasks by hand,
run:

```bash
ahm index
```

To preview which generated indexes would be rewritten, run:

```bash
ahm --dry-run index
```

A clean repository immediately after `ahm index` produces no dry-run output.

Do not run `ahm index` after `ahm task create`, `ahm task start <id>`, `ahm task complete <id>`, `ahm task cancel <id>`, `ahm task accept <id>`, or `ahm task reopen <id>` unless you edited task or ExecPlan metadata by hand afterward. Those commands already regenerate task, research, and ExecPlan indexes.

## Choosing Work

If the user names a task id or title, work from that task even if another task
is higher in the queue. Use `ahm task show <id>` to inspect the task before
acting.

If the user asks for the next task, run:

```bash
ahm task next
```

If you need a broader queue view, run:

```bash
ahm task ready
ahm task blocked
ahm task list --status Open
ahm task labels
```

Choose work using these rules:

1. Prefer the lowest priority number first: `P0`, then `P1`, `P2`, `P3`, and `P4`.
2. Skip tasks marked `Completed`, `Cancelled`, `Blocked`, `Open`, `In Progress`, or `Tracking`.
3. Check dependencies before starting. If a dependency is incomplete, do the dependency first or tell the user why the requested task is blocked.
4. Treat parent tracker tasks as planning references. Work their child tasks in
   the order stated by the parent tracker or shown by `ahm task ready`.
5. Use task labels to filter work by type, area, and risk when the user asks for focused work.
   Prefer `ahm task ready --label <label>` for ready work in a specific area,
   `ahm task list --label <label>` for broader searches, and
   `ahm task labels` to inspect the label vocabulary currently present in the
   repository. Repeat `--label` or pass comma-separated labels to require all
   listed labels.

If `ahm` is unavailable, use `.agents/.tasks/index.md` as the fallback queue
artifact and follow the same priority, status, dependency, and label rules.

Before editing code, read the full task file and inspect the relevant source
files. If the task is vague, stale, or conflicts with the current code, update
the task with the discovery or ask the user for the missing product decision.

## Creating Tasks

Use `ahm task create <title> [flags]` to create a new task. This is the
preferred path because it automatically allocates the next available ID, writes
front matter and body, places the file in `.agents/.tasks/active/`, and
regenerates all task indexes in one step.

Available flags include:

- `--priority <value>`, `-p <value>` — set priority (default P2)
- `--effort <value>` — set effort (default S)
- `--labels <value>` — set labels (default `type:task, area:unknown`)
- `--status <value>` — set initial status (default Open)
- `--description <text>`, `-d <text>` — set summary text
- `--body-file <path>` — read the full Markdown body from a file, or `-` for stdin

When creating a complete task record with sections such as Problem, Relevant
Files, Fix Direction, and Acceptance Notes, use `--body-file`. This lets `ahm`
own ID allocation, front matter, placement, and index regeneration while you
supply the full body. See `docs/cli.md` for details and examples.

`ahm task create` regenerates task, research, and ExecPlan indexes
automatically, so no separate `ahm index` is needed after creation.

## Accepting Tasks

Newly created tasks start as `Open` by default—meaning they have been
captured but have not been triaged into the ready queue. Before a task is
ready to be worked, it must be accepted.

Use `ahm task accept <id>` to transition a task from `Open` to `Pending`
(the ready backlog). The command sets the front-matter `status:` to
`Pending`, stamps `updated`, and regenerates indexes.

A task should be accepted only when all of the following are true:

- **Clear problem**: The task body states what needs to be done and why.
- **Relevant files or commands**: The task lists the files, modules, or
  command surface that will change.
- **Labels set**: At least one `type:*` and one `area:*` label are present.
- **Priority and effort set**: The priority and effort reflect a reasonable
  first estimate.
- **Dependencies resolved**: All upfront dependencies are set, and none are
  impossible to satisfy.
- **ExecPlan or ADR created if required**: Tasks with `Effort: L` or
  `Effort: XL` already have an ExecPlan; `type:feature` tasks have an ADR
  when the change introduces a durable architectural decision.
- **Acceptance Notes present**: The task includes at least a skeleton
  acceptance section so the completion criteria are known.

Do not accept a task when:

- The problem statement is vague or the scope is unclear.
- Product or design decisions are still outstanding.
- Required dependencies are unresolved or underspecified.
- An ExecPlan or ADR is needed but has not been written.

Tasks that are fully scoped at creation time can skip acceptance by passing
`--status Pending` to `ahm task create`. This is appropriate when the
creator already knows the problem, the affected surface, and the completion
criteria.

`ahm task accept` regenerates task, research, and ExecPlan indexes
automatically, so no separate `ahm index` is needed.

If you cannot run `ahm`, create tasks by hand:

Create new tasks in `.agents/.tasks/active/` with the next available three-digit
id across `active/`, `completed/`, and `cancelled/`. For example, if the highest
numbered task is `109.md`, the next unrelated task is `110.md`. Use letter
suffixes only for subtasks that belong to a parent tracker, such as `110a.md`.

A new task should include enough context for another agent to work it later
without the original conversation. Use this shape unless the existing task
family clearly uses a narrower format:

- Front matter with id, title, status, priority, effort, ExecPlan, and
  dependencies.
- Title as the first heading.
- Created date when useful.
- Summary or problem statement.
- Relevant files, modules, commands, or observed behavior.
- Fix direction or implementation notes.
- Acceptance notes describing how to know the task is complete.

Use this front matter shape so the indexes can be generated:

```markdown
---
id: 136
title: Short Imperative Task Title
status: Open
priority: P2
effort: S
labels: type:task, area:unknown
exec_plan: -
depends_on: -
---
```

Use this priority scale:

- `P0` (Critical/Blocker): Emergencies needing immediate "all hands on deck" action (e.g., system down, major revenue loss).
- `P1` (High): Essential tasks that must be fixed before release or in the next immediate update.
- `P2` (Medium): Important issues that should be resolved in the current or upcoming sprint.
- `P3` (Low): Nice-to-have improvements or non-critical, small UI bugs that can wait.
- `P4` (Wishlist): Deferred tasks or potential improvements for future releases.

Use labels to make work easier to filter and route. Prefer a small set of stable labels over one-off tags:

- Type labels: `type:bug`, `type:feature`, `type:task`, `type:docs`, `type:maintenance`, `type:refactor`, `type:test`, `type:security`.
- Area labels: `area:cli`, `area:agent`, `area:responses`, `area:chat`, `area:tools`, `area:sandbox`, `area:config`, `area:session`, `area:model`, `area:prompts`, `area:logger`, `area:ci`, `area:deps`, `area:dev-env`.
- Risk labels: `risk:breaking-change`, `risk:security-sensitive`, `risk:external-service`, `risk:migration`, `risk:release`.

Every task should have at least one `type:*` label and one `area:*` label. Add `risk:*` labels only when they help reviewers or agents choose validation depth.

Use this effort scale:

- `XS` means a small code fix or typo corrections.
- `S` means a small, localized change.
- `M` means a moderate change with limited cross-module impact.
- `L` means a larger feature, refactor, or behavior change that needs an ExecPlan before implementation.
- `XL` means a broad or high-risk feature, refactor, or behavior change that needs an ExecPlan before implementation.

Use this standard status set:

- `Open` means newly captured work that still needs triage before it is ready for the queue. Use `ahm task accept <id>` to move a task from `Open` to `Pending`.
- `Pending` means ready backlog work that can be picked up when its priority and dependencies allow. Tasks reach `Pending` via `ahm task accept <id>` (from `Open`) or directly when created with `--status Pending`.
- `In Progress` means the task is currently being worked. `ahm task start <id>` sets this status.
- `Blocked` means the task is not ready because it is underspecified, waiting on another task, or needs a product or design decision.
- `Tracking` means a parent task whose implementation happens through child tasks.
- `Completed` means the work is finished.
- `Cancelled` means the task has been abandoned and will not be worked on. Use this when a task is obsolete, superseded, no longer relevant, or explicitly declined.

## Updating Tasks

Tasks are working records. Prefer `ahm task ...` commands for lifecycle and
queue changes:

```bash
ahm task accept <id>
ahm task start <id>
ahm task dep add <id> <dependency-id>
ahm task complete <id>
ahm task cancel <id> --reason <text>
```

When a command can express the change, use it and do not run a separate
`ahm index` afterward. If you manually update front matter, move a task file,
or create a task by hand, run `ahm index` after the edit.

When editing by hand as a fallback, keep task storage consistent with status:

- Non-completed, non-cancelled tasks stay in `.agents/.tasks/active/`.
- Completed tasks move to `.agents/.tasks/completed/`.
- Cancelled tasks move to `.agents/.tasks/cancelled/`.
- When moving a task, keep the same filename so the stable task id is preserved.
- After moving or editing task metadata, regenerate the indexes.

Before marking a task as Completed, fill in Acceptance Notes when practical so
the completed record captures the verification and outcome. `ahm task complete`
warns when Acceptance Notes are missing, still contain the seeded `- [ ] TODO`
placeholder, or include unchecked checklist items. Repositories can set
`"strict_acceptance": true` in `.agents/ahm.json` to make those warnings block
completion unless `--force` is used. If you edit only the completed task body
afterward, no index regeneration is needed. If you edit task front matter
afterward, rerun `ahm index`.

To mark a task as Completed, prefer `ahm task complete <id>`. It sets the front-matter `status:` to `Completed`, moves the file from `.agents/.tasks/active/<id>.md` to `.agents/.tasks/completed/<id>.md`, changes directly dependent `Blocked` tasks to `Pending` when all of their dependencies are now complete, and regenerates the indexes in one step. Do not leave Completed tasks in `active/`.

To mark a task as Cancelled, use `ahm task cancel <id> --reason <text>`. It requires a non-empty reason, stores that reason in a `## Cancellation Reason` body section, sets the front-matter `status:` to `Cancelled`, moves the file from `.agents/.tasks/active/<id>.md` to `.agents/.tasks/cancelled/<id>.md`, and regenerates the indexes in one step. The global `--force` flag does not bypass the reason requirement. Do not leave Cancelled tasks in `active/`.

If a generated index is stale, do not patch the index directly. Fix the task file metadata or location, then rerun `ahm index`. Always go through `ahm`; do not invoke legacy scaffold scripts directly.

## Working a Task

When implementing a task, keep the change scoped to the task's problem statement and acceptance notes. Preserve unrelated worktree changes, and do not commit unless the user explicitly asks.

Before implementing any task, check its labels, effort, and risk.

- `Effort: L` and `Effort: XL` tasks must have an ExecPlan before code changes begin.
- If no ExecPlan exists for an `L` or `XL` task, create one under `.agents/exec-plans/active/` using `.agents/PLANS.md` before implementation.
- Update the task file to point to the ExecPlan and record whether the task is blocked on, tracked by, or completed by that plan.
- Update `.agents/exec-plans/active/index.md` when creating, completing, or moving an ExecPlan.
- For `Effort: S` or `Effort: M`, an ExecPlan is optional unless the task is a significant refactor, cross-cutting behavior change, or has substantial unknowns.

When completing a task with an ExecPlan, use this order:

1. Fill in task Acceptance Notes.
2. Update the ExecPlan Outcomes & Retrospective.
3. Move the ExecPlan from `.agents/exec-plans/active/` to `.agents/exec-plans/completed/`.
4. Update the task `exec_plan` field to the completed path.
5. Run `ahm task complete <id>` so the task moves to `.agents/.tasks/completed/` and indexes regenerate.

Tasks that introduce or change an architectural decision must have an Architecture Decision Record before implementation. ADRs live under `docs/adr/`; use `docs/adr/README.md` for the numbering, naming, and template rules.

- `type:feature` tasks require an ADR when they introduce or change user-visible behavior, persisted state, tool behavior, model-provider behavior, sandbox behavior, configuration shape, or another durable architectural contract.
- ADRs are also required for security-sensitive changes, breaking changes, migrations, major runtime dependencies, cross-platform behavior changes, and substantial changes in `area:sandbox`, `area:session`, `area:model`, `area:responses`, `area:chat`, `area:tools`, `area:prompts`, or `area:config`.
- ADRs are optional for localized fixes, tests, docs, small refactors, and implementation-only follow-through that does not create a new durable decision.
- When an ADR is required, create or update it before code changes begin, then reference it from the task body or implementation notes. If the task also requires an ExecPlan, the ExecPlan should cite the ADR and implement the accepted decision.

After finishing a task that changes code, config, dependencies, fixtures, or
templates, run the project's Full CI check as instructed in `AGENTS.md`. For
docs-only task updates, verify the Markdown and links; full CI is not required
unless code, config, dependency, fixture, or template files changed.
