# Documentation Workflow

This document explains how agents should audit and update documentation in this
repository. Use it when asked to check documentation, update docs after a
change, or decide whether completed work needs documentation follow-up.

## Purpose

Documentation should help future contributors understand what exists, why it
exists, how to use it, and how to change it safely. Keep documentation accurate,
specific, and close to the behavior it describes.

## Start Here

Before changing documentation:

1. Read the user request and identify what behavior, workflow, or decision
   changed.
2. Inspect the repository to discover its documentation conventions.
3. Prefer existing documentation locations and style over creating new ones.
4. Update durable project documentation only when the change affects users,
   operators, contributors, architecture, configuration, workflows, or supported
   behavior.
5. Do not edit generated indexes by hand.

## Documentation Discovery

Look for project documentation in common locations, including:

- `README*`
- `docs/`
- `CONTRIBUTING*`
- `CHANGELOG*`
- `ARCHITECTURE*`
- `DESIGN*`
- `docs/adr/`
- package, module, or app-specific documentation
- comments or examples that serve as user-facing guidance

Treat the repository's existing docs as the source for naming, structure, tone,
and level of detail.

## When Docs Need Updates

Consider documentation updates when a change affects:

- User-visible behavior
- Public APIs, commands, UI flows, configuration, or file formats
- Setup, installation, deployment, or operating instructions
- Security, permissions, data handling, or migration behavior
- Architecture, ownership boundaries, or durable design decisions
- Contributor workflows, testing instructions, or release process
- Known limitations, troubleshooting, or compatibility

Do not add documentation just because code changed. Internal refactors often
need no docs unless they change how people understand or work with the project.

## Project Docs vs Agent Artifacts

Project docs are durable repository documentation intended for humans working on
or using the project.

Agent artifacts are working records under `.agents/`, such as tasks, research
notes, ExecPlans, and generated indexes.

Keep these roles separate:

- Use project docs for durable behavior, architecture, and contributor guidance.
- Use tasks for actionable work and acceptance notes.
- Use research notes for evidence, investigation, and synthesis.
- Use ExecPlans for large or risky implementation plans.
- Use ADRs only if this repository has adopted ADRs or the change warrants a
  durable decision record.

## Generated Indexes

Generated indexes are owned by `ahm`. Do not edit them directly.

When task, research, or ExecPlan source files change, regenerate indexes with:

```bash
ahm index
```

## Documentation Audit

When auditing docs, check for:

- Missing docs for new or changed durable behavior
- Stale docs that describe behavior that no longer exists
- Contradictions between docs and implementation
- Broken relative links
- Orphaned agent artifacts not represented in generated indexes
- Generated indexes that are stale
- Task, research, or ExecPlan status that conflicts with file location or
  content
- Documentation that duplicates another source of truth instead of pointing to
  it or summarizing it appropriately

## Reporting Findings

Use severity levels:

- `error`: Docs are wrong, misleading, broken, or structurally inconsistent.
- `warning`: Docs are probably stale, incomplete, or missing useful context.
- `info`: Optional improvements or cleanup suggestions.

When reporting, include:

- The affected file or artifact
- The observed problem
- The expected correction
- Whether it was fixed or remains open

## Update Guidelines

When updating docs:

- Keep changes narrow and tied to the behavior that changed.
- Follow the existing style and organization.
- Prefer correcting an existing doc over adding a new one.
- Avoid creating broad architecture docs unless the project already uses them or
  the user asks for them.
- Do not invent policies that the repository does not already imply.
- Preserve uncertainty by recording open questions in tasks, research, or plans
  instead of presenting guesses as facts.

## Handoff

At handoff, summarize:

- Which documentation was checked
- Which files were updated
- Which generated indexes were regenerated, if any
- Any remaining documentation gaps or decisions needed
