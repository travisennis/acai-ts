# ADR Plan

This document outlines planned Architecture Decision Records for acai-ts.

## Purpose

ADRs document significant technical decisions, the context that led to them, and the consequences. They serve as:

- Onboarding material for new contributors
- Historical record of why code is structured a certain way
- Reference when evaluating refactoring or replacement options

## Format

Each ADR uses this structure:

```markdown
# ADR-XXX: Title

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD
**Deciders:** Name

## Context

What problem are we solving? What constraints exist?

## Decision

What did we decide to do?

## Consequences

### Positive
- ...

### Negative
- ...

## Alternatives Considered

- **Option name:** Why rejected
```

## Planned ADRs

| # | Title | Priority | Status | Notes |
|---|-------|----------|--------|-------|
| 001 | Use AI SDK for Model Abstraction | High | Documented | Multiple providers, unified interface |
| 002 | Skills System Architecture | High | Documented | Discovery, validation, loading, invocation |
| 003 | Tool Calling Interface | High | Documented | Bash, Read, Edit, Search, Web, etc. |
| 004 | Session Persistence Format | Medium | Documented | JSON structure, token tracking, summaries |
| 005 | Sub-agent Communication | Medium | Documented | How subagents pass context to parent |
| 006 | TUI Component Model | Medium | Documented | Custom rendering loop, component lifecycle |
| 007 | Multi-provider Fallback Strategy | Medium | Documented | Model selection, failure handling |
| 008 | Token Tracking Strategy | Medium | Documented | Estimation, reporting, limits |
| 009 | Dynamic Tool Loading | Low | Documented | `.acai/tools/` discovery mechanism |
| 010 | Piped Input Handling | Low | Documented | REPL vs CLI mode differences |

## Workflow

1. Create new ADR file: `docs/adr/adr-XXX.md`
2. Fill in format with current state (Status: Proposed)
3. Review for accuracy
4. Update Status to Accepted once confirmed
5. Never delete ADRs. Deprecate or supersede instead.

## Naming

- Files: `adr-XXX.md` (zero-padded 3-digit numbers)
- References: `See ADR-XXX` in code comments when relevant
