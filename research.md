# Tool-Error Output and Verbose Mode Research

## Research Question

How does tool-error output and verbose mode work in the acai-ts codebase, and what changes are needed to make tool errors only show in verbose mode (ctrl+o) instead of by default?

## Overview

This research investigates how tool errors are displayed to users and how verbose mode is implemented. The goal is to understand why tool errors are currently shown regardless of verbose mode setting and identify the code changes needed to gate tool error output behind verbose mode.

## Key Findings

### Finding 1: Tool Error Display Location

**Description**: Tool errors are displayed in the `ToolExecutionComponent` class in the TUI components.

**Evidence**: `source/tui/components/tool-execution.ts`

The `ToolExecutionComponent` class renders tool execution events, including errors. In the `renderDisplay()` method (lines 53-80), there are two event handlers:

1. **Line 67-70** - `tool-call-end` events: Correctly checks verbose mode before displaying output:
   ```typescript
   case "tool-call-end":
     // Only render output in verbose mode
     if (this.verboseMode && event.msg) {
       this.contentContainer.addChild(this.renderOutputDisplay(event.msg));
     }
     break;
   ```

2. **Line 72-80** - `tool-call-error` events: **NO verbose mode check** - always displays:
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

This is the root cause of the issue. The `tool-call-error` event type is not gated behind the verbose mode check, so errors are always displayed regardless of the verbose mode setting.

### Finding 2: Verbose Mode Implementation (Ctrl+O Toggle)

**Description**: Verbose mode is a boolean flag in the REPL class that toggles detailed output display for thinking blocks and tool executions.

**Evidence**: `source/repl/index.ts:117-118`:
```typescript
// verbose mode state
private verboseMode = false;
```

The verbose mode is toggled via Ctrl+O in the `handleCtrlO()` method at lines 953-965:
```typescript
private handleCtrlO(): void {
  this.verboseMode = !this.verboseMode;
  const modeText = this.verboseMode ? "ON" : "OFF";
  this.notification.setMessage(`Verbose mode: ${modeText}`);

  // Update all verbose-aware components to reflect new verbose mode
  for (const component of this.allThinkingBlocks) {
    component.setVerboseMode(this.verboseMode);
  }
  for (const component of this.allToolExecutions) {
    component.setVerboseMode(this.verboseMode);
  }

  this.tui.requestRender();
}
```

**Key Detection**: The Ctrl+O key is detected in `source/tui/tui.ts:218-222`:
```typescript
// Handle Ctrl+O - toggle verbose mode
if (isCtrlO(data)) {
  if (this.onCtrlO) {
    this.onCtrlO();
  }
  return;
}
```

The key detection utility is in `source/terminal/keys.ts:375-380`.

### Finding 3: Tool Error Events Generation

**Description**: Tool errors are generated in multiple places in the agent when tool execution fails.

**Evidence**: `source/agent/index.ts`

Errors are generated in three scenarios:
1. **Line 685** - Validation errors: `type: "tool-call-error"`
2. **Line 717** - No executor found for tool: `type: "tool-call-error"` 
3. **Line 764** - Tool execution failure: `type: "tool-call-error"`

Also in `source/repl/index.ts:939`, errors from tool output parsing:
```typescript
type: toolCallContent.isError ? "tool-call-error" : "tool-call-end",
```

### Finding 4: Current Relationship Between Verbose Mode and Tool Error Output

**Description**: Currently, verbose mode affects thinking blocks and tool output (tool-call-end), but NOT tool errors (tool-call-error).

The relationship is implemented via the `setVerboseMode()` method in `ToolExecutionComponent` (lines 41-44):
```typescript
setVerboseMode(verboseMode: boolean): void {
  this.verboseMode = verboseMode;
  this.renderDisplay();
}
```

When verbose mode is toggled, the REPL calls `setVerboseMode()` on all tool execution components, which triggers a re-render. However, the error rendering code at lines 72-80 doesn't check the verbose mode flag.

### Finding 5: Documentation

**Description**: Verbose mode (Ctrl+O) is documented in the usage documentation.

**Evidence**: `docs/usage.md:114`:
```
| `Ctrl+O` | Toggles verbose mode (shows detailed tool execution output). |
```

## Architecture & Design Patterns

### Pattern 1: Verbose-Aware Components

