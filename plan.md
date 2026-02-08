# Modes Feature Implementation Plan

## Overview

Implement a modes feature in acai-ts that allows users to cycle through specialized modes (Normal, Planning, Research) using Shift+Tab. Each mode injects context prompts alongside user prompts to guide the LLM's behavior. Mode state is indicated in the footer and persists across session saves.

## GitHub Issue Reference

- N/A (internal feature)

## Current State Analysis

The application currently:
- Handles user input via Editor → Repl → PromptManager → SessionManager → Agent flow
- Supports keyboard shortcuts via TUI callbacks (Ctrl+O for verbose mode, Ctrl+N for new chat)
- Displays model, path, git status, and token usage in the FooterComponent
- Persists session state including messages, token usage, and session metadata

**What's missing:**
- No mode concept or mode state management
- No Shift+Tab handler in TUI
- No mechanism to inject mode context prompts
- No mode indicator in footer
- No mode persistence in session saves

## Desired End State

After implementation:
- Users can cycle through modes using Shift+Tab: Normal → Planning → Research → Normal...
- Each mode injects appropriate context:
  - **Normal**: No mode context (standard behavior)
  - **Planning**: Architectural planning prompts
  - **Research**: Investigation and exploration prompts
- Mode indicator appears in footer (capitalized, right-justified on path line)
- Mode state persists across session saves/restores
- Ctrl+N resets to Normal mode
- Mode context is hybrid-persisted: initial prompts in history, reminders transient

### Key Discoveries:
- `isShiftTab()` exists at `source/terminal/keys.ts:920-930`
- TUI callback pattern at `source/tui/tui.ts:50-60` for keyboard handlers
- Footer right-justification pattern at `source/tui/components/footer.ts:95-105` using `visibleWidth`
- `SavedMessageHistory` type at `source/sessions/manager.ts:150-155` for session persistence
- `PromptManager.getUserMessage()` at `source/prompts/manager.ts:60-85` creates user messages
- `Agent.run()` calls `sessionManager.get()` internally at `source/agent/index.ts:219` — it does NOT accept a messages parameter
- `agent.run()` is called from `source/index.ts:527-533` and `source/index.ts:558-564`, not from Repl
- The stdin prompt path in `source/index.ts:515-541` always runs in Normal mode (modes require interactive TUI), so no mode injection is needed there

### Critical Design Issues Found (from review):

1. **`Agent.run()` doesn't accept messages** — It reads from `sessionManager.get()` internally. Transient reminder injection cannot happen by passing messages to `agent.run()`. Instead, use a transient message slot on `SessionManager` that `get()` includes but `save()` excludes.

2. **Field/method name collision** — The original plan defined both `private isFirstMessageInMode: boolean` and `isFirstMessageInMode(): boolean` on ModeManager. Rename the field to `private firstMessageInMode`.

3. **SessionManager shouldn't own mode state** — Adding `_modeState`, `setModeState()`, `getModeState()` to SessionManager is a layering violation. Instead, use a generic `metadata` bag on `SavedMessageHistory` or have the Repl sync mode state into the save payload via an existing pattern.

## What We're NOT Doing

- Custom user-defined modes (hardcoded only)
- Notifications on mode change (footer shows mode instead)
- Mode persistence for `isFirstMessageInMode` flag (derive at runtime)
- Code Review and Debugging modes (Phase 2)
- Token optimization for mode prompts
- Auto-send mode prompts on mode entry (inject on submit)
- Mode injection on the stdin prompt path (always Normal mode)

## Implementation Approach

Create a ModeManager class to track mode state, define mode prompts, and handle mode cycling. Integrate with existing submission flow to inject mode context. Add mode indicator to footer. Persist mode state with sessions.

**Key design decisions:**
1. **Hybrid persistence** — Initial mode prompts are persisted to session history, but reminder prompts are transient (injected at send-time only) to avoid history bloat while preserving important context.
2. **Transient message injection via SessionManager** — Add a transient message slot to `SessionManager` that `get()` includes but `save()` excludes. This avoids modifying `Agent.run()`'s signature and keeps the injection mechanism clean.
3. **Generic metadata on SavedMessageHistory** — Rather than adding mode-specific fields to SessionManager, extend `SavedMessageHistory` with an optional `metadata` record that can carry mode state (and future extensions).

