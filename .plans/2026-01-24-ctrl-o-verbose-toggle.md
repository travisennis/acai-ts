# Ctrl+O Verbose Toggle Implementation Plan

## Overview

Add a keyboard shortcut (ctrl-o) to toggle verbose output mode in the TUI. Default behavior shows a minimal animated "Thinking..." indicator and only tool start/status lines. When enabled, shows full thinking block content and truncated tool execution output.

## Current State Analysis

**Existing Infrastructure:**
- `isCtrlO()` function exists in `source/terminal/keys.ts:341` - detects ctrl-o keypress
- TUI class has callback pattern (`onCtrlC`, `onReconstructSession`) for global key handling
- `ThinkingBlockComponent` always renders full content with `style.dim()`
- `ToolExecutionComponent` always renders full output with 10-line truncation
- Repl class manages component lifecycle and event handling

**Key Discoveries:**
- TUI's `handleInput()` method processes keyboard input and calls callbacks (source/tui/tui.ts:131)
- Repl sets up TUI callbacks in `init()` method (source/repl.ts:164)
- Components receive events via `update()` methods but don't have access to global state
- Notification component exists for showing temporary messages (source/repl.ts:795)

## Desired End State

**Default Mode (verboseMode = false):**
- Thinking: Animated "Thinking..." text with dots cycling 1-3
- Tools: Only show start line with colored ● (blue=running, green=success, red=error), no output
- Persist until app exit, defaults to off on restart

**Verbose Mode (verboseMode = true):**
- Thinking: Full thinking block content with markdown rendering
- Tools: Full tool execution with truncated output (10 lines max, 5+5 split)

**Toggle Behavior:**
- Press ctrl-o to toggle between modes
- Show notification: "Verbose mode: ON" or "Verbose mode: OFF"
- Mode persists until app exit
- Default to off on app start

## What We're NOT Doing

- Persisting verbose mode preference across app restarts
- Changing the 10-line truncation limit in verbose mode
- Adding verbose mode to CLI mode (TUI only)
- Adding configuration option for default verbose mode

## Implementation Approach

**Strategy:** Use the existing callback pattern in TUI class to handle ctrl-o, store verbose mode state in Repl class, and pass it to components during creation. Components will conditionally render based on verbose mode flag.

**Animation Approach:** For the animated "Thinking..." indicator, use a frame counter that increments on each render call. The dots cycle 1→2→3→1 using modulo arithmetic.

## Phase 1: Add TUI Callback Infrastructure

### Overview
Add ctrl-o detection and callback mechanism to TUI class, following the existing pattern used for ctrl-c.

### Changes Required:

#### 1. TUI Class
**File**: `source/tui/tui.ts`

**Changes:**
- Add `onCtrlO` callback property
- Import `isCtrlO` from `terminal/control.ts`
- Add ctrl-o check in `handleInput()` method
- Call callback if defined

```typescript
// Add to imports
import {
  getTerminalSize,
  isCtrlC,
  isCtrlO,
  isCtrlZ,
  isEscape,
} from "../terminal/control.ts";

// Add callback property (around line 81)
public onCtrlO?: () => void;

// Add to handleInput() method (after ctrl-c check, around line 150)
// Handle Ctrl+O - toggle verbose mode
if (isCtrlO(data)) {
  if (this.onCtrlO) {
    this.onCtrlO();
  }
  return;
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Press ctrl-o in TUI and verify no crash occurs
- Verify callback is invoked (will be tested in phase 2)

---

## Phase 2: Add Verbose Mode State and Toggle Handler

### Overview
Add verbose mode state to Repl class and implement the toggle handler with notification.

### Changes Required:

#### 1. Repl Class
**File**: `source/repl.ts`

**Changes:**
- Add `verboseMode` property (default false)
- Add `handleCtrlO()` method to toggle mode and show notification
- Wire up callback in `init()` method

```typescript
// Add to class properties (around line 119)
private verboseMode = false;

// Add method (after handleCtrlC, around line 790)
private handleCtrlO(): void {
  this.verboseMode = !this.verboseMode;
  const modeText = this.verboseMode ? "ON" : "OFF";
  this.notification.setMessage(`Verbose mode: ${modeText}`);
  this.tui.requestRender();
}

