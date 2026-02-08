# Implementing Modes Feature in Acai-TS

## Research Question

What would it take to implement a "modes" feature in acai-ts where:
- Shift+Tab cycles through modes (Normal, Planning, Research, etc.)
- Each mode injects specialized prompts alongside user prompts
- Initial entry into a mode sends the mode's initial prompt as a first user message
- Subsequent messages in the same mode prepend a reminder prompt as a separate user message
- Returning to Normal mode stops sending reminder prompts
- Mode state resets on Ctrl+N (new chat)

## Overview

This research investigates the prompt architecture, message flow, and keyboard handling systems to determine the implementation requirements for a modes feature. The feature fundamentally changes how prompts are constructed and sent to the LLM by inserting separate user messages for mode context.

## Review Summary (Updated)

Key design decisions after review:

| Aspect | Original Proposal | Revised Approach |
|--------|-------------------|------------------|
| **Message persistence** | Persist all mode prompts | **Hybrid**: Persist initial prompt, reminders transient |
| **Message ordering** | Inconsistent (initial vs reminder) | **Always prepend** mode context before user prompt |
| **Session state** | Persist `mode` + `isFirstMessageInMode` | Persist `mode` only; derive flag at runtime |
| **Mode entry behavior** | Auto-send initial prompt | **UI notification only**; inject on next submit |
| **Keybinding** | Shift+Tab only | Shift+Tab + `/mode` command fallback |

**Benefits of revised approach:**
- Initial mode context preserved in session history/exports
- No history bloat from repeated reminder prompts
- Reduced token usage over long conversations
- More robust session restore behavior

## Key Findings

### 1. Architecture Overview

The application follows a clear data flow:
```
User Input → Editor Component → TUI Input Handler → Repl.onSubmit → PromptManager
         → SessionManager.appendUserMessage() → Agent.run() → LLM API
```

**Critical Files Involved:**
- `source/prompts.ts:478-509` - `systemPrompt()` function builds the system prompt
- `source/prompts/manager.ts:1-80` - `PromptManager` class manages user prompts
- `source/agent/index.ts:157-250` - `Agent.run()` method receives prompts and calls LLM
- `source/tui/tui.ts:1-50` - TUI class handles keyboard input globally
- `source/tui/components/editor.ts:1-50` - Editor handles text input and submission
- `source/sessions/manager.ts` - SessionManager maintains message history

### 2. Current Prompt Flow

**System Prompt Construction (`source/prompts.ts:478-509`):**
The `systemPrompt()` function:
- Takes options for working directory, tools, rules, and skills
- Constructs a comprehensive system prompt from multiple components
- Returns a single assembled prompt string

```typescript
export async function systemPrompt(
  options?: SystemPromptOptions,
): Promise<SystemPromptResult> {
  const projectContextText = await getProjectContext();
  const environmentInfoText = await environmentInfo(...);
  const skillsText = await loadSkills();
  
  const assembledPrompt = `${corePrompt}\n${projectContextText}\n${environmentInfoText}${skillsText}`;
  return { prompt: assembledPrompt, components };
}
```

**User Prompt Management (`source/prompts/manager.ts`):**
The `PromptManager` class:
- Stores the current user prompt with `set()` and `get()`
- Manages context items (file references, etc.)
- Creates user messages for the LLM via `getUserMessage()`
- Clears prompts after use

```typescript
export class PromptManager implements PromptManagerApi {
  private prompt: string | undefined;
  private context: ContextItem[];
  
  getUserMessage(): UserModelMessage {
    // Creates message combining context + prompt
    return createUserMessage([...this.context], currentPrompt);
  }
}
```

**Message Creation Helper (`source/sessions/manager.ts`):**
```typescript
export function createUserMessage(
  contentItems: UserMessageContentItem[],
  prompt?: string,
): UserModelMessage {
  const messageParts: (TextPart | ImagePart)[] = [];
  
  for (const item of contentItems) {
    if (typeof item === "string" && item.trim().length > 0) {
      messageParts.push({ type: "text", text: item });
    }
  }
  
  if (prompt && prompt.trim().length > 0) {
    messageParts.push({ type: "text", text: prompt });
  }
  
  return {
    role: "user",
    content: messageParts,
  };
}
```

