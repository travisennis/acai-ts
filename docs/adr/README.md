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

Treat ADRs as decision history, not living specifications. Do not delete or rewrite an old ADR just because a later decision changes direction.

When new evidence, requirements, or implementation experience changes an accepted decision, create a new ADR instead of editing the old decision in place. The old ADR should continue to describe the decision that was accepted at the time.

Create a new ADR when:

- A later decision reverses, replaces, or materially changes an accepted architectural boundary.
- The old decision was correct when made, but new requirements, constraints, or implementation evidence changed the tradeoff.
- Multiple tasks or future contributors need a durable explanation of why the decision changed.

Update an existing ADR when:

- The decision itself is unchanged and the edit only clarifies wording, fixes stale references, or adds missing links.
- The ADR already anticipated the extension and the edit records detail without changing the accepted contract.
- A later ADR supersedes it; in that case, add a short supersession note with a link to the replacement ADR.

Full supersession is expressed through `ahm adr supersede <old-id> --by <new-id>`, which sets the old record's `status` to `superseded by ADR-NNN` and writes reciprocal body references.

Use `ahm adr supersede` only when the new ADR fully replaces the old decision. Partial supersession (when only part of an older decision is replaced) is represented by keeping the old ADR's status as `accepted` and recording the partial replacement in the body, usually under `## More Information`. The new ADR should state which part of the older decision it supersedes and list the older ADR in its References.

## Numbering and Naming

Use the next available three-digit number and a short kebab-case title:

```text
docs/adr/NNN-short-decision-title.md
```

`ahm adr create` allocates IDs automatically from the highest existing ADR number.

Keep existing numbers stable. Do not renumber ADRs after they are created or referenced.

## Status

Use one of these statuses, set in front matter:

| Status | Meaning |
| ------ | ------- |
| `proposed` | The decision is being drafted or reviewed. |
| `accepted` | The decision is approved and should guide implementation. |
| `rejected` | The decision was considered and declined. |
| `deprecated` | The decision is retained for history but should no longer guide new work. |
| `superseded by ADR-NNN` | A later ADR replaces this decision entirely. |

Use `ahm adr accept <id>`, `ahm adr reject <id>`, or `ahm adr deprecate <id>` to change an ADR's status. Use `ahm adr supersede <old-id> --by <new-id>` for full supersession.

When superseding an ADR, keep the old file on disk. The replacement ADR lists the superseded ADR in its `## More Information` section.

## Template

`ahm adr create <title>` generates a constrained MADR-profile ADR with scalar front matter and standard sections. The profile uses a subset of MADR 4.x:

- Front matter is `key: value` only (no YAML block lists, block scalars, or multi-line values).
- List-like fields (`decision-makers`, `consulted`, `informed`) use comma-separated scalar values.
- Unknown front matter fields are preserved on rewrite.

Example output:

```markdown
---
status: proposed
date: YYYY-MM-DD
decision-makers: Name, Name
consulted: Name
informed: task NNN
---
# Short Decision Title

## Context and Problem Statement

Describe the problem, constraints, prior behavior, and forces that make a decision necessary.

## Decision Drivers

- TODO

## Considered Options

- TODO

## Decision Outcome

Chosen option: TODO, because TODO.

### Consequences

- Good, because TODO.
- Bad, because TODO.

## More Information

- TODO
```

Use `ahm adr create --body-file <path>` for a fully custom body; `ahm` still owns ID allocation, front matter, the H1 heading, and file placement.

## ahm adr Commands

All ADR management commands operate on the `docs/adr/` directory and regenerate `docs/adr/index.md`.

| Command | Purpose |
| ------- | ------- |
| `ahm adr create <title> [flags]` | Create a new MADR ADR. Flags: `--status`, `--description`, `--body-file`, `--decision-makers`. |
| `ahm adr list [--status <value>]` | List ADRs, optionally filtered by status. |
| `ahm adr show <id>` | Show a single ADR. Accepts `9`, `009`, or `009-madr-slug`. |
| `ahm adr accept <id>` | Set status to `accepted`. |
| `ahm adr reject <id>` | Set status to `rejected`. |
| `ahm adr deprecate <id>` | Set status to `deprecated`. |
| `ahm adr supersede <old-id> --by <new-id>` | Mark one ADR as superseded by another with bidirectional body references. |
| `ahm adr migrate` | Convert legacy bold-metadata ADRs to the constrained MADR profile (metadata only). |

These commands update only front matter and managed body references (supersession notes). ADR body prose is user-owned and is not rewritten by lifecycle commands.

## Generated Index

`docs/adr/index.md` is a generated table of all ADRs with their current status and date. It is owned by `ahm` and must not be edited by hand. After manual ADR changes (creating by hand, editing front matter directly), regenerate it with:

```bash
ahm index
```

`ahm status` and `ahm doctor` report ADR workflow issues, including malformed records, invalid statuses, filename/metadata ID mismatches, supersession references to missing ADRs, stale generated indexes, and legacy-format ADRs that need migration.