- **Description**: Components that implement `setVerboseMode()` method to update their display based on verbose mode state
- **Example**: `source/tui/components/tool-execution.ts:41-44`, `source/tui/components/thinking-block.ts:44-47`
- **When Used**: For rendering thinking blocks and tool execution displays that need to show/hide detailed content based on user preference

### Pattern 2: Event-Driven UI Rendering

- **Description**: UI components receive events (tool-call-start, tool-call-end, tool-call-error) and render based on current state
- **Example**: `source/tui/components/tool-execution.ts:53-80` - `renderDisplay()` method
- **When Used**: When tool execution state changes and the UI needs to update

### Pattern 3: Toggle Callback Pattern

- **Description**: The TUI delegates key handling to the REPL via callback functions (onCtrlO, onCtrlN, etc.)
- **Example**: `source/tui/tui.ts:218-222` checks for keys and calls callbacks if defined
- **When Used**: For handling keyboard shortcuts in the TUI

## Data Flow

1. **User presses Ctrl+O** → `source/tui/tui.ts:219` detects key press
2. **TUI calls callback** → `this.onCtrlO()` is invoked (set by REPL)
3. **REPL toggles state** → `source/repl/index.ts:954` sets `this.verboseMode = !this.verboseMode`
4. **REPL updates components** → Lines 959-964 iterate through all tool execution components calling `setVerboseMode()`
5. **Component re-renders** → `source/tui/components/tool-execution.ts:41-44` calls `renderDisplay()` which now checks verbose mode
6. **Error output is conditionally rendered** → Currently only tool-call-end checks, tool-call-error does not

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| ToolExecutionComponent | `source/tui/components/tool-execution.ts` | Renders tool execution UI including start, end, and error states |
| ThinkingBlockComponent | `source/tui/components/thinking-block.ts` | Renders AI thinking/Reasoning blocks |
| REPL | `source/repl/index.ts` | Main interactive loop, manages verbose mode state |
| TUI | `source/tui/tui.ts` | Terminal UI, handles key events including Ctrl+O |
| Agent | `source/agent/index.ts` | Generates tool-call-error events when tool execution fails |

### Configuration

- **Verbose mode state**: Stored in `source/repl/index.ts` as `private verboseMode = false;`
- **Default value**: `false` (verbose mode is off by default)

## Integration Points

- **Dependencies**: 
  - `ToolExecutionComponent` depends on `ToolEvent` type from `source/agent/index.ts`
  - REPL depends on TUI for rendering and key event callbacks
  - TUI depends on `terminal/keys.ts` for key detection

- **Consumers**:
  - Tool execution components are created by REPL when tool events are received
  - Components are stored in `allToolExecutions` array for later updates

- **External systems**: None directly involved

## Edge Cases & Error Handling

### Edge Cases
- **No verbose mode at tool call start**: When verbose mode is off when tool starts but turned on later, the component should update correctly via `setVerboseMode()` - this already works
- **Tool error with no message**: The error event always has a message (from agent/index.ts), so no special handling needed

### Error Handling
- Tool errors are generated in the agent and propagated as events to the REPL/TUI
- No error handling is done at the display layer - errors are always assumed to be valid strings

## Known Limitations

- **Tool error output not gated**: The main issue - tool-call-error events are not behind verbose mode check
- **Minimal error display**: Currently only shows error message, no stack traces or additional context (this may be intentional)

## Testing Coverage

### Existing Tests
- No specific tests found for tool execution verbose mode behavior
- No tests specifically for tool-call-error display

### Test Gaps
- No tests verifying tool errors are hidden in non-verbose mode
- No tests verifying tool errors are shown in verbose mode
- No integration tests for the verbose mode toggle flow

## References

### Source Files
- `source/tui/components/tool-execution.ts` - Main file to modify (lines 72-80)
- `source/repl/index.ts` - Verbose mode state management (lines 117-118, 953-965)
- `source/tui/tui.ts` - Key event handling (lines 218-222)
- `source/terminal/keys.ts` - Ctrl+O detection (lines 375-380)
- `source/agent/index.ts` - Tool error event generation (lines 685, 717, 764)
- `docs/usage.md` - Documentation for Ctrl+O (line 114)

### Related Code
- `source/tui/components/thinking-block.ts` - Similar verbose mode implementation for thinking blocks (can be used as reference)

## Summary of Changes Needed

To make tool errors only show in verbose mode, modify `source/tui/components/tool-execution.ts` lines 72-80 to add a verbose mode check:

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

This matches the pattern already used for `tool-call-end` events at lines 67-70.
