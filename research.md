# Mouse-Based Text Selection Research Report

## Research Question

What would it take to support mouse-based text selection in acai to enable copying text from the terminal output?

## Overview

Mouse-based text selection for copying **already works** in acai. The current implementation handles this correctly through standard terminal behavior:

- **Regular click + drag**: Does not work (mouse tracking intercepts events)
- **Shift + Click + drag**: Works (terminal's native selection mode)

## Current Implementation

### Mouse Tracking

Mouse tracking is enabled in `source/tui/terminal.ts:100-102`:

```typescript
// Enable mouse tracking (SGR mode) so trackpad scroll sends mouse events
// instead of being translated into arrow key sequences
process.stdout.write("\x1b[?1000h\x1b[?1006h");
```

### Mouse Event Handling

The TUI class in `source/tui/tui.ts:279-306` handles mouse events:

```typescript
private handleMouseEvent(data: string): void {
  // SGR mouse format: \x1b[<button;x;yM (press) or \x1b[<button;x;ym (release)
  const button = Number.parseInt(data.slice(start + 1, semi), 10);

  // Button 64 = scroll up, button 65 = scroll down
  if (button === 64) {
    // Handle scroll up
  } else if (button === 65) {
    // Handle scroll down
  }
  // Button 0 (left-click) is NOT handled - passed through to terminal
}
```

**Current behavior**:
- Scroll wheel (buttons 64/65): Handled by application for virtual scrolling
- Left-click (button 0): **Not handled** - passed through to terminal
- Shift+Left-click: Terminal's native selection mode activates

### Why Shift+Click Works

The SGR mouse mode (`?1006h`) sends mouse events to the application. However, terminals implement a standard behavior where **Shift+click bypasses mouse tracking** and activates the terminal's native text selection:

1. When Shift is held during a click, the terminal detects this modifier
2. Instead of sending the event to the application, the terminal handles it natively
3. This enables the terminal's standard text selection (click+drag to select)
4. Users can copy with Cmd+C (macOS) or Ctrl+Shift+C (Linux)

This is defined in the XTerm mouse tracking specification and is supported by most modern terminals (iTerm2, Terminal.app, Ghostty, Alacritty, etc.).

## Existing Copy Functionality

acai already has a `/copy` command (`source/commands/copy/index.ts`) that copies the last assistant response to the clipboard:

```typescript
// source/commands/copy/index.ts:8-53
export function copyCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/copy",
    description: "Copy the last assistant response to the clipboard",
    async handle(...) {
      const lastText = extractLastAssistantText(history);
      if (lastText) {
        await Clipboard.setText(lastText);
      }
    }
  };
}
```

The text extraction logic (`source/commands/copy/utils.ts`) iterates through message history to find the last assistant message with text content.

## Current State Summary

| Feature | Status |
|---------|--------|
| Shift+Click for selection | ✅ Works (terminal native) |
| Regular Click+Drag | ❌ Intercepted by app |
| Scroll via trackpad | ✅ Works (app handles buttons 64/65) |
| /copy command | ✅ Works (copies last response) |

## How Users Can Copy Text

### Option 1: Shift+Click (Recommended)

1. Hold Shift
2. Click and drag to select text
3. Release, then copy with Cmd+C (macOS) or Ctrl+Shift+C (Linux)

### Option 2: /copy Command

Type `/copy` to copy the last assistant message to clipboard.

## Future Enhancements

If the goal is to make regular click+drag work for selection (without holding Shift), there are two approaches:

### Approach A: Disable Mouse Tracking (Simplest)

Add a keyboard shortcut to toggle mouse tracking on/off:

```typescript
// In terminal.ts - add toggle method
toggleMouseTracking(enable: boolean): void {
  if (enable) {
    process.stdout.write("\x1b[?1000h\x1b[?1006h");
  } else {
    process.stdout.write("\x1b[?1000l\x1b[?1006l");
  }
}
```

- When disabled: native selection works, but scroll via trackpad sends arrow keys
- When enabled: scroll works, native selection requires Shift

### Approach B: Application-Managed Selection (Complex)

Handle left-click (button 0) in the application:
1. Track selection start/end positions from mouse coordinates
2. Map screen coordinates to text offsets
3. Render selection highlight with ANSI reverse video
4. Copy to clipboard on selection complete

This requires complex coordinate mapping due to:
- Scroll offset in viewport
- Fixed footer (editor, input)
- Line wrapping
- ANSI escape codes

## Conclusion

The current implementation already supports mouse-based text selection through Shift+Click, which is the standard way to use selection in terminals with mouse tracking enabled. This is working as intended and no changes are required to enable basic text copying.

Users who want to copy text should use **Shift+Click+drag** followed by **Cmd+C** (macOS) or **Ctrl+Shift+C** (Linux), or use the `/copy` command to copy the last assistant response.