## Phase 1: Create ModeManager and Mode Definitions

### Overview
Create the ModeManager class and mode definitions for Normal, Planning, and Research modes.

### Changes Required:

#### 1. New ModeManager Class
**File**: `source/modes/manager.ts`
**Changes**: Create new file with ModeManager class

```typescript
import type { UserModelMessage } from "ai";
import { createUserMessage } from "../sessions/manager.ts";

export type Mode = "normal" | "planning" | "research";

interface ModeDefinition {
  name: Mode;
  displayName: string;
  initialPrompt: string;
  reminderPrompt: string;
}

const MODE_DEFINITIONS: Record<Mode, ModeDefinition> = {
  normal: {
    name: "normal",
    displayName: "Normal",
    initialPrompt: "",
    reminderPrompt: "",
  },
  planning: {
    name: "planning",
    displayName: "Planning",
    initialPrompt:
      "You are in PLANNING MODE. Before writing any code:\n\n1. First, understand the requirements fully\n2. Identify the core problem and constraints\n3. Design the solution architecture\n4. Consider edge cases\n5. Plan implementation\n6. Identify dependencies",
    reminderPrompt:
      "Remember: You are still in PLANNING MODE. Continue focusing on architectural design, systematic planning, and high-level considerations.",
  },
  research: {
    name: "research",
    displayName: "Research",
    initialPrompt:
      "You are in RESEARCH MODE. Your goal is to thoroughly investigate:\n\n1. Current state and context\n2. Existing solutions\n3. Best practices\n4. Trade-offs\n5. Potential pitfalls",
    reminderPrompt:
      "Remember: You are still in RESEARCH MODE. Continue investigating thoroughly. Synthesize findings.",
  },
};

const ALL_MODES: Mode[] = ["normal", "planning", "research"];

export class ModeManager {
  private currentMode: Mode = "normal";
  private firstMessageInMode = true;

  getCurrentMode(): Mode {
    return this.currentMode;
  }

  getDisplayName(): string {
    return MODE_DEFINITIONS[this.currentMode].displayName;
  }

  cycleMode(): void {
    const currentIndex = ALL_MODES.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % ALL_MODES.length;
    this.currentMode = ALL_MODES[nextIndex]!;
    this.firstMessageInMode = true;
  }

  getInitialPrompt(): string {
    return MODE_DEFINITIONS[this.currentMode].initialPrompt;
  }

  getReminderPrompt(): string {
    return MODE_DEFINITIONS[this.currentMode].reminderPrompt;
  }

  isNormal(): boolean {
    return this.currentMode === "normal";
  }

  isFirstMessage(): boolean {
    return this.firstMessageInMode;
  }

  markFirstMessageSent(): void {
    this.firstMessageInMode = false;
  }

  getReminderMessage(): UserModelMessage | undefined {
    if (this.isNormal() || this.firstMessageInMode) {
      return undefined;
    }
    const reminder = this.getReminderPrompt();
    if (!reminder) {
      return undefined;
    }
    return createUserMessage([], reminder);
  }

  reset(): void {
    this.currentMode = "normal";
    this.firstMessageInMode = true;
  }

  toJSON(): { mode: Mode } {
    return { mode: this.currentMode };
  }

  fromJSON(data: { mode?: string }): void {
    if (data.mode && ALL_MODES.includes(data.mode as Mode)) {
      this.currentMode = data.mode as Mode;
    }
    this.firstMessageInMode = false;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] File is created at correct path: `source/modes/manager.ts`

#### Manual Verification:
- [x] Mode cycling works correctly through all 3 modes
- [x] Display names are correctly capitalized
- [x] Reset returns to "normal" mode
- [ ] `getReminderMessage()` returns undefined for Normal mode and first message

---

## Phase 2: Add Shift+Tab Handler to TUI and Repl

### Overview
Add Shift+Tab keyboard detection and callback to TUI, then connect it to mode cycling in Repl.

### Changes Required:

#### 1. Add Shift+Tab Callback to TUI
**File**: `source/tui/tui.ts`
**Changes**: Add `onShiftTab` callback and handler

```typescript
// Add to TUI class alongside existing callbacks:
public onShiftTab?: () => void;