**Agent Execution (`source/agent/index.ts:157-250`):**
The `Agent.run()` method:
- Receives `systemPrompt` and `input` parameters
- Gets messages from `sessionManager.get()`
- Passes all to `streamText()` which calls the LLM

```typescript
async *run(args: RunOptions): AsyncGenerator<AgentEvent> {
  const { systemPrompt, input, tools } = args;
  
  const result = streamText({
    model: langModel,
    system: systemPrompt,  // System prompt from prompts.ts
    messages: sessionManager.get(),  // Message history from SessionManager
    // ...
  });
}
```

### 3. Message History Structure

**SessionManager (`source/sessions/manager.ts`):**
- Maintains `this.history: ModelMessage[]`
- Appends user/assistant/tool messages
- Returns message array for LLM API calls
- Persists to disk and restores on resume

```typescript
export class SessionManager extends EventEmitter<MessageHistoryEvents> {
  private history: ModelMessage[];
  
  get() {
    return [...this.history].filter(this.validMessage);
  }
  
  appendUserMessage(msg: UserModelMessage): void {
    this.history.push(msgObj);
  }
}
```

**Message Structure:**
Messages are structured as:
```typescript
interface UserModelMessage {
  role: "user";
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

### 4. Keyboard Handling System

**TUI Input Handler (`source/tui/tui.ts:120-180`):**
- Global keyboard handler catches key sequences before Editor
- Has callback system for special keys (`onCtrlC`, `onCtrlO`, etc.)
- Delegates to focused component (Editor) for regular input

```typescript
export class TUI extends Container {
  private focusedComponent: Component | null = null;
  
  public onCtrlC?: () => void;
  public onCtrlO?: () => void;
  public onCtrlN?: () => void;
  
  private handleInput(data: string): void {
    if (isCtrlO(data)) {
      if (this.onCtrlO) this.onCtrlO();
    }
    // ... delegate to focused component
  }
}
```

**Editor Component (`source/tui/components/editor.ts`):**
- Handles text input, special keys, autocomplete
- Has `onSubmit` callback fired when user submits (Shift+Enter)
- Processes user input before passing to Repl

```typescript
export class Editor implements Component {
  public onSubmit?: (text: string) => void | Promise<void>;
  
  private processInputData(data: string): void {
    if (this.isModifiedEnter(data)) {
      if (this.onSubmit) {
        this.onSubmit(result);  // Fires when user submits
      }
    }
  }
}
```

**Shift+Tab Detection (`source/terminal/keys.ts`):**
```typescript
/**
 * Check if input matches Shift+Tab.
 * Ignores lock key bits.
 */
export function isShiftTab(data: string): boolean {
  return (
    data === RAW.SHIFT_TAB ||
    data === Keys.SHIFT_TAB ||
    data === "\x1b[1;2Z" || // shift+tab with modifier
    matchesKittySequence(data, CODEPOINTS.tab, MODIFIERS.shift)
  );
}
```

### 5. Existing Verbose Mode Pattern

The verbose mode (`source/repl.ts:783-795`) provides a pattern for:
- Toggle state management
- UI notification
- Component updates

```typescript
private handleCtrlO(): void {
  this.verboseMode = !this.verboseMode;
  this.notification.setMessage(`Verbose mode: ${modeText}`);
  this.tui.requestRender();
}
```

### 6. Terminal Title Handling (`source/terminal/control.ts`)

The app already has a pattern for updating terminal state:
```typescript
export function setTerminalTitle(title: string): void {
  process.stdout.write(`\x1b]2;${title}\x07`);
}
```

This could be extended to show current mode in title.

## Architecture & Design Patterns

### Pattern 1: Mode State Management

A new `ModeManager` class should:
- Track current mode (`normal` | `planning` | `research` | `codeReview` | `debugging`)
- Store mode definitions (initial/reminder prompts)
- Handle mode cycling on Shift+Tab
- Reset to Normal on Ctrl+N
- Persist mode state with sessions

**Proposed Interface:**
```typescript
type Mode = 'normal' | 'planning' | 'research' | 'codeReview' | 'debugging';

