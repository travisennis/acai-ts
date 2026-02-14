# Mode Manager Research Report

## Research Question

How does the mode manager work in the acai-ts codebase? What are its responsibilities, how are modes registered and activated, and what is the relationship between modes and other components?

## Overview

The mode manager is a feature that allows users to switch between different "modes" (Normal, Planning, Research) that inject specialized context prompts alongside user messages. This provides the AI model with mode-specific instructions to guide its behavior. The system is implemented through:

- **ModeManager class** (`source/modes/manager.ts`): Core mode state management
- **REPL integration** (`source/repl.ts`): Message injection and mode cycling
- **TUI handling** (`source/tui/tui.ts`): Shift+Tab keyboard handler
- **Footer display** (`source/tui/components/footer.ts`): Visual mode indicator
- **Session persistence** (`source/sessions/manager.ts`): Mode state saved in metadata

## Key Findings

### Mode Manager Architecture

The `ModeManager` class is a simple state manager with no external dependencies beyond the `ai` SDK for the `UserModelMessage` type:

```typescript
// source/modes/manager.ts:40-103
export class ModeManager {
  private currentMode: Mode = "normal";
  private firstMessageInMode = true;

  getCurrentMode(): Mode
  getDisplayName(): string
  cycleMode(): void
  getInitialPrompt(): string
  getReminderPrompt(): string
  isNormal(): boolean
  isFirstMessage(): boolean
  markFirstMessageSent(): void
  getReminderMessage(): UserModelMessage | undefined
  reset(): void
  toJson(): { mode: Mode }
  fromJson(data: { mode?: string }): void
}
```

### Mode Types and Definitions

There are currently **3 predefined modes** defined in `MODE_DEFINITIONS`:

| Mode | Display Name | Initial Prompt | Reminder Prompt |
|------|--------------|----------------|-----------------|
| `normal` | Normal | (empty) | (empty) |
| `planning` | Planning | "You are in PLANNING MODE. Before writing any code:\n\n1. First, understand the requirements fully\n2. Identify the core problem and constraints\n3. Design the solution architecture\n4. Consider edge cases\n5. Plan implementation\n6. Identify dependencies" | "Remember: You are still in PLANNING MODE. Continue focusing on architectural design, systematic planning, and high-level considerations." |
| `research` | Research | "You are in RESEARCH MODE. Your goal is to thoroughly investigate:\n\n1. Current state and context\n2. Existing solutions\n3. Best practices\n4. Trade-offs\n5. Potential pitfalls" | "Remember: You are still in RESEARCH MODE. Continue investigating thoroughly. Synthesize findings." |

Mode definitions are **hardcoded** in the `MODE_DEFINITIONS` constant object and cannot be configured via AGENTS.md or other configuration files.

### Mode State Tracking

The ModeManager tracks two key pieces of state:

1. **`currentMode`** (`source/modes/manager.ts:41`): The currently active mode ("normal", "planning", or "research")
2. **`firstMessageInMode`** (`source/modes/manager.ts:42`): Boolean flag indicating if the next message will be the first in the current mode

When cycling modes (`cycleMode()`), the `firstMessageInMode` flag is reset to `true` to trigger the initial prompt injection for the new mode.

## Architecture & Design Patterns

### Pattern 1: Mode State Management

The mode manager follows a **simple state holder pattern** with no event emissions or complex lifecycle. It provides:

- **Query methods**: `getCurrentMode()`, `getDisplayName()`, `isNormal()`, `isFirstMessage()`
- **State transitions**: `cycleMode()`, `reset()`, `markFirstMessageSent()`
- **Serialization**: `toJson()` and `fromJson()` for persistence

### Pattern 2: Prompt Injection on Message Submit

Modes influence the AI behavior through **context prompt injection** during message submission:

```
source/repl.ts:319-378 (submit flow)
```

The injection logic:
1. If mode is NOT normal AND it's the first message → inject initial prompt (persisted)
2. If mode is NOT normal AND it's NOT the first message → set transient reminder (NOT persisted)
3. If mode is normal → no injection

