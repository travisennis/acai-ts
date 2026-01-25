# Ctrl-O Verbose Toggle for TUI Output

## Research Question

How to implement a keyboard shortcut (ctrl-o) to toggle verbose output mode in the TUI, where the default shows minimal thinking indicator and no tool output, and when enabled shows full thinking block and truncated tool execution output.

## Overview

This research identifies the code areas that need modification to add a ctrl-o keyboard shortcut for toggling verbose output mode in the Terminal User Interface (TUI). The feature should allow users to switch between minimal output (default) and verbose output (full thinking + truncated tool output) modes.

## Key Findings

### Keyboard Infrastructure Already Exists

**Description**: The codebase already has infrastructure for handling keyboard shortcuts, including the `isCtrlO()` function in `source/terminal/keys.ts`.

**Evidence**: 
- `source/terminal/keys.ts:331-343` - `isCtrlO()` function already implemented
- `source/tui/tui.ts:81-82` - TUI class has callback properties like `onCtrlC` and `onReconstructSession`
- `source/tui/tui.ts:141-150` - Ctrl+C handling pattern in `handleInput` method

**Implications**: The keyboard detection infrastructure is complete. We only need to add a callback handler for ctrl-o and wire it up in the TUI's input handling.

### TUI Callback Pattern Established

**Description**: The TUI class uses a callback pattern for handling special key combinations.

**Evidence**:
- `source/tui/tui.ts:81-82` - Callback properties: `public onCtrlC?: () => void; public onReconstructSession?: () => void;`
- `source/tui/tui.ts:141-150` - Ctrl+C handling in `handleInput` method
- `source/repl.ts:164-166` - Repl sets up callbacks: `this.tui.onCtrlC = () => { this.handleCtrlC(); };`

**Implications**: Follow the established pattern by adding `onCtrlO` callback property to TUI class, handling it in `handleInput`, and setting it up in Repl.

### Output Components Have Truncation Logic

**Description**: Tool execution output already has truncation logic that limits output to 10 lines.

**Evidence**:
- `source/tui/components/tool-execution.ts:152-163` - `renderOutputDisplay` method with `MaxVisible = 10` constant
- Shows first 5 lines, indicator, last 5 lines for outputs exceeding 10 lines

**Implications**: The truncation logic is already in place. We need to add a flag to control whether the tool output component is rendered at all (minimal mode) or rendered with truncation (verbose mode).

### Repl Manages Component Creation and Updates

**Description**: The Repl class is responsible for creating and updating thinking and tool execution components.

**Evidence**:
- `source/repl.ts:416-422` - Creates `ThinkingBlockComponent` on `thinking-start` event
- `source/repl.ts:424-429` - Updates thinking content on `thinking` event
- `source/repl.ts:367-376` - Creates `ToolExecutionComponent` on `tool-call-lifecycle` event

**Implications**: The Repl class needs to track the verbose mode state and conditionally create/update components based on this state.

## Architecture & Design Patterns

### Pattern 1: TUI Callback Pattern
- **Description**: TUI class exposes optional callback properties that are set by consumers (Repl) to handle special key combinations
- **Example**: `source/tui/tui.ts:81-82` - `onCtrlC` and `onReconstructSession` callbacks
- **When Used**: For global keyboard shortcuts that need to be handled at the TUI level

### Pattern 2: Component Conditional Rendering
- **Description**: Components are created and added to containers based on application state
- **Example**: `source/repl.ts:417` - `this.chatContainer.addChild(component);`
- **When Used**: When displaying different types of content in the TUI

### Pattern 3: Event-Driven Updates
- **Description**: Components are updated in response to agent events (thinking-start, thinking, tool-call-lifecycle)
- **Example**: `source/repl.ts:424-429` - Updates thinking block content on `thinking` event
- **When Used**: When streaming content from the agent

## Data Flow

1. **User presses ctrl-o** → Terminal sends key data to TUI
2. **TUI handleInput** → Checks `isCtrlO(data)` in `source/tui/tui.ts:handleInput`
3. **Callback invocation** → Calls `this.onCtrlO()` if set
4. **Repl handler** → `Repl.toggleVerboseMode()` toggles state
5. **State change** → Repl's `verboseMode` boolean flips
6. **Component rendering** → Future component creations check `verboseMode` state
7. **Display update** → TUI re-renders with new components

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| TUI | `source/tui/tui.ts` | Manages terminal UI, keyboard input, rendering |
| Repl | `source/repl.ts` | Manages REPL session, agent events, component lifecycle |
| ThinkingBlockComponent | `source/tui/components/thinking-block.ts` | Displays thinking content |
| ToolExecutionComponent | `source/tui/components/tool-execution.ts` | Displays tool output with truncation |
| Keys utilities | `source/terminal/keys.ts` | Keyboard detection helpers |

### Configuration

- **Config files**: None (runtime state only)
- **Environment variables**: None
- **Flags**: `verboseMode` boolean state in Repl class

## Integration Points

- **Dependencies**: None (self-contained feature)
- **Consumers**: Repl class uses TUI callbacks
- **External systems**: None (terminal input only)

## Edge Cases & Error Handling

### Edge Cases
- **Toggle during active rendering**: Should not cause render loop - use requestRender pattern
- **Toggle with no active components**: Should work, just changes state for future components
- **Toggle during tool execution**: Existing components remain, new ones follow new mode

### Error Handling
- **Callback not set**: TUI should check if `onCtrlO` exists before calling (like `onCtrlC` pattern)
- **State inconsistency**: Ensure verbose mode state is properly initialized

## Known Limitations

- **No persistence**: Verbose mode state is lost on session restart (by design, per ticket)
- **Existing components**: Components created before toggle won't be removed until new content is added

## Testing Coverage

### Existing Tests
- Keyboard detection: `source/terminal/keys.ts` has no specific tests for `isCtrlO` but other key tests exist
- TUI rendering: `source/tui/tui-output.test.ts` tests component rendering
- Component behavior: No existing tests for conditional rendering based on state

### Test Gaps
- Need tests for ctrl-o toggle behavior
- Need tests for verbose mode state management
- Need tests for conditional component creation

## Recommendations for Planning

Based on this research, when planning changes:

1. **Follow established patterns**: Use the TUI callback pattern (like `onCtrlC`) for handling ctrl-o
2. **Add state tracking**: Add `verboseMode` boolean to Repl class, default `false`
3. **Conditional rendering**: Check `verboseMode` before creating/adding thinking and tool components
4. **Minimal changes**: Only modify files identified above, no new infrastructure needed
5. **Test incrementally**: Test keyboard detection first, then state management, then component rendering

## Implementation Approach

The implementation requires changes to 3 files:

1. **source/tui/tui.ts**: Add `onCtrlO` callback property and handle ctrl-o in `handleInput`
2. **source/repl.ts**: Add `verboseMode` state and `toggleVerboseMode` handler, wire up callback
3. **source/tui/components/tool-execution.ts**: Optionally add verbose mode flag (or handle in Repl)

The key insight is that most infrastructure already exists - we just need to:
- Add the callback property and handler
- Add state tracking
- Conditionally create components based on state

## References

- Original ticket: `.tickets/at-d739.md`
- Source files: 
  - `source/tui/tui.ts`
  - `source/repl.ts`
  - `source/terminal/keys.ts`
  - `source/tui/components/thinking-block.ts`
  - `source/tui/components/tool-execution.ts`