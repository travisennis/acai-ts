# File Activity Panel - Implementation Plan

## Summary

Add a toggleable panel above the editor that shows files being worked on during agent execution. The panel displays filename + operation type (Write/Edit/Delete), appears automatically when agent starts, and clears when the agent commits to git.

## Goals & Success Criteria

### Automated Verification
- `npm run check` passes (typecheck, lint, format)
- New component renders without errors in existing TUI framework
- Keyboard shortcut `Ctrl+Shift+F` toggles panel visibility
- File operations from Edit/Write tools appear in panel
- Panel clears when agent runs git commit

### Manual Verification
- Panel appears above editor when agent starts working
- Panel shows correct file paths and operation types
- `Ctrl+Shift+F` shows/hides panel
- Files clear from panel after agent commits to git
- Panel does not interfere with editor input or command execution

## Architecture

### Data Flow
```
Tool Events (Edit/Write/Bash)
       ↓
FileActivityTracker (new)
       ↓
FileActivityPanel (new)
       ↓
TUI Render
```

### Key Components

1. **FileActivityTracker** - Captures and stores file operations from tool events
2. **FileActivityPanel** - TUI component that displays the file list
3. **Integration in Repl** - Wiring events, keyboard shortcut, git commit detection

## Changes by File

### New Files

#### 1. `source/tui/components/file-activity-panel.ts`
New TUI component extending `Container`. Based on `ToolExecutionComponent` patterns.

**Responsibilities:**
- Display list of files with operation type
- Toggle visibility on keyboard shortcut
- Clear file list on command

**Interface:**
```typescript
interface FileActivityEntry {
  path: string;        // Display path (relative to workspace)
  operation: 'write' | 'edit' | 'delete' | 'create-dir';
  timestamp: number;
}

class FileActivityPanel extends Container {
  addEntry(entry: FileActivityEntry): void;
  clear(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
}
```

**UI Layout:**
- Header: "Files" title (1 row)
- File list: scrollable if > N files (MVP: show last 10)
- Each row: `{operation-icon} {filename}`
- Operation icons: `+` (write), `E` (edit), `-` (delete), `D` (dir)
- Background: slightly darker than chat (existing pattern)

---

### Modified Files

#### 2. `source/repl.ts`

**Changes:**
- Add `FileActivityPanel` instance (`fileActivityPanel`)
- Add `fileActivityVisible` state flag
- Initialize panel in constructor
- Add panel to TUI layout (above editor container)
- Handle `Ctrl+Shift+F` in keyboard handlers
- In `handleAgentEvent()`:
  - On `agent-start`: call `fileActivityPanel.show()`
  - On `agent-stop`: call `fileActivityPanel.hide()`
- In tool event handling: extract file paths and call `fileActivityPanel.addEntry()`
- Detect git commits: parse tool output for commit success, call `fileActivityPanel.clear()`

**Key locations:**
- Line ~131: `chatContainer = new Container()` - add panel initialization
- Line ~218: keyboard handler setup - add `Ctrl+Shift+F`
- Line ~386-467: `handleAgentEvent()` switch - add file tracking
- Line ~259-268: TUI layout setup - add panel to layout

#### 3. `source/tui/components/footer.ts` (Reference Only)

No changes needed. The footer already has `getProjectStatus()` that queries git. We'll call this from the file activity panel to enrich display if needed. For MVP, we skip this and just show tool-tracked operations.

#### 4. `source/agent/index.ts` (Reference Only)

**No changes.** We already have `ToolEvent` types exported:
```typescript
export type ToolEvent =
  | { type: "tool-call-start"; name: string; toolCallId: string; msg: string; args: unknown; }
  | { type: "tool-call-end"; name: string; toolCallId: string; msg: string; }
  | { type: "tool-call-error"; name: string; toolCallId: string; msg: string; }
```

We'll parse `args` from `tool-call-start` to extract file paths for Write/Edit tools.

---

## Implementation Details

### Phase 1: FileActivityPanel Component

**File:** `source/tui/components/file-activity-panel.ts`

1. Extend `Container` (like `ToolExecutionComponent`)
2. Store `entries: FileActivityEntry[]`
3. Implement `render()` to show file list
4. Track visibility state internally