interface ModeDefinition {
  name: string;
  description: string;
  initialPrompt: string;   // Sent on first message in mode
  reminderPrompt: string;  // Sent on subsequent messages
}

class ModeManager {
  private currentMode: Mode = 'normal';
  private isFirstMessageInMode: boolean = true;
  
  cycle(): Mode;
  getModeContext(): string | null;  // Returns prompt if should add context
  shouldAddContext(): boolean;
  reset(): void;  // Reset to Normal, first-message flag
  
  // Session persistence
  toJSON(): { mode: Mode; isFirst: boolean };
  fromJSON(data: { mode: Mode; isFirst: boolean }): void;
}
```

### Pattern 2: Message Injection Strategy (Hybrid Persistence)

**Key Design Decision:** Initial mode prompts are **persisted** to session history; reminder prompts are **transient** (injected at send-time only). This preserves important context while avoiding history bloat.

**How it works:**
- **First message in mode**: Initial prompt is persisted to `SessionManager.history`, then user message
- **Subsequent messages**: Reminder is injected transiently (prepended to messages array for LLM, NOT persisted)

**Message Ordering (Consistent):**
- Mode context is ALWAYS prepended before user prompt (for better model compliance)
- Initial prompt on first message in mode → persisted
- Reminder prompt on subsequent messages → transient only

**Normal Mode:**
- Single user message (no change from current behavior)
- No mode injection

### Pattern 3: Keyboard Handler for Shift+Tab

The Shift+Tab handler needs to:
1. Be added to TUI class similar to Ctrl+O handler
2. Cycle through available modes (Normal → Planning → Research → Normal...)
3. Update UI with notification
4. Mode state persists through the session

## Data Flow

### Current Flow (Simplified)
```
1. User types in Editor
2. User presses Shift+Enter (submit)
3. Editor.onSubmit fires with text
4. Repl.onSubmit callback receives text
5. Repl passes text to commands.handle()
6. If no command, PromptManager.set(text)
7. User message created via PromptManager.getUserMessage()
8. sessionManager.appendUserMessage(message)
9. systemPrompt() called to get system prompt
10. Agent.run() called with systemPrompt + input
11. Agent calls streamText() with system + messages
12. LLM generates response
```

### Proposed Flow with Modes
```
1. User types in Editor
2. User presses Shift+Tab (change mode)
3. TUI.handleInput detects Shift+Tab
4. ModeManager.cycleMode() called
5. Notification shows new mode (e.g., "Mode: PLANNING")
6. Footer updates with mode indicator
7. 
8. User types prompt and presses Shift+Enter
9. Editor.onSubmit fires with text
10. If ModeManager.shouldAddContext():
    - Get mode context from ModeManager.getModeContext()
    - Create mode context message: { role: "user", content: [{ text: modeContext }]}
    - sessionManager.appendUserMessage(modeContextMessage)
