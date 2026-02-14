# Implementation Plan: Ctrl+M Keyboard Shortcut for Model Selection

## Overview

Add a keyboard shortcut (Ctrl+M) to trigger the model selector without typing `/model` in the editor. This follows the existing pattern of Ctrl+letter shortcuts (Ctrl+R for review, Ctrl+N for new chat, Ctrl+O for verbose mode).

## Files to Modify

1. `source/terminal/keys.ts` - Add Ctrl+M key detection functions
2. `source/terminal/control.ts` - Export new key detection function
3. `source/tui/tui.ts` - Add onCtrlM handler property and keyboard handling
4. `source/repl.ts` - Wire up onCtrlM to trigger model command

---

## Phase 1: Add Ctrl+M Key Detection (keys.ts) ✅

**Changes to** `source/terminal/keys.ts`

### 1.1 Add 'm' to CODEPOINTS (line ~36-55) ✅

```typescript
m: 109,
```

### 1.2 Add CTRL_M to Keys object (line ~172-200) ✅

```typescript
CTRL_M: kittySequence(CODEPOINTS.m, MODIFIERS.ctrl),
```

### 1.3 Add CTRL_M to RAW object (line ~240-255) ✅

```typescript
CTRL_M: "\x0d",
```

### 1.4 Add isCtrlM function (after isCtrlL around line ~335) ✅

```typescript
/**
 * Check if input matches Ctrl+M (raw byte or Kitty protocol).
 * Ignores lock key bits.
 */
export function isCtrlM(data: string): boolean {
  return (
    data === RAW.CTRL_M ||
    data === Keys.CTRL_M ||
    matchesKittySequence(data, CODEPOINTS.m, MODIFIERS.ctrl)
  );
}
```

**Automated verification:**
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

---

## Phase 2: Export isCtrlM (control.ts) ✅

**Changes to** `source/terminal/control.ts`

### 2.1 Add isCtrlM to exports (line ~27) ✅

```typescript
isCtrlM,
```

**Automated verification:**
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

---

## Phase 3: Add onCtrlM Handler (tui.ts) ✅

**Changes to** `source/tui/tui.ts`

### 3.1 Add onCtrlM property (line ~91, after onCtrlR) ✅

```typescript
public onCtrlM?: () => void;
```

### 3.2 Add Ctrl+M keyboard handling (after Ctrl+N handler around line ~200) ✅

```typescript
// Handle Ctrl+M - model selector
if (isCtrlM(data)) {
  if (this.onCtrlM) {
    this.onCtrlM();
  }
  return;
}
```

**Automated verification:**
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

---

## Phase 4: Wire up onCtrlM in Repl (repl.ts) ✅

**Changes to** `source/repl.ts`

### 4.1 Add onCtrlM handler registration (after onCtrlR registration around line ~221) ✅

```typescript
this.tui.onCtrlM = () => {
  void this.handleCtrlM();
};
```

### 4.2 Add handleCtrlM method (after handleCtrlN method around line ~950) ✅

```typescript
/**
 * Opens the model selector by invoking the /model command handler.
 */
private async handleCtrlM(): Promise<void> {
  await this.commands.handle(
    { userInput: "/model" },
    {
      tui: this.tui,
      container: this.chatContainer,
      inputContainer: this.editorContainer,
      editor: this.editor,
    },
  );
}
```

**Automated verification:**
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

---

## Phase 5: Manual Testing

### 5.1 Run the REPL in tmux

```bash
tmux new-session -d -s acai-test "node source/index.ts"
```

### 5.2 Test Ctrl+M behavior

- [x] With editor empty - press Ctrl+M - should open model selector
- [x] With editor having text - press Ctrl+M - should still open model selector
- [x] Press Escape in model selector - should close and return to editor
- [x] Select a model with Shift+Enter (Kitty protocol) - should change the active model
- [ ] Select a model with Enter key - BUG: Enter resets selection to first item

## Known Issues

### Enter Key Not Working in Model Selector - RESOLVED ✅

**Issue**: When pressing Enter in the model selector, the selection resets to the first item instead of activating the selected model.

**Root cause**: `Ctrl+M` and `Enter` both produce the same raw byte `\x0d` (`\r`) in legacy terminal mode. The `isCtrlM` check in `TUI.handleInput()` was positioned before input is forwarded to the focused component, so every Enter keypress was matched by `isCtrlM`, which re-triggered the model selector (resetting it) instead of letting the keypress reach `ModelSelectorComponent.handleInput()`.

**Fix applied**: Removed the `RAW.CTRL_M` (`\x0d`) match from `isCtrlM()` in `source/terminal/keys.ts`. The function now only matches the Kitty keyboard protocol sequence (`\x1b[109;5u`), which is distinct from a plain Enter keypress. Terminals that support the Kitty protocol (like Ghostty) send a disambiguated sequence for Ctrl+M, so the shortcut still works there.

**File changed**: `source/terminal/keys.ts` — `isCtrlM()` function

**Trade-off**: Ctrl+M will only work in terminals that support the Kitty keyboard protocol. Terminals that only send raw control bytes will not be able to use Ctrl+M (Enter will work normally in those terminals instead).

### 5.3 Verify existing shortcuts still work

- [x] Ctrl+R - review command
- [x] Ctrl+N - new chat
- [x] Ctrl+O - verbose toggle

---

## Edge Cases

1. **Model selector open + Ctrl+M pressed**: Opens another instance (same as typing /model again)
2. **During agent execution + Ctrl+M pressed**: Should open model selector (same as /model during execution)
3. **Modal open + Ctrl+M pressed**: Modal handles input first (e.g., Escape closes modal, then Ctrl+M works)

---

## What We're NOT Doing

- Adding shortcut documentation to welcome component (separate task)
- Adding shortcut hints to footer component (separate task)
- Supporting alternative key combinations (e.g., Cmd+M on macOS - would require platform detection)
