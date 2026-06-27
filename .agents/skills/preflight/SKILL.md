---
name: preflight
description: Run a focused review-readiness pass on a nearly finished change before commit. Scales the review to change size (XS/S = one pass, M = two passes, L/XL = three sequential passes covering rules conformance, correctness/source-of-truth, and overengineering). Then synthesize and apply the worthwhile fixes.
---

# Preflight

Use this skill after a change is functionally correct and before commit or
handoff. The PR, commit text, task notes, and final response should describe
already-preflighted code.

## Goals

Leave the smallest clear diff that still solves the issue. Run focused
review passes instead of one subjective read. Preserve behavior while
improving readability, correctness, and alignment with repo rules.

## Scale the review to the change size

Pick an effort level from the diff before reading anything else:

```bash
git diff --stat
git status --short
```

Include untracked new files from `git status --short` (or
`git ls-files --others --exclude-standard`) when choosing the scale. A split
into new files can look deceptively small in `git diff --stat` until those
files are staged.

| Change size                                     | Required context           | Review passes        | Compliance note |
| ----------------------------------------------- | -------------------------- | -------------------- | --------------- |
| **XS** (docs/skill/config only, ≤2 files)       | Root AGENTS.md if relevant | One combined pass    | One line        |
| **S** (single module, ≤~50 LOC, no public API)  | Root AGENTS.md, nearest nested AGENTS.md | One combined pass    | One line        |
| **M** (multi-file, ≤~200 LOC, no cross-module)  | + active task file, ExecPlan if one exists | Pass 1 + Pass 2      | Short block     |
| **L/XL** (cross-module, public API, agent loop, persistence, concurrency, external integrations, security boundaries) | + design docs and ADRs in the changed area | All three passes     | Full block      |

Only read context items that are relevant to the changed surface. Discover
them with targeted commands, e.g. `rg --files -g AGENTS.md`,
`rg --files docs/design-docs docs/adr`, `git diff -- <paths>`.

Required context items, in priority order:

- repo root `AGENTS.md`
- nested `AGENTS.md` files for the changed areas
- `ahm context task`, `ahm task show <id>` output when the work came from a
  task; open the active task file only when `ahm` is unavailable or when
  reviewing manual edits to the task file itself; use
  `.agents/.tasks/index.md` only as a fallback queue artifact when `ahm` is
  unavailable
- the relevant active exec plan when one exists for the current work
  (see `.agents/exec-plans/active/`)
- `ahm context plan` and `docs/design-docs/index.md` for L/XL changes
- any design doc or ADR directly relevant to the changed area
- the changed files and enough nearby context to review them

## Review passes

Treat each pass as a clean read with its own focus. Do not blur findings
across passes.

### Pass 1: Rules and documentation conformance

- Are we following `AGENTS.md`, nested `AGENTS.md`, and design docs?
- Did we drift from documented repo patterns or ownership boundaries?
- If the changed surface is user-visible CLI/API/config/file-format/workflow
  behavior, did we update the affected docs in the same change or record why
  the behavior is intentionally undocumented?
- If the work came from a task or ExecPlan, does the implementation match
  its acceptance notes and recorded decisions?
- Did we update task, ExecPlan, design doc, or ADR notes when the change
  discovered something durable?

### Pass 2: Correctness and source of truth

This pass is about project-native correctness at the changed surface.
Before reviewing, infer the project's language, framework, runtime, data
modeling style, and validation tools from the changed files plus nearby
manifests and scripts. Prefer explicit repo instructions in `AGENTS.md`,
package manifests, lockfiles, CI config, `Makefile`, `justfile`, and
existing tests over generic language advice.

Focus questions:

- Are we preserving canonical domain models, schemas, identifiers, and
  state machines, or did we stringify, parse, duplicate, or reshape data
  instead of carrying the project-owned representation?
- Did we introduce stringly typed sentinels, unvalidated dictionaries/maps,
  loosely shaped JSON, global state, or duplicated constants where the
  project normally uses a schema, class, struct, enum, type alias, database
  constraint, or shared config?
- Are fallible boundaries explicit about failure, with useful context and
  without swallowing parse, validation, network, filesystem, process,
  persistence, auth, or external-service errors?
- Are concurrency, async, transaction, lifecycle, and resource boundaries
  consistent with nearby code and the runtime in use?
- Are CLI/API/UI/database/config/external-integration boundaries validated
  at the edge and then represented with project-owned shapes downstream?