// In handleInput method, after existing Ctrl+O handler:
if (isShiftTab(data) && !this.inBracketedPaste) {
  if (this.onShiftTab) {
    this.onShiftTab();
  }
  return;
}
```

#### 2. Connect Shift+Tab to ModeManager in Repl
**File**: `source/repl.ts`
**Changes**: Add ModeManager field, connect to TUI callback

```typescript
// Add import:
import { ModeManager } from "./modes/manager.ts";

// Add private field:
private modeManager: ModeManager;

// In constructor, initialize:
this.modeManager = new ModeManager();

// In init(), add callback setup alongside other TUI callbacks:
this.tui.onShiftTab = () => {
  this.modeManager.cycleMode();
  this.tui.requestRender();
};
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [x] Shift+Tab cycles through modes: Normal → Planning → Research → Normal...
- [x] No conflict with existing Tab functionality in editor
- [x] Mode state changes correctly on each Shift+Tab

---

## Phase 3: Implement Mode Context Injection in Submit Flow

### Overview
Inject mode context prompts when in non-Normal mode. Initial prompts are persisted to session history. Reminder prompts are transient — included in `sessionManager.get()` but excluded from `save()`.

### Architecture Note
`Agent.run()` reads messages from `sessionManager.get()` internally (at `source/agent/index.ts:219`). It does not accept a messages parameter. Therefore, transient reminder injection must happen through `SessionManager`, not by modifying the call to `agent.run()`.

### Changes Required:

#### 1. Add Transient Message Support to SessionManager
**File**: `source/sessions/manager.ts`
**Changes**: Add a transient message slot that `get()` includes but `save()` ignores

```typescript
// Add private field to SessionManager:
private transientMessages: UserModelMessage[] = [];

// Add methods:
setTransientMessages(messages: UserModelMessage[]): void {
  this.transientMessages = messages;
}

clearTransientMessages(): void {
  this.transientMessages = [];
}

// Modify get() to include transient messages:
get() {
  const history = [...this.history].filter(this.validMessage);
  if (this.transientMessages.length > 0) {
    // Insert transient messages before the last user message
    const lastIndex = history.length - 1;
    return [
      ...history.slice(0, lastIndex),
      ...this.transientMessages,
      history[lastIndex]!,
    ];
  }
  return history;
}

// In clear(), also clear transient messages:
clear() {
  this.history.length = 0;
  this.transientMessages = [];
  this.contextWindow = 0;
  this.tokenUsage = [];
  this.emit("clear-history");
}
```

Note: `save()` serializes `this.history` directly, so transient messages are automatically excluded.

#### 2. Modify Repl Submit Flow to Inject Mode Context
**File**: `source/repl.ts`
**Changes**: Update editor.onSubmit handler to inject mode messages

```typescript
// In editor.onSubmit, replace:
//   sessionManager.appendUserMessage(userMsg);
// With:

if (!this.modeManager.isNormal()) {
  if (this.modeManager.isFirstMessage()) {
    // First message in mode: persist initial prompt as a separate user message
    const initialPrompt = this.modeManager.getInitialPrompt();
    if (initialPrompt) {
      const modeMessage = createUserMessage([], initialPrompt);
      sessionManager.appendUserMessage(modeMessage);
    }
    sessionManager.appendUserMessage(userMsg);
    this.modeManager.markFirstMessageSent();
  } else {
    // Subsequent messages: persist user message, set transient reminder
    sessionManager.appendUserMessage(userMsg);
    const reminderMessage = this.modeManager.getReminderMessage();
    if (reminderMessage) {
      sessionManager.setTransientMessages([reminderMessage]);
    }
  }
} else {
  sessionManager.appendUserMessage(userMsg);
}
```

