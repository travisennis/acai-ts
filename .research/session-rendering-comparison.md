# Session Rendering Comparison: Current vs. Resumed Sessions

## High-Level Summary

The TUI renders sessions differently depending on how they are resumed. The key distinction is between incremental rendering (current sessions) and batch reconstruction (resumed sessions via `/history`), while `--continue` and `--resume` flags use a hybrid approach.

## Relevant Code Locations

- `source/index.ts:367-439` - `handleResumeOrContinue()` function
- `source/index.ts:486-491` - REPL initialization with conditional rerender
- `source/repl.ts:479-613` - `rerender()` and `reconstructSession()` methods
- `source/repl.ts:169` - `onReconstructSession` callback setup
- `source/commands/history/index.ts:121-136` - `/history` command resume action
- `source/sessions/manager.ts:327-359` - `SessionManager.restore()` method

## Execution Flow / Data Flow

### 1. Current Session (Normal Flow)

When a session is active and the user submits messages:

1. User enters text → `editor.onSubmit` callback (source/repl.ts:215)
2. Message processed → `sessionManager.appendUserMessage()` (source/repl.ts:276)
3. Agent generates response → `repl.handle()` called for each event (source/index.ts:537)
4. Each event renders incrementally:
   - User messages → `UserMessageComponent` added to `chatContainer`
   - Assistant messages → `AssistantMessageComponent` added to `chatContainer`
   - Tool calls → `ToolExecutionComponent` added to `chatContainer`
5. `tui.requestRender()` called after each component addition

**Key characteristic**: Messages render one at a time as they arrive, preserving the streaming experience.

### 2. --continue Flag (source/index.ts:372-408)

1. User runs `acai --continue`
2. `handleResumeOrContinue()` loads histories via `SessionManager.load()`
3. Interactive prompt shown for user selection
4. `sessionManager.restore(selectedHistory)` called
5. Terminal title set
6. REPL initialization continues normally
7. At `source/index.ts:489-491`: if session is not empty, `repl.rerender()` called

**Key characteristic**: Session restored before REPL initialization, then reconstructed during init.

### 3. --resume Flag (source/index.ts:409-439)

Two sub-flows:

**With session ID** (`acai --resume <id>`):
1. Histories loaded
2. Target found by sessionId
3. `sessionManager.restore(targetHistory)` called
4. Terminal title set
5. Same as --continue: `repl.rerender()` called if session not empty

**Without session ID** (`acai --resume`):
1. Histories loaded (uses `CONTINUE_HISTORY_LIMIT`)
2. Latest history selected
3. `sessionManager.restore(latestHistory)` called
4. Terminal title set
5. Same as --continue: `repl.rerender()` called if session not empty

**Key characteristic**: Identical to --continue in terms of rendering behavior.

### 4. /history Command (source/commands/history/index.ts:121-136)

1. User runs `/history` in active session
2. Conversation selector shown in TUI
3. User selects a conversation
4. Action selector shown (resume/export/summarize)
5. User selects "resume"
6. `sessionManager.restore(conversation)` called
7. Terminal title set
8. **`tui.onReconstructSession?.()` explicitly called** (source/commands/history/index.ts:136)
9. This triggers `repl.rerender()` (source/repl.ts:169)

**Key characteristic**: Explicit reconstruction triggered after session restore, while REPL is already active.

## Key Abstractions & Interfaces

- **SessionManager.restore()** (source/sessions/manager.ts:327-359): Restores session state from saved history, including messages and metadata
- **repl.rerender()** (source/repl.ts:479-511): Reconstructs entire session display by calling `reconstructSession()`
- **reconstructSession()** (source/repl.ts:514-575): Clears display and rebuilds all messages from session history
- **onReconstructSession callback** (source/tui/tui.ts:82): Optional callback for triggering session reconstruction

## Configuration & Environment Dependencies

- `DEFAULT_HISTORY_LIMIT` (source/index.ts:373): Used for loading histories in --continue mode
- `CONTINUE_HISTORY_LIMIT` (source/index.ts:430): Used for loading histories in --resume mode (without ID)
- Session files stored in `~/.acai/sessions/` directory

## Edge Cases & Conditional Logic

1. **Empty sessions**: `repl.rerender()` only called if `!state.sessionManager.isEmpty()` (source/index.ts:489)
2. **Token usage tracking**: `repl.rerender()` populates `tokenTracker` with historical usage (source/repl.ts:481-488)
3. **Tool result collection**: `reconstructSession()` does two passes - first collects tool results, then renders messages (source/repl.ts:514-575)
4. **Message filtering**: Empty messages and messages with empty content arrays are filtered out (source/sessions/manager.ts:140-153)

## Differences Between --continue, --resume, and /history

**--continue and --resume**:
- Session restore happens during initialization (before REPL starts)
- `repl.rerender()` called conditionally during REPL init if session not empty
- No explicit `onReconstructSession` callback invocation
- Terminal title set via `setTerminalTitle()`

**/history command**:
- Session restore happens while REPL is already active
- Explicitly calls `tui.onReconstructSession?.()` which triggers `repl.rerender()`
- Terminal title set via `setTerminalTitle()`
- User stays in same REPL session (no restart)

**Current session**:
- No restore needed
- Messages render incrementally as they arrive
- No reconstruction required

## Unclear or Underdocumented Areas

1. **CONTINUE_HISTORY_LIMIT vs DEFAULT_HISTORY_LIMIT**: The code uses different limits for --continue (DEFAULT_HISTORY_LIMIT) and --resume without ID (CONTINUE_HISTORY_LIMIT), but the purpose of this distinction is not documented.

2. **Tool execution state reconstruction**: When reconstructing a session, tool execution components are created but it's unclear if they retain the same state (e.g., expanded/collapsed, showing/hiding output) as when the session was saved.

3. **Welcome component behavior**: The welcome component is added during `repl.init()` (source/repl.ts:171), but it's unclear whether it should be hidden when reconstructing a session or if it's handled implicitly.