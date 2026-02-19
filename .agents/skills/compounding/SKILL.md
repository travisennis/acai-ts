---
name: compounding
description: Analyzes the current session to identify self-improvement opportunities for acai.
---

# Compounding Skill

Analyzes the current session to identify self-improvement opportunities for acai.

## When to Use

Invoke this skill at the end of a session when:
- The session revealed gaps in acai's knowledge or capabilities
- Tool descriptions caused confusion or misuse
- Repeated patterns suggest a new tool or workflow would help
- Errors occurred that indicate systemic issues

## Analysis Process

### 1. Session Analysis

Review the current session messages in context for patterns indicating improvement opportunities:

- **System prompt gaps**: Missing context, unclear instructions, assumptions that failed
- **Tool description issues**: Unclear parameters, missing edge cases, confusing descriptions
- **Repeated tool patterns**: Same tool sequences used repeatedly (potential new tool)
- **Error patterns**: Tool failures, retries, or workarounds

### 2. Log Analysis

Read `~/.acai/logs/current.log` using the Read tool to identify error patterns:

1. Filter for error indicators: `Error`, `Exception`, `Failed`, `warn`
2. Cross-reference errors with session tool calls
3. Distinguish systemic issues from one-off errors

### 3. Source File Analysis

Cross-reference findings with source files:

- **System prompt**: `source/prompts.ts` - core prompt components
- **Tool descriptions**: `source/tools/*.ts` - each tool has a `description` string

## Output Format

Present findings as a structured report:

```
## Session Improvement Analysis

### System Prompt Gaps
- [finding 1]
- [finding 2]

### Tool Description Issues
- [finding 1]
- [finding 2]

### Potential New Tools/Capabilities
- [finding 1]

### Error Patterns (from logs)
- [finding 1]
```

## User Selection

After presenting findings, ask the user to select which improvements to accept:

1. Number each finding
2. Present as a selection menu
3. User responds with numbers (e.g., "1, 3, 5")

## Writing Improvements

For accepted findings, write to `improvements.md` in the project root:

```markdown
# Improvement Recommendations

## System Prompt
- [accepted finding with context]

## Tool Descriptions
- [accepted finding with specific tool and suggested change]

## New Capabilities
- [accepted finding with rationale]
```

## Out of Scope

- Modifying source files directly
- Auto-applying changes
- Analyzing historical/saved sessions
- Tool implementation or code changes