11. Create user prompt message: { role: "user", content: [{ text: userPrompt }]}
12. sessionManager.appendUserMessage(userPromptMessage)
13. Continue with existing flow...
```

### Message Sequence Examples

**Example 1: First Message in Planning Mode**

User types: "I need to implement user authentication"

What the model receives (transient):
```json
[
  {
    "role": "user",
    "content": [{ "type": "text", "text": "You are in PLANNING MODE. Before writing any code:\n\n1. First, understand the requirements fully\n2. Identify the core problem and constraints\n3. Design the solution architecture\n..." }]
  },
  {
    "role": "user",
    "content": [{ "type": "text", "text": "I need to implement user authentication" }]
  }
]
```

What is persisted to session history (initial prompt IS persisted):
```json
[
  {
    "role": "user",
    "content": [{ "type": "text", "text": "You are in PLANNING MODE. Before writing any code:\n\n1. First, understand the requirements fully\n2. Identify the core problem and constraints\n3. Design the solution architecture\n..." }]
  },
  {
    "role": "user",
    "content": [{ "type": "text", "text": "I need to implement user authentication" }]
  },
  {
    "role": "assistant",
    "content": [{ "type": "text", "text": "..." }]
  }
]
```

**Example 2: Subsequent Message in Planning Mode**

User types: "What JWT library should I use?"

What the model receives (transient, reminder prepended):
```json
[
  // Previous history...
  {
    "role": "user",
    "content": [{ "type": "text", "text": "Remember: You are still in PLANNING MODE. Continue focusing on architectural design..." }]
  },
  {
    "role": "user",
    "content": [{ "type": "text", "text": "What JWT library should I use?" }]
  }
]
```

What is persisted (reminder NOT persisted):
```json
[
  // Previous history (includes initial mode prompt)...
  {
    "role": "user",
    "content": [{ "type": "text", "text": "What JWT library should I use?" }]
  },
  {
    "role": "assistant",
    "content": [{ "type": "text", "text": "..." }]
  }
]
```

**Example 3: Normal Mode (No Change)**

User types: "Implement the login endpoint"

Session history:
```json
[
  {
    "role": "user",
    "content": [{ "type": "text", "text": "Implement the login endpoint" }]
  },
  {
    "role": "assistant",
    "content": [{ "type": "text", "text": "..." }]
  }
]
```

### Session Persistence (Simplified)
```
Session Save:
- Save currentMode (string) to session.json only
- Do NOT persist isFirstMessageInMode (derive at runtime)

