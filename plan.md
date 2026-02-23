# Tool-Error Verbose Mode Implementation Plan

## Overview

Implement a fix for issue #129: Tool-error output should only be shown in verbose mode (ctrl+o), not by default. The fix requires adding a verbose mode check to the tool-call-error event handler in the ToolExecutionComponent, matching the existing pattern used for tool-call-end events.

## GitHub Issue Reference

- Issue URL: https://github.com/travisennis/acai-ts/issues/129

## Current State Analysis

- Tool errors are displayed regardless of verbose mode setting
- The `tool-call-error` case in `renderDisplay()` method (lines 72-80 of `source/tui/components/tool-execution.ts`) has NO verbose mode check
- This contrasts with `tool-call-end` (lines 67-70) which correctly checks `this.verboseMode` before rendering output

### Key Discovery:
- `source/tui/components/tool-execution.ts:72-80` - The bug location, tool-call-error always renders
- `source/tui/components/tool-execution.ts:67-70` - Pattern to follow, tool-call-end checks verbose mode

## Desired End State

Tool errors are hidden by default and only displayed when verbose mode is enabled (Ctrl+O toggled on). The behavior should match tool-call-end events.

### Success Criteria:
1. Tool errors are NOT displayed when verbose mode is OFF (default)
2. Tool errors ARE displayed when verbose mode is ON (Ctrl+O pressed)
3. Toggling verbose mode updates all existing tool execution components correctly

## What We're NOT Doing

- Adding new tests (the codebase currently has no tests for this behavior)
- Modifying the documentation (verbose mode is already documented)
- Adding error handling at the display layer (errors are always valid strings)
- Changing how tool-call-start or other events are rendered

## Implementation Approach

Add a verbose mode check to the tool-call-error case in the renderDisplay() method of ToolExecutionComponent, following the exact pattern used for tool-call-end events. This is a single-file, single-location change.

---

## Phase 1: Add Verbose Mode Check to Tool-Call-Error

### Overview
Modify the tool-call-error event handler to check verbose mode before rendering error output.

### Changes Required:

#### 1. ToolExecutionComponent
**File**: `source/tui/components/tool-execution.ts`
**Lines**: ~72-80 (in the `renderDisplay()` method, inside the switch statement)

**Current code**:
```typescript
case "tool-call-error":
  this.contentContainer.addChild(
    new Text(
      `└ ${this.handleToolErrorMessage(event.msg)}`,
      1,
      0,
      bgColor,
    ),
  );
  break;
```

**New code**:
```typescript
case "tool-call-error":
  // Only render error in verbose mode
  if (this.verboseMode) {
    this.contentContainer.addChild(
      new Text(
        `└ ${this.handleToolErrorMessage(event.msg)}`,
        1,
        0,
        bgColor,
      ),
    );
  }
  break;
```

This matches the pattern used for `tool-call-end` at lines 67-70.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] Run the REPL (`acai` or `node source/index.ts`)
- [x] Execute a tool that will fail (e.g., a tool with invalid parameters)
- [x] Verify error is NOT shown by default (verbose mode OFF)
- [x] Press Ctrl+O to enable verbose mode
- [x] Execute the same failing tool again
- [x] Verify error IS shown when verbose mode is ON
- [x] Press Ctrl+O again to disable verbose mode
- [x] Verify error is NOT shown again

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering this task complete.

---

## Testing Strategy

### Manual Testing Steps:
1. Start the REPL in tmux (required for interactive testing)
2. With verbose mode OFF (default):
   - Run a command that triggers a tool error
   - Confirm error message is NOT visible in output
3. Press Ctrl+O to toggle verbose mode ON
4. Run the same command:
   - Confirm error message IS visible
5. Press Ctrl+O again to toggle verbose mode OFF
6. Run the command again:
   - Confirm error message is NOT visible
7. Test edge case: Toggle verbose mode WHILE a tool is executing
   - Should not cause crashes or rendering issues

### Test Command Ideas:
- Use a tool with invalid parameters to trigger an error
- Check logs at `~/.acai/logs/current.log` for any errors

## Performance Considerations

No performance implications - this is a simple conditional check that matches existing patterns.

## Migration Notes

No migration needed - this is a bug fix that changes default behavior to be more user-friendly.

## References

- GitHub issue: https://github.com/travisennis/acai-ts/issues/129
- Related research: `research.md`
- Pattern to follow: `source/tui/components/tool-execution.ts:67-70` (tool-call-end)
- Similar implementation: `source/tui/components/thinking-block.ts` (thinking blocks also check verbose mode)