// Add to init() method (after onCtrlC setup, around line 167)
this.tui.onCtrlO = () => {
  this.handleCtrlO();
};
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Start acai REPL
- Press ctrl-o and verify notification shows "Verbose mode: ON"
- Press ctrl-o again and verify notification shows "Verbose mode: OFF"
- Verify mode persists across multiple toggles

---

## Phase 3: Update ThinkingBlockComponent for Verbose Mode

### Overview
Modify ThinkingBlockComponent to support two rendering modes: animated "Thinking..." (non-verbose) and full content (verbose).

### Changes Required:

#### 1. ThinkingBlockComponent
**File**: `source/tui/components/thinking-block.ts`

**Changes:**
- Add `verboseMode` property to constructor
- Add `animationFrame` counter for dot animation
- Modify `updateContent()` to conditionally render
- Add animation logic for "Thinking..." dots

```typescript
export class ThinkingBlockComponent extends Container {
  private contentContainer: Container;
  private verboseMode: boolean;
  private animationFrame = 0;

  constructor(
    message?: { content: string },
    options?: { verboseMode?: boolean },
  ) {
    super();
    this.verboseMode = options?.verboseMode ?? false;

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    if (message) {
      this.updateContent(message);
    }
  }

  updateContent(message: { content: string }): void {
    // Clear content container
    this.contentContainer.clear();

    if (message.content.length > 0) {
      this.contentContainer.addChild(new Spacer(1));
    }

    const content = message.content;

    if (this.verboseMode) {
      // Verbose mode: show full thinking content
      this.contentContainer.addChild(
        new Markdown(style.dim(content.trim()), {
          paddingX: 1,
          paddingY: 0,
        }),
      );
    } else {
      // Non-verbose mode: show animated "Thinking..."
      this.animationFrame++;
      const dots = ".".repeat((this.animationFrame % 3) + 1);
      this.contentContainer.addChild(
        new Text(style.dim(`Thinking${dots}`), 1, 1),
      );
    }
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Start acai REPL (verbose mode off)
- Ask a question and verify "Thinking..." appears with animating dots
- Press ctrl-o to enable verbose mode
- Ask another question and verify full thinking content is shown
- Press ctrl-o to disable verbose mode
- Verify "Thinking..." animation returns

---

## Phase 4: Update ToolExecutionComponent for Verbose Mode

### Overview
Modify ToolExecutionComponent to support two rendering modes: minimal start line only (non-verbose) and full output (verbose).

### Changes Required:

#### 1. ToolExecutionComponent
**File**: `source/tui/components/tool-execution.ts`

**Changes:**
- Add `verboseMode` property to constructor
- Modify `renderDisplay()` to conditionally render output
- Keep start line rendering in both modes
- Only render output in verbose mode

```typescript
export class ToolExecutionComponent extends Container {
  private contentContainer: Container;
  private loaderComponent: Loader | null;
  private toolName: string;
  private events: ToolEvent[];
  private verboseMode: boolean;

  constructor(events: ToolEvent[], options?: { verboseMode?: boolean }) {
    super();
    this.loaderComponent = null;
    this.toolName = events[0].name;
    this.events = events;
    this.verboseMode = options?.verboseMode ?? false;

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    this.renderDisplay();
  }

  update(events: ToolEvent[]) {
    this.events = events;

    // Clear content container
    this.contentContainer.clear();

    this.renderDisplay();
  }

  private renderDisplay() {
    // Build display from complete event history with proper ordering
    const processedEvents = this.processEventsInOrder();

    const currentStatus = processedEvents.at(-1)?.type ?? "tool-call-start";

    this.contentContainer.addChild(new Spacer(1));
    this.contentContainer.addChild(new Spacer(1, bgColor));

    for (let i = 0; i < processedEvents.length; i++) {
      const event = processedEvents[i];

      const eventType = event.type;
      switch (eventType) {
        case "tool-call-start":
          this.getToolCallStartComponent(event, currentStatus);
          break;
        case "tool-call-end":
          // Only render output in verbose mode
          if (this.verboseMode && event.msg) {
            this.contentContainer.addChild(this.renderOutputDisplay(event.msg));
          }
          break;
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
        default: {
          eventType satisfies never;
        }
      }
    }

    this.contentContainer.addChild(new Spacer(1, bgColor));
    this.contentContainer.addChild(new Spacer(1));
  }