**Styling:**
- Background: use existing `bgColor` from `tool-execution.ts` (`r:52, g:53, b:65`)
- Header: bold "Files" with dim border
- Each entry: icon + path, icon colored by operation
  - `write`: green
  - `edit`: yellow
  - `delete`: red
  - `create-dir`: blue

### Phase 2: Repl Integration

**Step 2.1: Initialize and Layout**
```typescript
// In Repl constructor, after editorContainer:
this.fileActivityPanel = new FileActivityPanel();
this.fileActivityVisible = false;

// In init(), add to TUI before editorContainer:
this.tui.addChild(this.fileActivityPanel);
```

**Step 2.2: Keyboard Shortcut**
```typescript
// Add in init() keyboard setup:
this.tui.onCtrlShiftF = () => {
  this.fileActivityPanel.toggle();
  this.tui.requestRender();
};
```

Need to check if `onCtrlShiftF` exists in TUI, may need to add to `tui.ts`.

**Step 2.3: Track File Operations**

In `handleAgentEvent()` for `tool` event type:

```typescript
case "tool": {
  // Existing tool handling...

  // NEW: Track file operations
  const toolName = event.events?.[0]?.name;
  if (toolName === "Write" || toolName === "Edit") {
    const args = event.events?.[0]?.args as { path?: string; edits?: Array<{ newText?: string }> };
    if (args?.path) {
      const operation = toolName === "Write" ? "write" : "edit";
      this.fileActivityPanel.addEntry({
        path: args.path,
        operation,
        timestamp: Date.now(),
      });
    }
  }
}
```

**Step 2.4: Git Commit Detection**

After tool execution completes, check output:

```typescript
// In tool-call-end handling
if (toolName === "Bash") {
  const output = event.msg;
  if (output.includes("git commit") && output.includes("commit ")) {
    // Check for successful commit (has hash)
    const commitMatch = output.match(/commit ([a-f0-9]+)/i);
    if (commitMatch) {
      this.fileActivityPanel.clear();
    }
  }
}
```

**Step 2.5: Auto-show/hide**

```typescript
// In handleAgentEvent:
case "agent-start":
  this.fileActivityPanel.show();
  break;
case "agent-stop":
  this.fileActivityPanel.hide();
  break;
```

---

## Edge Cases

1. **Bash tool creates/deletes files**: Track `mkdir`, `rm`, `mv` commands in Bash tool output parsing
2. **Duplicate entries**: Deduplicate by path (update existing entry if same path appears)
3. **Long paths**: Truncate with `...` if > 40 chars
4. **No git repo**: Panel still works, just never clears (until session end)
5. **Terminal resize**: Panel should reflow content on resize
6. **Empty state**: Show "No files changed" when panel visible but empty

---

## Out of Scope (v1)

- Git status integration in panel (uses existing footer instead)
- Clickable file entries
- Keyboard navigation in panel
- Auto-scroll to latest
- Show diff summary
- Periodically refresh from git status
- Configuration option to disable

---

## Testing Strategy

### Unit Tests
- `FileActivityPanel.addEntry()` - verifies entry added correctly
- `FileActivityPanel.clear()` - verifies list cleared
- `FileActivityPanel.toggle()` - verifies visibility toggles

### Manual Testing
1. Start acai in tmux
2. Ask: "Create a new file called test.txt with hello world"
3. Verify panel appears with `test.txt` + write indicator
4. Press `Ctrl+Shift+F` - panel should hide
5. Press again - panel should show
6. Ask: "Commit these changes" (if git initialized)
7. Verify panel clears after commit

---

## Assumptions

1. `Ctrl+Shift+F` handler can be added to TUI (need to verify in `tui.ts`)
2. Tool event args contain file paths in expected format (`{ path: string }`)
3. Git commit detection via output string is reliable enough for MVP
4. Panel doesn't need to persist across sessions

---

## Files Modified Summary

| File | Change Type | Lines |
|------|-------------|-------|
| `source/tui/components/file-activity-panel.ts` | New | ~150 |
| `source/repl.ts` | Modify | ~30 additions |
| `source/tui/tui.ts` | Possibly modify | Add `onCtrlShiftF` handler if missing |

---

## Rollback Strategy

If issues arise:
1. Disable by commenting out panel initialization in `repl.ts`
2. Keyboard shortcut can be removed independently
3. File tracking can be disabled while keeping panel structural code