```typescript
// source/repl.ts:325-377
if (!this.modeManager.isNormal()) {
  if (this.modeManager.isFirstMessage()) {
    const initialPrompt = this.modeManager.getInitialPrompt();
    if (initialPrompt) {
      const modeMessage = createUserMessage([], initialPrompt);
      sessionManager.appendUserMessage(modeMessage);  // Persisted to history
    }
    sessionManager.appendUserMessage(userMsg);
    this.modeManager.markFirstMessageSent();
  } else {
    sessionManager.appendUserMessage(userMsg);
    const reminderMessage = this.modeManager.getReminderMessage();
    if (reminderMessage) {
      sessionManager.setTransientMessages([reminderMessage]);  // NOT persisted
    }
  }
} else {
  sessionManager.appendUserMessage(userMsg);
}
```

### Pattern 3: Transient vs Persistent Messages

**Key design decision**: Initial mode prompts are **persisted** to session history; reminder prompts are **transient** (injected at send-time only).

- **Persistent messages**: Appended via `sessionManager.appendUserMessage()` - saved to disk
- **Transient messages**: Set via `sessionManager.setTransientMessages()` - only for current turn

This design:
- Preserves important initial context in session exports/history
- Avoids history bloat from repeated reminder prompts
- Makes reminders consistent across turns without duplication

### Pattern 4: Mode Cycling via Keyboard Handler

The TUI component handles mode cycling through the Shift+Tab keybinding:

```typescript
// source/tui/tui.ts:200-202
// Handle Shift+Tab - cycle mode
if (isShiftTab(data) && !this.inBracketedPaste) {
  if (this.onShiftTab) {
    this.onShiftTab();
  }
  return;
}
```

The callback is registered in `Repl.init()`:

```typescript
// source/repl.ts:232-244
this.tui.onShiftTab = () => {
  this.modeManager.cycleMode();
  this.notification.setMessage(
    `Mode: ${this.modeManager.getDisplayName()}`,
  );
  this.footer.setState({
    // ...update footer with new mode
    currentMode: this.modeManager.getDisplayName(),
  });
  this.tui.requestRender();
};
```

## Data Flow

### Mode State Flow

1. **Initialization** (`source/repl.ts:158`):
   ```
   this.modeManager = new ModeManager();
   ```

2. **Mode Change** (Shift+Tab):
   ```
   TUI.onShiftTab() → Repl.modeManager.cycleMode() → Footer.update()
   ```

3. **Message Submission** (`source/repl.ts:306-377`):
   ```
   User submits message
         ↓
   Check modeManager.isNormal()
         ↓
   ┌──────────────────────────────────────┐
   │ Normal mode:                         │
   │   → append user message only         │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ Non-normal mode:                     │
   │   If first message:                  │
   │     → append initial prompt          │
   │     → append user message            │
   │     → markFirstMessageSent()         │
   │   Else:                              │
   │     → append user message            │
   │     → set transient reminder         │
   └──────────────────────────────────────┘
   ```

4. **Session Save** (`source/repl.ts:480-484`):
   ```
   sessionManager.setMetadata("modeState", modeManager.toJson())
   ```

5. **Session Restore** (`source/repl.ts:593-595`):
   ```
   modeState = sessionManager.getMetadata("modeState")
   modeManager.fromJson(modeState)
   ```

### Message Flow with Modes

**First message in Planning mode:**

| Step | Action | Persisted? |
|------|--------|------------|
| 1 | Create initial prompt message | Yes |
| 2 | Append initial prompt to history | Yes |
| 3 | Append user message to history | Yes |
| 4 | Mark first message sent | N/A |

**Subsequent message in Planning mode:**

| Step | Action | Persisted? |
|------|--------|------------|
| 1 | Append user message to history | Yes |
| 2 | Create reminder message | No (transient) |
| 3 | Set transient messages | No |
| 4 | Send to AI with reminder prepended | N/A |

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| `ModeManager` | `source/modes/manager.ts` | Track mode state, store prompts, handle cycling, serialize/deserialize |
| `Repl` | `source/repl.ts` | Instantiate ModeManager, inject mode context on message submit, handle mode UI updates |
| `TUI` | `source/tui/tui.ts` | Handle Shift+Tab keyboard input, trigger mode cycle |
| `FooterComponent` | `source/tui/components/footer.ts` | Display current mode indicator in footer |
| `SessionManager` | `source/sessions/manager.ts` | Store/restore modeState in session metadata |