  // ... rest of the class remains unchanged
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Start acai REPL (verbose mode off)
- Ask a question that triggers tool calls
- Verify only tool start lines appear with colored ● (no output)
- Press ctrl-o to enable verbose mode
- Ask another question that triggers tool calls
- Verify full tool output appears (truncated to 10 lines)
- Press ctrl-o to disable verbose mode
- Verify tool output disappears again

---

## Phase 5: Pass Verbose Mode to Components

### Overview
Update Repl class to pass verbose mode flag when creating ThinkingBlockComponent and ToolExecutionComponent instances.

### Changes Required:

#### 1. Repl Class
**File**: `source/repl.ts`

**Changes:**
- Update ThinkingBlockComponent creation in `thinking-start` event handler
- Update ToolExecutionComponent creation in `tool-call-lifecycle` event handler

```typescript
// In thinking-start event handler (around line 438)
case "thinking-start": {
  const component = new ThinkingBlockComponent(undefined, {
    verboseMode: this.verboseMode,
  });
  this.thinkingBlockComponent = component;
  this.chatContainer.addChild(component);
  this.thinkingBlockComponent.updateContent(event);
  this.tui.requestRender();
  break;
}

// In tool-call-lifecycle event handler (around line 418)
case "tool-call-lifecycle": {
  const component = this.pendingTools.get(event.toolCallId);
  if (component) {
    component.update(event.events);
  } else {
    // Create tool component for new tool call
    const newComponent = new ToolExecutionComponent(event.events, {
      verboseMode: this.verboseMode,
    });
    this.pendingTools.set(event.toolCallId, newComponent);
    this.chatContainer.addChild(newComponent);
  }
  this.tui.requestRender();
  break;
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Start acai REPL
- Test all scenarios from phases 3 and 4
- Verify verbose mode toggle works correctly for both thinking and tools

---

## Phase 6: Update Session Reconstruction

### Overview
Ensure that when reconstructing a session (e.g., after /history command), components are created with the current verbose mode setting.

### Changes Required:

#### 1. Repl Class
**File**: `source/repl.ts`

**Changes:**
- Update ToolExecutionComponent creation in `reconstructSession()` method

```typescript
// In reconstructSession() method (around line 608)
for (const toolCallContent of toolCallsForThisAssistant) {
  const toolCallId = toolCallContent.toolCallId;
  const events = this.createToolEvents(toolCallContent);

  if (events.length > 0) {
    const component = new ToolExecutionComponent(events, {
      verboseMode: this.verboseMode,
    });
    this.pendingTools.set(toolCallId, component);
    this.chatContainer.addChild(component);
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification: [x] PASSED
- Start acai REPL
- Ask a question that triggers tool calls
- Use /history to restore a previous session
- Verify components display correctly based on current verbose mode setting

---

## Testing Strategy

### Unit Tests:
- Test `isCtrlO()` function with various input sequences
- Test verbose mode toggle logic
- Test animation frame cycling for thinking indicator

### Integration Tests:
- Test ctrl-o keypress triggers callback
- Test verbose mode state persists across toggles
- Test notification displays correctly

### Manual Testing Steps:
1. Start acai REPL
2. Verify default mode is off (no verbose output)
3. Ask a question and verify "Thinking..." animation appears
4. Verify tool calls show only start lines with colored ●
5. Press ctrl-o and verify "Verbose mode: ON" notification
6. Ask another question and verify full thinking content appears
7. Verify tool calls show full output (truncated)
8. Press ctrl-o and verify "Verbose mode: OFF" notification
9. Verify display returns to minimal mode
10. Test multiple toggles in succession
11. Test with /history command to verify reconstruction works
12. Exit and restart, verify default is off again

## Performance Considerations

- Animation frame counter increments on each render - negligible overhead
- No additional state persistence needed (mode resets on exit)
- Conditional rendering reduces DOM updates in non-verbose mode

## Migration Notes

No data migration required. This is a UI-only feature with no persistent state.

## References

- Original ticket: `.tickets/at-d739.md`
- TUI callback pattern: `source/tui/tui.ts:81`
- Key detection: `source/terminal/keys.ts:341`
- Repl event handling: `source/repl.ts:418`