#### 3. Clear Transient Messages After Agent Run
**File**: `source/repl.ts`
**Changes**: Clear transient messages in handle() for agent-stop and agent-error events

```typescript
// In handle() for agent-stop event, before save:
this.options.sessionManager.clearTransientMessages();
await this.options.sessionManager.save();

// In handle() for agent-error event, before save:
this.options.sessionManager.clearTransientMessages();
await this.options.sessionManager.save();
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [x] First message in Planning mode includes initial prompt (persisted in history)
- [x] Subsequent messages in Planning mode include reminder (transient, not in saved history)
- [ ] First message in Research mode includes initial prompt (persisted)
- [ ] Subsequent messages in Research mode include reminder (transient)
- [x] Normal mode behavior unchanged (no mode context)
- [x] Session save files do not contain reminder prompts

---

## Phase 4: Add Mode Indicator to Footer UI

### Overview
Add mode display to footer. The path line already has the model info right-justified, so place the mode indicator right-justified on the git info line (line 2). When there's no git info, show the mode on its own line only when not Normal.

### Changes Required:

#### 1. Extend Footer State and Render
**File**: `source/tui/components/footer.ts`
**Changes**: Add mode to state and render on git line

```typescript
// Add currentMode to State type:
type State = {
  projectStatus: ProjectStatusData;
  currentContextWindow: number;
  contextWindow: number;
  agentState?: AgentState;
  currentMode?: string;
};

// Add private field:
private currentMode: string = "Normal";

// In setState method, track currentMode:
if (state.currentMode !== undefined) {
  this.currentMode = state.currentMode;
}

// In render method — line 1 stays unchanged (path + model info).
// For line 2 (git line), append mode indicator right-justified:
const modeDisplay = this.currentMode !== "Normal"
  ? style.magenta(`[${this.currentMode}]`)
  : "";

if (gitLine) {
  if (modeDisplay) {
    const gitPadding = Math.max(0, width - visibleWidth(gitLine) - visibleWidth(modeDisplay));
    results.push(gitLine + " ".repeat(gitPadding) + modeDisplay);
  } else {
    results.push(gitLine);
  }
} else if (modeDisplay) {
  // No git info but mode is active — show mode on its own line
  results.push(modeDisplay);
}
```

#### 2. Update Footer State from Repl
**File**: `source/repl.ts`
**Changes**: Pass currentMode in all footer.setState() calls

```typescript
// In every footer.setState() call, add:
currentMode: this.modeManager.getDisplayName(),
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [x] Mode indicator appears right-justified on git line when not Normal (e.g., `[Planning]`)
- [x] No mode indicator shown when in Normal mode (clean default)
- [ ] When no git info, mode shows on its own line (only when not Normal)
- [x] Mode updates when cycling with Shift+Tab
- [x] Git info still displays correctly alongside mode indicator

---

## Phase 5: Implement Session Persistence for Mode State

### Overview
Persist mode state with session saves and restore on session loads. Use a generic `metadata` field on `SavedMessageHistory` to avoid polluting SessionManager with mode-specific concerns.

### Changes Required:

#### 1. Add Metadata to SavedMessageHistory
**File**: `source/sessions/manager.ts`
**Changes**: Extend SavedMessageHistory with optional metadata

```typescript
export type SavedMessageHistory = {
  project: string;
  sessionId: string;
  modelId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  tokenUsage?: TokenUsageTurn[];
  metadata?: Record<string, unknown>;
};
```

Also extend `RawMessageHistory` accordingly.

#### 2. Add Metadata Support to SessionManager
**File**: `source/sessions/manager.ts`
**Changes**: Add metadata getter/setter and include in save/restore

```typescript
// Add private field:
private metadata: Record<string, unknown> = {};

// Add methods:
setMetadata(key: string, value: unknown): void {
  this.metadata[key] = value;
}

getMetadata(key: string): unknown {
  return this.metadata[key];
}

// In save(), include metadata in output:
const output: SavedMessageHistory = {
  // ... existing fields
  metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
};

// In restore(), load metadata:
this.metadata = savedHistory.metadata ?? {};

// In clear(), reset metadata:
this.metadata = {};
```

