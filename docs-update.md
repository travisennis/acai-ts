# Documentation Update Plan

## Current Documentation Overview

| Document | Coverage |
|----------|----------|
| `README.md` | High-level overview, quick start, project structure |
| `docs/usage.md` | CLI flags, commands, keyboard shortcuts, prompt mentions |
| `docs/configuration.md` | Environment variables, project & global config |
| `docs/skills.md` | Skills system, YAML frontmatter, locations, arguments |
| `docs/dynamic-tools.md` | Dynamic tools, writing tools, examples |
| `ARCHITECTURE.md` | File structure, descriptions, flow diagrams |
| `CONTRIBUTING.md` | Development setup, scripts, code style |

---

## Areas Completely Missing Documentation

### 1. Modes System (HIGH PRIORITY)

The `source/modes/` directory implements Normal, Planning, and Research modes with keyboard shortcuts (Shift+Tab) to cycle between them. This is a core feature with mode-specific prompts but has **zero documentation**.

### 2. Subagents System (HIGH PRIORITY)

The `source/subagents/` directory provides a subagent system similar to Claude Code's agents. Supports:
- Custom subagents in `~/.acai/subagents/` and `.acai/subagents/`
- YAML frontmatter with name, description, model, tools, timeout
- Custom system prompts
- **No documentation exists**

### 3. AGENTS.md Guide

Referenced throughout but users have no guidance on:
- What to put in an AGENTS.md file
- How it affects AI behavior
- Best practices for project-specific rules

### 4. Session Management

- How sessions are stored (`~/.acai/sessions/`)
- Session metadata and token tracking
- Resume options (`--continue`, `--resume`, `--pickup`)
- **No documentation**

### 5. Token Tracking & Costs

The `/session` command shows usage and costs, but there's no documentation about:
- How tokens are counted
- Cost calculation methodology
- What gets tracked

### 6. Tool System

- Tool execution and approval workflow
- Tool timeout handling
- Which tools are available and their purposes
- Only basic tool list in `/list-tools` command help

### 7. Multi-Workspace Support

Mentioned in README but not detailed:
- How to add/remove working directories
- How file references work across directories
- Directory management commands

### 8. Git Integration

Commands that exist but aren't documented:
- `/init` - Generate AGENTS.md from project analysis
- `/handoff` - Hand off to another agent
- `/share` - Share session as GitHub Gist

### 9. Code Search Tool

`source/tools/code-search.ts` provides semantic code search but has **no documentation**.

### 10. Web Fetch Tool

Uses Jina AI for HTML cleaning with local Cheerio fallback, but **not documented**.

### 11. Health Check Command

`/health` checks system dependencies but there's no documentation about:
- What it validates
- How to interpret results

### 12. Review Command

Code review functionality exists but **not documented**.

### 13. History Command

`/history` for viewing/managing conversation history has **no documentation**.

### 14. Init Project Command

`/init-project` for initializing new projects is **not documented**.

### 15. Available Models

Users need to know which models are available and how to specify them, but there's no comprehensive model list.

---

## Areas Needing Better Documentation

### 1. Configuration File (.acai/acai.json)

The docs show a basic example but miss:
- All available options
- Default values
- Override precedence

### 2. Skills System

Could benefit from:
- More advanced examples
- Debugging tips
- Common patterns

### 3. Dynamic Tools

Good basics but needs:
- More complex examples
- Error handling best practices
- Testing strategies

### 4. Prompt Mentions

The `@` syntax is documented but could use:
- More examples
- Edge cases
- Interaction with different tools

### 5. Middleware System

`source/middleware/` has cache and rate-limiting but no documentation about:
- What gets cached
- Cache invalidation
- Rate limits

---

## Summary

### Missing Documentation (Priority Order):

1. **Modes System** - Core feature completely undocumented
2. **Subagents System** - Major extensibility feature undocumented
3. **AGENTS.md Guide** - Critical for user customization
4. **Tool System** - How tools work, approval, execution
5. **Session Management** - How sessions work
6. **Token Tracking & Costs** - Usage reporting
7. **Git Integration Commands** - handoff, share, init
8. **Multi-Workspace** - Working across directories
9. **Code Search Tool** - Semantic search
10. **Web Fetch Tool** - Web content fetching
11. **Health Check** - System validation
12. **Review/History/Init Commands**
13. **Available Models List**

### Needs Better Documentation:

1. Configuration file options
2. Skills advanced examples
3. Dynamic tools advanced examples
4. Prompt mentions edge cases
5. Middleware (cache, rate-limit)