Session Restore:
- Load mode from session.json
- Set isFirstMessageInMode = false on restore (avoid surprising initial prompt injection on resume)
- Treat missing modeState as Normal mode (backward compatibility)
```

**Rationale:** Persisting `isFirstMessageInMode` is fragile—it can desync if sessions are edited/truncated. Deriving it at runtime from mode-change events is more robust.

### Ctrl+N Behavior
- On Ctrl+N (new chat), ModeManager.reset() is called
- Resets to: currentMode = 'normal', isFirstMessageInMode = true

## Mode Definitions

### Predefined Modes

The following modes are available:

**1. Normal**
- Default mode
- No mode context messages
- Standard behavior

**2. Planning**
Focus: Architectural planning and design
- Initial Prompt: "You are in PLANNING MODE. Before writing any code:\n1. Understand requirements\n2. Identify core problem\n3. Design architecture\n4. Consider edge cases\n5. Plan implementation\n6. Identify dependencies"
- Reminder: "Remember: You are still in PLANNING MODE. Continue focusing on architectural design, systematic planning, and high-level considerations."

**3. Research**
Focus: Investigation and exploration
- Initial Prompt: "You are in RESEARCH MODE. Your goal is to thoroughly investigate:\n1. Current state and context\n2. Existing solutions\n3. Best practices\n4. Trade-offs\n5. Potential pitfalls"
- Reminder: "Remember: You are still in RESEARCH MODE. Continue investigating thoroughly. Synthesize findings."

**4. Code Review**
Focus: Critical code review
- Initial Prompt: "You are in CODE REVIEW MODE. Focus on:\n1. Correctness and bugs\n2. Code quality\n3. Security\n4. Performance\n5. Maintainability\n6. Test coverage"
- Reminder: "Remember: You are still in CODE REVIEW MODE. Maintain critical eye for code quality, security, and correctness."

**5. Debugging**
Focus: Systematic debugging
- Initial Prompt: "You are in DEBUGGING MODE. Systematic approach:\n1. Reproduce issue\n2. Gather context\n3. Form hypotheses\n4. Test methodically\n5. Identify root cause\n6. Propose fixes"
- Reminder: "Remember: You are still in DEBUGGING MODE. Stay systematic. Validate assumptions."

### Notes on Modes
- Modes are NOT configurable via AGENTS.md (hardcoded only)
- Only one mode active at a time
- Users cycle through modes with Shift+Tab

## Components & Files

### New Files to Create

| Component | File | Responsibility |
|-----------|------|----------------|
| ModeManager | `source/modes/manager.ts` | Track mode state, store prompts, handle cycling |
| Mode definitions | `source/modes/definitions.ts` | Define all mode prompts |

### Files to Modify

| File | Changes |
|------|---------|
| `source/tui/tui.ts` | Add Shift+Tab handler, callback for mode changes |
| `source/repl.ts` | Initialize ModeManager, handle transient mode context injection in submit flow |
| `source/sessions/manager.ts` | Persist/restore mode state (mode only, not isFirstMessageInMode) |
| `source/tui/components/footer.ts` | Display current mode indicator |
| `source/commands/manager.ts` | Pass ModeManager to Repl via CommandOptions |
| `source/commands/index.ts` | Add `/mode` command as keybinding fallback |

### Configuration

- **Mode definitions**: Hardcoded in `source/modes/definitions.ts`
- **No user customization**: Modes are predefined
- **Session persistence**: Mode state saved/restored with session

## Integration Points

- **Dependencies**: No new external dependencies
- **Consumers**: Agent.run(), SessionManager, TUI, Footer
- **External systems**: None (self-contained feature)
- **Session sharing**: Mode context messages visible in session exports

## Edge Cases & Error Handling

### Edge Cases
- **First message in new session**: Mode defaults to Normal
- **Session resume with mode**: Restore mode, set isFirstMessageInMode = false
- **Empty mode prompts**: Mode not added if prompt is empty/null
- **Very long mode prompts**: Respect token limits (no special handling)
- **Mode switch mid-conversation**: Reset isFirstMessageInMode = true for new mode
- **Ctrl+N during mode**: Reset to Normal mode, isFirstMessageInMode = true
- **Slash commands**: Do NOT inject mode prompts for `/help`, `/history`, etc.

### Error Handling
- **Invalid mode state**: Default to Normal, log warning
- **Mode state parse error**: Use Normal mode, log error
- **Missing modeState in session**: Treat as Normal mode (backward compatibility)
- **Session save failure**: Continue without mode persistence

### Guardrails
- **Keybinding fallback**: Add `/mode <name>` command as alternative (Shift+Tab unreliable in some terminals)
- **No auto-send on mode change**: Mode switch only updates UI; inject on next submit
- **Ignore Shift+Tab during paste**: Check `inBracketedPaste` before handling
- **Show mode in footer**: Users can always see current mode state

## Testing Coverage

### Existing Tests to Reference
- `source/tui/tui.ts` - TUI keyboard handling tests
- `source/tui/components/editor.ts` - Editor submit flow tests
- `source/sessions/manager.ts` - Session persistence tests

### Test Gaps
- No existing keyboard combination tests (beyond basic input)
- No mode/prompt injection tests
- No multi-modal state persistence tests
- No integration tests for mode cycling

## Recommendations for Planning

### Implementation Order

1. **Create ModeManager Class** (`source/modes/manager.ts`)
   - Define Mode type and constants
   - Implement mode cycling logic
   - Add session persistence methods

2. **Create Mode Definitions** (`source/modes/definitions.ts`)
   - Define all mode prompts (Planning, Research, CodeReview, Debugging)

3. **Add Shift+Tab Handler to TUI**
   - Add `isShiftTab` check in handleInput
   - Add `onModeChange` callback
   - Connect to Repl's mode cycling

4. **Integrate with Repl Submit Flow**
   - Initialize ModeManager in Repl constructor
   - Add mode context message creation before user message
   - Connect to sessionManager.appendUserMessage()

5. **Add Mode Indicator to Footer**
   - Add mode display line in render()
   - Update on mode changes

6. **Implement Session Persistence**
   - Add modeState to SavedMessageHistory
   - Save in SessionManager.save()
   - Restore in SessionManager.restore()

7. **Handle Ctrl+N Reset**
   - Call ModeManager.reset() in handleCtrlN()

### Key Implementation Details

**Hybrid Message Injection (at Agent.run boundary):**
```typescript
// In Repl, when handling user submit:
const userMessage = promptManager.getUserMessage();
const modeContext = modeManager.getModeContext();
const isFirstInMode = modeManager.isFirstMessageInMode();