### Data Structures

```typescript
// Mode type
type Mode = "normal" | "planning" | "research";

// Mode definition interface
interface ModeDefinition {
  name: Mode;
  displayName: string;
  initialPrompt: string;
  reminderPrompt: string;
}

// ModeManager JSON format
type ModeState = {
  mode: Mode;
};
```

## Integration Points

### Dependencies

**ModeManager depends on:**
- `source/sessions/manager.ts`: `createUserMessage()` function for creating mode context messages

**Repl depends on:**
- `source/modes/manager.ts`: `ModeManager` class
- `source/sessions/manager.ts`: `createUserMessage()` function
- `source/tui/tui.ts`: Keyboard event callbacks
- `source/tui/components/footer.ts`: Footer state updates

**TUI depends on:**
- `Repl.onShiftTab` callback (set during Repl.init())

### Consumers

- **Shift+Tab keybinding**: Triggers mode cycling via TUI
- **Message submission**: Mode context is injected by Repl
- **Session save/restore**: Mode state persists through Ctrl+N and application restarts
- **Footer display**: Shows current mode visually

## Edge Cases & Error Handling

### Edge Cases

1. **Empty initial/reminder prompts**: `Normal` mode has empty prompts - handled by checking if prompt exists before creating message

2. **Session restore without modeState**: `fromJson()` gracefully handles missing or invalid mode data:
   ```typescript
   // source/modes/manager.ts:99-103
   fromJson(data: { mode?: string }): void {
     if (data.mode && ALL_MODES.includes(data.mode as Mode)) {
       this.currentMode = data.mode as Mode;
     }
     this.firstMessageInMode = false;  // Always false on restore
   }
   ```

3. **Ctrl+N (new chat)**: Mode resets to "normal" via `modeManager.reset()`

4. **Invalid mode in JSON**: `fromJson()` validates against `ALL_MODES` array

### Error Handling

- ModeManager has **no error throwing** - all operations are safe
- Invalid mode data during restore defaults to "normal"
- Missing prompts are handled by conditional checks before message creation

## Known Limitations

1. **Hardcoded modes**: Only 3 modes exist (normal, planning, research) with no runtime extensibility
2. **No mode configuration**: Cannot customize prompts via configuration files
3. **No slash commands for modes**: Only Shift+Tab cycles modes; no `/planning` or `/research` commands
4. **Reminder prompts always prepended**: No option to change message ordering
5. **Single mode only**: Cannot activate multiple modes simultaneously

## Testing Coverage

No dedicated test files for ModeManager were found. The mode functionality appears to be tested indirectly through integration tests in `source/repl.ts` flows.

## Recommendations for Planning

Based on this research, when extending or modifying the mode system:

1. **Follow the transient vs persistent pattern**: Initial prompts persist, reminders are transient - this is a good design that balances context preservation with history cleanliness

2. **Preserve `firstMessageInMode` semantics**: The flag resets on mode change and after first message - any new modes should follow this pattern

3. **Update ALL_MODES array when adding new modes**: The cycling logic depends on this array (`source/modes/manager.ts:38`)

4. **Serialize via toJson/fromJson**: Always use these methods for persistence rather than direct property access

5. **Update footer for UI display**: Any new mode should update the footer to show the display name

6. **Consider the transient message system**: For features that need turn-specific context, use `SessionManager.setTransientMessages()` instead of persisting

## References

- **ModeManager source**: `source/modes/manager.ts`
- **REPL integration**: `source/repl.ts` (lines 12, 158, 232-244, 325-377, 483-484, 593-595, 938-947, 995-996)
- **TUI keyboard handling**: `source/tui/tui.ts` (lines 200-202)
- **Footer display**: `source/tui/components/footer.ts` (lines 16, 66, 87-88, 114-130)
- **Session persistence**: `source/sessions/manager.ts` (metadata methods)
- **Related research document**: `research.md` (previous modes feature research)
