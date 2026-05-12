---
name: deslop
description: Run a focused review-readiness pass on a nearly finished acai-ts change before commit or handoff. Executes three sequential review passes (rules conformance, type safety, overengineering) to catch issues, then synthesizes and applies the worthwhile fixes.
---

# Deslop

Use this skill after a change is functionally correct and before a commit or handoff. The PR, commit text, task notes, or final response should describe already-deslopped code, not code that still needs cleanup.

## Goals

Leave the smallest clear diff that still solves the issue.
Run multiple focused review passes instead of relying on one final subjective read.
Preserve behavior while improving readability, type safety, and alignment with acai-ts repo rules.

## Required Context

Before reviewing, read:

- repo root `AGENTS.md`
- nested `AGENTS.md` files for the changed areas, if any
- `.agents/TASKS.md`, `.agents/.tasks/index.md`, and the active task file when the work came from a task
- `.agents/PLANS.md`
- `docs/README.md`
- any ADR directly relevant to the changed area, especially under `docs/adr/`
- the relevant active ExecPlan when one exists for the current work
- the changed files and enough nearby context to review them properly

If working on an ExecPlan, also inspect `.agents/exec-plans/active/`. When a plan clearly matches the current task, study it before reviewing because it often contains context, constraints, and acceptance criteria not captured in the task or ADRs.

## Review Protocol

Run these three reviews sequentially, treating each as a clean pass with its own focus. Do not blur findings between passes.

### Pass 1: Rules and Documentation Conformance

- Are we following `AGENTS.md`, nested `AGENTS.md`, docs, ADRs, and existing repo patterns?
- Did we drift from documented module boundaries in `source/`, especially commands, tools, models, sessions, prompts, terminal/TUI, and config?
- If the work came from a task or ExecPlan, does the implementation match its acceptance notes and recorded decisions?
- Did we update task, ExecPlan, README, architecture, docs, or ADR notes when the change added or removed files, added or removed features, or discovered durable behavior?
- Are manual testing expectations honored for REPL/TUI changes by using the `manual-testing` skill and tmux workflow when needed?

### Pass 2: Type Safety and Source of Truth

- Are we preserving canonical TypeScript types instead of cloning shape definitions or drifting into `any`, broad `unknown`, or untyped JSON plumbing?
- Did we stringify, parse, or convert data where carrying the existing typed value would be clearer?
- Did we introduce non-null assertions, broad casts, broad lint suppressions, `// @ts-ignore`, `// @ts-expect-error`, or silent fallbacks where a typed result, schema, or explicit error would be better?
- Are Zod schemas, AI SDK provider inputs, OpenAI-compatible tool schemas, session records, config files, and dynamic tool boundaries validated at the edge and represented with repo-owned types downstream?
- For agent/LLM tool schemas, did we avoid `.optional()` for provider-sent fields unless the field may truly be omitted from generated JSON Schema?
- Are fallible APIs explicit about failure, with useful context and without swallowing serialization, session, provider, filesystem, or tool execution errors?
- Are async boundaries clear, with no unnecessary blocking filesystem or process work added inside latency-sensitive paths unless nearby code already accepts it?
- Could a mistake slip to runtime that TypeScript, Zod, or a narrower union/object type could catch earlier?

### Pass 3: Overengineering and Simplification

- Did we write more code than needed?
- Did we create helpers, abstractions, factories, wrappers, classes, or indirection without enough payoff?
- Could the same result be expressed more directly in the changed module?
- Are new modules or public exports justified by real reuse or by an existing design boundary?
- Did we preserve the CLI app shape instead of introducing library-style public API surface without a project reason?
- Did we avoid churn in stable code outside the changed area?

After all three passes, synthesize findings into one balanced report with these headings:

- "How did we do?"
- "Feedback to keep"
- "Feedback to ignore"
- "Plan of attack"

## Between-Pass Hygiene

Between each review pass, ground the pass in concrete local evidence. Use the narrowest checks that fit the change:

- `git diff --stat` and `git diff -- <paths>` to keep the review anchored to the actual changed surface.
- `npm run typecheck` when types, schemas, provider contracts, sessions, config, tools, or shared code changed.
- `npm run lint -- path/to/file.ts` or `npm run lint` when lint behavior or TypeScript source changed.
- `node --no-warnings --require ./test/setup.js --test test/path/to/test.ts` for focused tests in the changed area.
- `npx fallow --summary` when code generation, dead code, complexity, or architecture drift is a meaningful risk.
- `npm run check` after code, config, or dependency changes are complete, as required by repo instructions.

For docs-only or skill-only edits, read the rendered Markdown structure and verify links/paths by inspection or `rg --files`; full checks are not required unless code, config, or dependency files changed.

## What to Fix Automatically

If you are in an unattended implementation flow, apply the worthwhile feedback immediately before commit. Prioritize:

- type drift, unnecessary casting, unnecessary JSON conversion, or duplicated type definitions
- violations of documented repo boundaries, ADRs, or task/ExecPlan acceptance notes
- dead helpers, dead code, debug leftovers, placeholder text, or stale comments
- new broad casts, non-null assertions, `todo`, `console.log`, `debugger`, `// @ts-ignore`, or broad lint suppressions
- errors that lack actionable context at CLI, provider, session, config, filesystem, or tool boundaries
- unnecessary wrappers or indirection that can be removed locally without widening scope

If feedback is speculative, conflicts across passes, or would widen scope materially, leave it out and mention it briefly in the synthesis/workpad.

## Steps

1. Gather the context listed in Required Context.
2. Run Pass 1 (rules and docs conformance) and record findings.
3. Run a narrow evidence check such as `git diff --stat`, a focused test, `npm run typecheck`, or Markdown/path inspection.
4. Run Pass 2 (type safety) and record findings.
5. Run the next narrow evidence check that fits the risks found so far.
6. Run Pass 3 (overengineering/simplification) and record findings.
7. Synthesize all findings into the balanced report.
8. Apply the worthwhile feedback that is clearly in scope.
9. Rerun the narrowest affected validation immediately, then run `npm run check` when the finished work changed code, config, or dependencies.
10. Update task notes, ExecPlan notes, commit text, PR-facing text, or final response so they describe the final post-deslop state rather than the earlier draft state.

## Stop Rules

- Do not turn this into a refactor unrelated to the ticket.
- Do not churn stable code outside the changed area just to make it prettier.
- If a cleanup is subjective and not clearly better, leave it alone.
- Do not blindly apply every finding from every pass.
- Do not run broad or slow checks repeatedly when a focused test already covers the current pass; save `npm run check` for final validation after code, config, or dependency changes.