- Could an existing compiler, type checker, linter, schema validator,
  migration check, test helper, or narrower data model catch a mistake
  earlier than this implementation currently does?

### Pass 3: Overengineering and simplification

- Did we write more code than needed?
- Did we create helpers, abstractions, factories, wrappers, or indirection
  without enough payoff?
- Could the same result be expressed more directly?
- Are new modules, traits, builders, or generic helpers justified by real
  reuse or by an existing design boundary?

## Between-pass hygiene

Ground each pass in narrow local evidence. Use the smallest check that fits
the change:

- `git diff --stat` and `git diff -- <paths>` to keep review anchored
- formatters when formatting is affected, chosen from repo tooling
  (`gofmt`, `prettier`, `ruff format`, language-native formatters, or a
  documented script)
- focused tests in the changed area using the repo's normal runner
  (`go test`, `pytest`, `npm test`, `cargo test`, `bundle exec`, `make`,
  `just`, or the relevant framework command)
- type checks, linters, schema checks, migrations, generated-code checks, or
  build steps when public types, shared code, config, API contracts, database
  shape, or dependency behavior changed
- the repo's final validation command after code/config/dependency changes
  are complete, when one is documented in `AGENTS.md`, CI config, `Makefile`,
  `justfile`, package scripts, or project docs

For docs-only or skill-only edits, verify rendered Markdown and links by
inspection or `rg --files`; full CI is not required.

## Synthesis

After running the passes for the chosen scale, synthesize into one balanced
report with these headings:

- "How did we do?"
- "Feedback to keep"
- "Feedback to ignore"
- "Plan of attack"
- "Preflight compliance" (skip for XS; one line for S; short block for M;
  full block for L/XL — see template below)

## What to fix automatically

In an unattended implementation flow, apply worthwhile feedback before
commit. Prioritize:

- type drift, unnecessary cloning/string conversion, duplicated type defs
- violations of documented repo boundaries or design documents
- dead helpers, dead code, debug leftovers, placeholder text
- new panic/abort paths, placeholder exceptions, debug prints, commented-out
  code, broad lint suppressions, or ignored errors in production paths
- errors lacking actionable context at CLI/API/UI/database/config/process/
  network/external-service boundaries
- unnecessary wrappers or indirection removable locally without widening
  scope

Leave out feedback that is speculative, conflicts across passes, or would
widen scope materially. Mention it briefly in the synthesis.

## Compliance note

Make the chosen context auditable. Length scales with change size.

**XS / S example:**

```markdown
### Preflight compliance
- XS docs-only change to one skill file. Root AGENTS.md skim only; no
  nested AGENTS.md under the changed path; no CI required.
```

**M / L / XL template:**

```markdown
### Preflight compliance

- Root AGENTS.md: read
- Nested AGENTS.md: <paths or "none under changed paths">
- Task context: <task id> / not applicable because <reason>
- ExecPlan: <plan id> / not applicable because <reason>
- Design docs: <docs> / not applicable because <reason>
- ADRs: <adrs> / not applicable because <reason>
- Documentation impact: <docs checked/updated, or intentionally none because ...>
- Changed files and diff: reviewed via `git diff --stat` and targeted diffs
- Validation: <commands run>
```

Do not write blanket "no design docs to check" claims unless you actually
looked for a relevant one and can explain why the changed area has no
design-doc surface.

## Steps

1. Run `git diff --stat` and `git status --short`. Pick a scale from the
   table, counting untracked new files.
2. Read only the required-context items for that scale.
3. Run the review passes for that scale, with a narrow evidence check
   between them.
4. Synthesize findings into the balanced report.
5. Apply worthwhile feedback that is clearly in scope.
6. Rerun the narrowest affected validation, then the repo's documented
   final validation command when the finished work changed code, config, or
   dependencies.
7. Update task notes, ExecPlan notes, commit text, and PR/final response to
   describe the post-preflight state.

## Stop rules

- Do not turn this into a refactor unrelated to the ticket.
- Do not churn stable code outside the changed area just to make it
  prettier.
- If a cleanup is subjective and not clearly better, leave it alone.
- Do not blindly apply every finding from every pass.
- Do not run broad or slow checks repeatedly when a focused test already
  covers the current pass; save the repo's broad validation command for
  final validation.
- Do not escalate the scale beyond what the diff justifies just to feel
  thorough.
