# Architecture Decision Records

This directory contains Architecture Decision Records for this project. ADRs capture durable technical decisions, their context, and the tradeoffs accepted at the time. They are not implementation plans; use ExecPlans for step-by-step delivery planning.

## When to Write an ADR

Write or update an ADR before implementation when a task introduces or changes an architectural decision.

ADR-required triggers:

- `type:feature` tasks that introduce or change user-visible behavior, persisted state, tool behavior, model-provider behavior, sandbox behavior, configuration shape, or another durable architectural contract.
- Security-sensitive changes, including command execution, filesystem access, network access, secrets, auth headers, logging redaction, sandbox boundaries, or permission escalation.
- Breaking changes, deprecations, migrations, compatibility changes, or changed default behavior.
- New major runtime dependencies that affect behavior, security posture, binary size, licensing, or platform support.
- Cross-platform behavior changes, especially macOS/Linux divergence.
- Substantial changes in `area:sandbox`, `area:session`, `area:model`, `area:responses`, `area:chat`, `area:tools`, `area:prompts`, or `area:config`.

ADRs are usually optional for localized bug fixes, tests, docs, small refactors, and implementation-only follow-through that does not create a new durable decision. When in doubt, prefer a short ADR over leaving an important decision implicit.

## Relationship to Tasks and ExecPlans

- `.agents/TASKS.md` defines when task work requires an ADR.
- Create or update the ADR before code changes begin.
- Reference the ADR from the task body or implementation notes.
- If the same task requires an ExecPlan, the ExecPlan should cite the ADR and describe how it will implement the accepted decision.
- If implementation discovers that the decision needs to change, update the ADR before continuing.

## Changing Existing Decisions

Treat ADRs as decision history, not living specifications. Do not delete or
rewrite an old ADR just because a later decision changes direction.

Create a new ADR when:

- A later decision reverses, replaces, or materially changes an accepted
  architectural boundary.
- The old decision was correct when made, but new requirements, constraints, or
  implementation evidence changed the tradeoff.
- Multiple tasks or future contributors need a durable explanation of why the
  decision changed.

Update an existing ADR when:

- The decision itself is unchanged and the edit only clarifies wording, fixes
  stale references, or adds missing links.
- The ADR already anticipated the extension and the edit records detail without
  changing the accepted contract.
- A later ADR supersedes it; in that case, add a short supersession note with a
  link to the replacement ADR.

When superseding only part of an ADR, keep the original status visible and mark
the partial replacement explicitly, such as `Accepted, superseded in part by ADR
NNN`. The new ADR should state which part of the older decision it supersedes
and list the older ADR in its References.

## Numbering and Naming

Use the next available three-digit number and a short kebab-case title:

```text
006-short-decision-title.md
```

Keep existing numbers stable. Do not renumber ADRs after they are merged or referenced.

## Status

Use one of these statuses:

- `Proposed`: The decision is being drafted or reviewed.
- `Accepted`: The decision is approved and should guide implementation.
- `Superseded`: A later ADR replaces this decision.
- `Superseded in part`: A later ADR replaces part of this decision while the
  rest still applies.
- `Deprecated`: The decision is retained for history but should no longer guide new work.

When superseding an ADR, keep the old file and add a note that links to the replacement ADR. The replacement ADR should also list the superseded ADR in its References.

## Template

```markdown
# ADR NNN: Short Decision Title

**Status:** Proposed
**Date:** YYYY-MM-DD

## Context

Describe the problem, constraints, prior behavior, and forces that make a decision necessary.

## Decision

State the chosen approach clearly. Include the stable contracts, ownership boundaries, data shapes, or behavior that future work should preserve.

## Rationale

- Explain why this approach fits this project.
- Record the most important tradeoffs.
- Note any constraints that made other choices less suitable.

## Consequences

- **Positive**: What becomes simpler, safer, more observable, or more capable.
- **Negative**: Costs, limitations, migration burden, operational risk, or future maintenance concerns.

## Alternatives Considered

- **Alternative name**: Explain why it was rejected.

## References

- Related task, ExecPlan, design doc, source module, issue, or previous ADR.
```

Keep ADRs concise, but make the decision specific enough that another agent can use it without reconstructing the original discussion.