if (modeContext && isFirstInMode) {
  // FIRST message in mode: persist initial prompt, then user message
  const modeMessage = createUserMessage([], modeContext);
  sessionManager.appendUserMessage(modeMessage);  // Persisted
  sessionManager.appendUserMessage(userMessage);  // Persisted
  modeManager.markFirstMessageSent();
  
  // LLM sees what's in history
  const messagesForLLM = sessionManager.get();
  await agent.run({ systemPrompt, messages: messagesForLLM, ... });
  
} else if (modeContext) {
  // SUBSEQUENT messages: persist user message only, inject reminder transiently
  sessionManager.appendUserMessage(userMessage);  // Persisted
  
  // Build messages with transient reminder prepended
  const historyMessages = sessionManager.get();
  const reminderMessage = createUserMessage([], modeContext);
  const messagesForLLM = [
    ...historyMessages.slice(0, -1),
    reminderMessage,  // Transient - not in history
    historyMessages.at(-1)!
  ];
  await agent.run({ systemPrompt, messages: messagesForLLM, ... });
  
} else {
  // NORMAL mode: just user message
  sessionManager.appendUserMessage(userMessage);
  await agent.run({ systemPrompt, messages: sessionManager.get(), ... });
}
```

**Session Persistence Format (Simplified):**
```json
{
  "project": "...",
  "sessionId": "...",
  "modelId": "...",
  "title": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "messages": [...],
  "modeState": {
    "mode": "planning"
  }
}
```

### Potential Complications

1. ~~**Message history bloat**: Mode reminder prompts added to every subsequent message in a mode~~ **RESOLVED**: Only initial prompt persisted; reminders are transient
2. **Token usage**: Mode prompts consume additional context window tokens (acceptable trade-off)
3. **Backward compatibility**: Must not break existing Normal mode behavior
4. **UI space**: Footer already shows model, tokens, git status - need room for mode indicator
5. ~~**Session sharing**: Reminder clutter in shared sessions~~ **RESOLVED**: Only initial prompt visible; reminders transient

### Code Organization

```
source/
├── modes/
│   ├── manager.ts      # ModeManager class
│   └── definitions.ts  # Mode prompts and types
├── tui/
│   ├── tui.ts          # Add Shift+Tab handler
│   └── components/
│       └── footer.ts   # Add mode indicator
├── repl.ts             # Integrate mode in submit flow
└── sessions/
    └── manager.ts      # Persist/restore mode state
```

## References

- Core prompt flow: `source/prompts.ts`, `source/prompts/manager.ts`
- Agent execution: `source/agent/index.ts:157-250`
- TUI keyboard handling: `source/tui/tui.ts:120-180`
- Editor submit flow: `source/tui/components/editor.ts:550-620`
- Session management: `source/sessions/manager.ts:170-220`
- Keyboard definitions: `source/terminal/keys.ts`
- Verbose mode pattern: `source/repl.ts:783-795`

## Open Questions (Answered)

1. **Q: Should mode prompts be concatenated into user message or sent as separate messages?**
   A: Separate user messages. Initial prompt persisted; reminders transient. Mode context always prepended before user prompt.

2. **Q: Should mode context be visible in session exports?**
   A: **Initial prompts yes**, reminders no. Initial mode prompt is persisted; reminders are transient.

3. **Q: Should there be token optimization for long mode prompts?**
   A: No, use prompts as-is without special handling.

4. **Q: Should users be able to define custom modes?**
   A: No, modes are hardcoded only.

5. **Q: Should mode persist after Ctrl+N (new chat)?**
   A: No, Ctrl+N resets to Normal mode.

6. **Q: What UI changes needed?**
   A: Footer indicator + `/mode` command as keybinding fallback.

7. **Q: Can multiple modes be active simultaneously?**
   A: No, only one mode at a time.

8. **Q: Should we auto-send a message when entering a mode?**
   A: No, mode switch is UI-only. Initial prompt injected on next submit.

9. **Q: Should we persist isFirstMessageInMode?**
   A: No, derive at runtime. On session restore, set to false to avoid surprise injections.
