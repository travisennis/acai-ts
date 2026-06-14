---
name: grooming-backlog
description: Go through Open, Pending, and Blocked tasks in the backlog and make sure all decisions are made, dependencies are correct, and no open questions remain. The goal is to get tasks into a ready state for work.
---

# Grooming Backlog

Use this skill when the backlog needs a grooming pass. Grooming moves tasks
from ambiguous, underspecified, or stale states into a ready state where an
agent can pick them up and work them without needing additional decisions or
clarification.

## Goals

- Every Open task is either Pending (ready to work), Blocked (blocker
  documented), or has a clear next action.
- Every Pending task has all product and design decisions recorded.
- Every Blocked task documents what it is blocked on and what would unblock it.
- Dependencies (`depends_on` and `exec_plan` fields) are accurate and complete.
- Task files are self-contained — no open questions in the body or comments.
- Generated indexes are regenerated via `ahm index`.

## When to groom

- Before a sprint or work cycle planning.
- When the backlog has accumulated stale Open or Blocked tasks.
- After a block of implementation work (to rebalance the queue).
- Any time an agent reports a task is too vague to work.

## Workflow

### 1. Inspect the queue

```bash
# Quick ready queue
ahm task ready

# Active tasks not ready
ahm task blocked
ahm task list --status Open

# Label vocabulary and counts
ahm task labels
```

If `ahm` is unavailable, read `.agents/.tasks/index.md` as the fallback queue
artifact and inspect the relevant files under `.agents/.tasks/active/`.

### 2. For each task that is not Completed or Cancelled, audit:

**Front matter invariants:**
- `status` is one of: `Open`, `Pending`, `In Progress`, `Blocked`, `Tracking`.
- `priority` is set and uses the project's priority scale.
- `effort` is set and uses the project's effort scale.
- `labels` include at least one `type:*` and one `area:*` label.
- `depends_on` references real task IDs. A task only depends on another if
  the dependency is genuinely blocking — not just "related to."
- `exec_plan` references an existing ExecPlan file when the task is `L` or
  `XL`, or documents that no plan is needed (`-`).

**Decision completeness:**
- If the Summary or Fix Direction presents alternatives (e.g., "use X or Y"),
  record which alternative was chosen and why. If none is chosen yet, flag
  the task as Blocked and document what decision is needed.
- If the task references external inputs (issues, design docs, conversations)
  that have since been resolved, capture the resolution in the task body.
- If the task is an `L` or `XL` without an ExecPlan, flag it.

**Body quality:**
- Acceptance Notes checklist should not contain `TODO` placeholders or
  unchecked items that should have been decided before work begins.
- Relevant files, modules, and commands listed in the task are still valid
  (paths exist, modules still in use).
- The task body does not contain "ask the user" or "decide later" phrasing
  without a corresponding Blocked status and blocker note.

**Dependency graph:**
- For each `depends_on` entry, check that the dependency exists and is not
  itself Blocked or Open. If a dependency is blocked, the depending task
  should also be Blocked with a note referencing the dependency.
- For each task that other tasks depend on, check that its status reflects
  that it is a dependency (e.g., if task 102 and 103 depend on 101, 101 should
  not be moved to Cancelled without unblocking or updating 102 and 103).

### 3. Fix what you can directly

- Use `ahm task accept`, `ahm task dep add`, `ahm task dep remove`,
  `ahm task cancel`, and other `ahm task ...` commands when they express the
  needed change.
- Update front matter status, priority, effort, labels, depends_on, or
  exec_plan by hand only when no command fits the change.
- Record decisions in the task body (add a `## Decision` section when
  recording a resolved choice).
- Remove stale `TODO` placeholders from Acceptance Notes when the question
  has been answered.
- If a task is superseded, obsolete, or no longer relevant, cancel it with
  `ahm task cancel <id> --reason <text>`.

### 4. Flag what needs human input

When a task needs a product, design, or architecture decision that an agent
cannot make alone:

1. Set `status: Blocked` in the task front matter.
2. Add or update the blocker note at the top of the task body:
   ```
   ## Blocker
   Awaiting decision on [describe what]. See [reference].
   ```
3. Do not leave the task Pending with undocumented open questions.

### 5. Regenerate indexes after manual edits

After manual edits:

```bash
ahm index
```

Verify no pending writes:

```bash
ahm --dry-run index  # should produce no output
```
