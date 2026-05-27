# Research Workflow

This document explains how research artifacts are handled in this repository. When you are asked to create, update, organize, or use research, read this file first, then use `.agents/.research/index.md` as the map and open the relevant files under `.agents/.research/`.

## Research Storage

Research lives in `.agents/.research/`. The directory is intentionally lightweight: it should be easy to capture rough notes, but durable notes should make their status, source, and relationship to project work clear.

Use these subdirectories:

- `inbox/` for raw ideas, pasted notes, and thin captures that have not been triaged.
- `investigations/` for project-specific findings from debugging, profiling, code reading, session analysis, or behavior checks.
- `sources/` for notes from external articles, papers, documentation, tools, or open source repositories.
- `topics/` for synthesized, durable notes about an area of this project or an idea that may feed several tasks or plans.
- `archived/` for stale or superseded notes kept for historical reference.

The file `.agents/.research/index.md` is the generated research map. Use it to orient yourself, but always open the source research file before relying on a note.

## Creating Research

Put rough, untriaged material in `inbox/` unless the user or context clearly identifies a better location. Prefer a short, descriptive kebab-case filename.

Use this header for durable research documents when it is useful. Raw inbox notes may be shorter.

```md
# Title

Status: inbox | active | synthesized | superseded | archived
Created: YYYY-MM-DD
Updated: YYYY-MM-DD
Related tasks: -
Related plans: -
Confidence: low | medium | high

## Summary

## Notes / Evidence

## Implications for this project

## Follow-ups
```

## Using Research

Research is not automatically authoritative. Before using a research note to justify implementation work, check its status, date, confidence, evidence, and whether a newer task, ExecPlan, or source file supersedes it.

If a research finding implies actionable work, either link an existing task or create one under `.agents/.tasks/`. If the finding is broad, risky, or implementation-heavy, promote it into an ExecPlan under `.agents/exec-plans/active/`.

Research should usually flow from rough capture to durable project work:

```text
inbox note -> investigation/source/topic synthesis -> task or ExecPlan -> completed artifact
```

## Updating Research

When a note becomes stale, do not silently delete useful context. Mark it `superseded` or move it to `archived/`, and add a short note explaining what replaced it.

When adding, moving, archiving, or renaming research files, regenerate the indexes with `ahm index`.
