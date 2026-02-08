---
name: "planning"
description: Create detailed implementation plans with thorough research and iteration
---

# Implementation Plan

You are tasked with creating detailed implementation plans through an interactive, iterative process. You should be skeptical, and thorough to produce high-quality technical specifications.

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
   - Research documents (e.g., `./research.md`)
   - Related implementation plans
   - Any JSON/data files mentioned
   - **IMPORTANT**: Read entire files, not partial content
   - **NEVER** read files partially - if a file is mentioned, read it completely

2. **Research the codebase to gather context**:
   Before asking the user any questions, research systematically:

   - Use `Glob` to find files by name patterns related to the ticket/task
   - Use `LS` to explore relevant directory structures
   - Use `Grep` to find specific patterns, function names, or references
   - Use `Read` to understand how the current implementation works

   Your research should:
   - Find relevant source files, configs, and tests
   - Trace data flow and key functions
   - Identify patterns and conventions to follow
   - Note file:line references for important discoveries

3. **Create a scratchpad** to track your planning progress:
   - Create `./scratchpad.md` to track what you've explored and decisions made
   - Update it as you complete research and make progress

4. **Analyze and verify understanding**:
   - Cross-reference the ticket requirements with actual code
   - Identify any discrepancies or misunderstandings
   - Note assumptions that need verification
   - Determine true scope based on codebase reality

### Step 2: Research & Discovery

After getting initial understanding:

1. **If there were any misunderstanding**:
   - Research to verify the correct information
   - Read the specific files/directories found
   - Only proceed once you've verified the facts

2. **Conduct deeper investigation as needed**:
   - Use `Glob` to find more specific files
   - Use `Grep` to understand implementation details
   - Look for similar features you can model after
   - Check `.research/` for any related research or decisions

### Step 3: Detailed Plan Writing

1. **Write the plan** to `./plans.md`

2. **Delete the scratchpad** once the plan is complete

3. **Use this template structure**:

````markdown
# [Feature/Task Name] Implementation Plan

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints discovered]

## Desired End State

[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `[test command]`
- [ ] Type checking passes: `[typecheck command]`
- [ ] Linting passes: `[lint command]`
- [ ] Build succeeds: `[build command]`

#### Manual Verification:
- [ ] Feature works as expected when tested via UI
- [ ] Performance is acceptable under load
- [ ] Edge case handling verified manually
- [ ] No regressions in related features

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]

[Similar structure with both automated and manual success criteria...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing Steps:
1. [Specific step to verify feature]
2. [Another verification step]
3. [Edge case to test manually]

## Performance Considerations

[Any performance implications or optimizations needed]

## Migration Notes

[If applicable, how to handle existing data/systems]

## References

- Original ticket/issue: `[ticket-name]`
- Similar implementation: `[file:line]`
````

### Step 5: Review

1. **Present the draft plan location**:
   ```
   I've created the initial implementation plan at:
   `./plans.md`
   ```

## Important Guidelines

1. **Be Skeptical**:
   - Question vague requirements
   - Identify potential issues early
   - Ask "why" and "what about"
   - Don't assume - verify with code

2. **Be Interactive**:
   - Don't write the full plan in one shot
   - Get buy-in at each major step
   - Allow course corrections
   - Work collaboratively

3. **Be Thorough**:
   - Read all context files COMPLETELY before planning
   - Research actual code patterns using Glob, Grep, and Read
   - Include specific file paths and line numbers
   - Write measurable success criteria with clear automated vs manual distinction

4. **Be Practical**:
   - Focus on incremental, testable changes
   - Consider migration and rollback
   - Think about edge cases
   - Include "what we're NOT doing"

5. **Track Progress**:
   - Use `./scratchpad.md` to track planning tasks
   - Update the scratchpad as you complete research
   - Delete the scratchpad when the plan is finalized

6. **No Open Questions in Final Plan**:
   - If you encounter open questions during planning, STOP
   - Research or ask for clarification immediately
   - Do NOT write the plan with unresolved questions
   - The implementation plan must be complete and actionable
   - Every decision must be made before finalizing the plan

## Success Criteria Guidelines

**Always separate success criteria into two categories:**

1. **Automated Verification** (can be run by the agent):
   - Commands that can be run: test, lint, typecheck, build commands
   - Specific files that should exist
   - Code compilation/type checking
   - Automated test suites

2. **Manual Verification** (requires human testing):
   - UI/UX functionality
   - Performance under real conditions
   - Edge cases that are hard to automate
   - User acceptance criteria

**Format example:**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Database migration runs successfully: `[migration command]`
- [ ] All unit tests pass: `[test command]`
- [ ] No linting errors: `[lint command]`
- [ ] API endpoint returns 200: `curl localhost:8080/api/new-endpoint`

#### Manual Verification:
- [ ] New feature appears correctly in the UI
- [ ] Performance is acceptable with 1000+ items
- [ ] Error messages are user-friendly
- [ ] Feature works correctly on mobile devices
```

## Common Patterns

### For Database Changes:
- Start with schema/migration
- Add store methods
- Update business logic
- Expose via API
- Update clients

### For New Features:
- Research existing patterns first
- Start with data model
- Build backend logic
- Add API endpoints
- Implement UI last

### For Refactoring:
- Document current behavior
- Plan incremental changes
- Maintain backwards compatibility
- Include migration strategy