#### 3. Sync Mode State in Repl
**File**: `source/repl.ts`
**Changes**: Save mode state to metadata before save, restore on rerender

```typescript
// Before every sessionManager.save() call:
this.options.sessionManager.setMetadata("modeState", this.modeManager.toJSON());
await this.options.sessionManager.save();

// In rerender() when restoring session:
const modeState = this.options.sessionManager.getMetadata("modeState");
if (modeState && typeof modeState === "object" && "mode" in modeState) {
  this.modeManager.fromJSON(modeState as { mode: string });
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [x] Session save file includes metadata.modeState field
- [ ] Mode persists after save, exit, and restart
- [ ] Mode is restored correctly on session resume
- [x] New session starts in Normal mode
- [x] Backward compatibility: sessions without metadata default to Normal

---

## Phase 6: Handle Ctrl+N Reset

### Overview
Reset mode to Normal when user presses Ctrl+N (new chat).

### Changes Required:

#### 1. Call ModeManager.reset() in handleCtrlN
**File**: `source/repl.ts`
**Changes**: Add reset call in handleCtrlN()

```typescript
// In handleCtrlN():
this.modeManager.reset();
// Also clear any pending transient messages:
this.options.sessionManager.clearTransientMessages();
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `npm run typecheck`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [x] Ctrl+N resets mode to Normal
- [x] Footer shows no mode indicator after Ctrl+N
- [x] Transient messages are cleared

---

## Testing Strategy

### Unit Tests:
- `source/modes/manager.ts`:
  - Mode cycling: Normal → Planning → Research → Normal
  - `isFirstMessage()` flag toggling
  - `getInitialPrompt()` and `getReminderPrompt()` return correct values
  - `getReminderMessage()` returns undefined for Normal mode and first message
  - JSON serialization/deserialization
  - `reset()` returns to Normal
  - `fromJSON()` with invalid mode defaults gracefully

### Integration Tests:
- Full mode cycle flow: Shift+Tab → mode changes → submit → mode context injected
- Session save/restore with mode
- Ctrl+N resets mode
- Transient messages excluded from saved history

### Manual Testing Steps:
1. **Mode cycling**: Press Shift+Tab, verify footer shows "[Planning]", press again → "[Research]", again → no indicator (Normal)
2. **Mode prompts**: In Planning mode, submit first message, verify initial prompt appears in session history
3. **Reminder prompts**: In Planning mode, submit second message, verify reminder is sent to LLM but NOT in saved session file
4. **Session resume**: Save session, exit, restart, resume — mode should be restored
5. **Ctrl+N**: Press Ctrl+N, verify mode resets to Normal
6. **Normal mode**: In Normal mode, verify no mode context is added

## Performance Considerations

- **Token usage**: Mode prompts add ~100-200 tokens per message (acceptable trade-off)
- **Session file size**: Initial mode prompts increase history size minimally
- **No runtime overhead**: ModeManager is lightweight, checks are O(1)
- **Transient messages**: Cleared after each agent run, no accumulation

## Migration Notes

- Existing sessions without metadata will default to Normal mode (backward compatible)
- Session files gain new optional `metadata` field (non-breaking)
- No data migration needed

## References

- Keyboard handling: `source/terminal/keys.ts:920-930`
- TUI callbacks: `source/tui/tui.ts:50-60`
- Footer rendering: `source/tui/components/footer.ts:94-160`
- Session persistence: `source/sessions/manager.ts:145-155`
- Message creation: `source/sessions/manager.ts:31-57`
- Agent.run(): `source/agent/index.ts:157-250`
- Agent uses sessionManager.get(): `source/agent/index.ts:219`
- agent.run() call sites: `source/index.ts:527-533`, `source/index.ts:558-564`
- Verbose mode pattern: `source/repl.ts:783-795`
