# Ctrl+R Review Shortcut Implementation Plan

## Overview

Add a Ctrl+R keyboard shortcut that triggers the `/review` command directly, bypassing the need to type the command. This makes the review workflow faster and more accessible.

## Current State Analysis

- The `/review` command is defined in `source/commands/review/index.ts` as a `ReplCommand` with a `handle` method that takes `{ tui, container, editor, inputContainer }`.
- Commands are invoked via `CommandManager.handle()` in `source/repl.ts:242`, which is called from the editor's `onSubmit` callback.
- Global keyboard shortcuts are handled in `source/tui/tui.ts:139-214` via `handleInput()`, with callbacks like `onCtrlC`, `onCtrlN`, `onCtrlO` wired up in `source/repl.ts:182-212`.
- Ctrl+R is **not currently used** anywhere in the codebase.
- Key detection functions follow a consistent pattern in `source/terminal/keys.ts` (e.g., `isCtrlN`, `isCtrlO`) and are re-exported via `source/terminal/control.ts`.

### Key Discoveries:
- `source/terminal/keys.ts:28-50` — CODEPOINTS map does not include `r` (needs adding: `r: 114`)
- `source/terminal/keys.ts:170-198` — `Keys` map needs `CTRL_R` entry
- `source/terminal/keys.ts:233-249` — `RAW` map needs `CTRL_R` entry (`\x12`)
- `source/terminal/control.ts:11-50` — re-exports all `isCtrl*` functions
- `source/tui/tui.ts:85-90` — public callback properties for shortcuts
- `source/tui/tui.ts:139-214` — `handleInput` dispatch chain
- `source/repl.ts:182-212` — callback wiring
- `source/repl.ts:238-258` — where commands are invoked with tui context
- `source/commands/review/index.ts:23-293` — the review command handler
- `docs/usage.md:103-114` — keyboard shortcuts documentation table

## Desired End State

Pressing Ctrl+R in the REPL triggers the same review UI as typing `/review` and submitting. The shortcut works from the editor (normal input state), is documented in usage.md, and does not interfere with any other keybinding.

**Verification**: Press Ctrl+R in the REPL and confirm the git diff file selection UI appears, identical to running `/review`.

## What We're NOT Doing

- Adding configurable/remappable keybindings
- Changing the review command's behavior or UI
- Adding shortcuts for other commands

## Implementation Approach

Follow the exact same pattern used for existing global shortcuts (Ctrl+N, Ctrl+O): add key detection, add a TUI callback, wire it up in the Repl to invoke the review command's handler directly.

## Phase 1: Add Ctrl+R Key Detection

### Changes Required:

#### 1. Key detection
**File**: `source/terminal/keys.ts`
**Changes**:
- Add `r: 114` to the `CODEPOINTS` map (~line 43)
- Add `CTRL_R: kittySequence(CODEPOINTS.r, MODIFIERS.ctrl)` to the `Keys` map (~line 182)
- Add `CTRL_R: "\x12"` to the `RAW` map (~line 246)
- Add `isCtrlR` function following the same pattern as `isCtrlE` (~line 299):
  ```typescript
  export function isCtrlR(data: string): boolean {
    return (
      data === RAW.CTRL_R ||
      data === Keys.CTRL_R ||
      matchesKittySequence(data, CODEPOINTS.r, MODIFIERS.ctrl)
    );
  }
  ```

#### 2. Re-export
**File**: `source/terminal/control.ts`
**Changes**:
- Add `isCtrlR` to the re-export list (alphabetically, between `isCtrlP` and `isCtrlT`)

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`

---

## Phase 2: Wire Up the Shortcut

### Changes Required:

#### 1. TUI callback property
**File**: `source/tui/tui.ts`
**Changes**:
- Import `isCtrlR` from `../terminal/control.ts` (add to existing import list ~line 8)
- Add `public onCtrlR?: () => void;` callback property (~line 90)
- Add Ctrl+R handler block in `handleInput()` after the Ctrl+O block (~line 182), following the same pattern:
  ```typescript
  if (isCtrlR(data)) {
    if (this.onCtrlR) {
      this.onCtrlR();
    }
    return;
  }
  ```

#### 2. Repl wiring
**File**: `source/repl.ts`
**Changes**:
- Wire up `this.tui.onCtrlR` callback (~after line 196) that calls the review command directly:
  ```typescript
  this.tui.onCtrlR = () => {
    void commands.handle(
      { userInput: "/review" },
      {
        tui: this.tui,
        container: this.chatContainer,
        inputContainer: this.editorContainer,
        editor: this.editor,
      },
    );
  };
  ```
  This reuses the existing `CommandManager.handle()` path, ensuring identical behavior to typing `/review`.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`
- [x] All tests pass: `npm test`

#### Manual Verification:
- [ ] Pressing Ctrl+R in the REPL opens the review file selection UI
- [ ] The UI is identical to running `/review`
- [ ] Pressing Escape from the review UI returns to the editor
- [ ] Ctrl+R works when the editor is empty and when it has text
- [ ] Existing shortcuts (Ctrl+C, Ctrl+D, Ctrl+N, Ctrl+O) still work

---

## Phase 3: Documentation

### Changes Required:

#### 1. Usage docs
**File**: `docs/usage.md`
**Changes**:
- Add `Ctrl+R` row to the keyboard shortcuts table (~line 113):
  ```
  | `Ctrl+R` | Opens the review view (equivalent to `/review`). |
  ```

### Success Criteria:

#### Automated Verification:
- [x] Full check passes: `npm run check`

#### Manual Verification:
- [ ] Documentation accurately describes the new shortcut

## References

- Existing shortcut pattern: `source/tui/tui.ts:176-190` (Ctrl+O, Ctrl+N)
- Review command: `source/commands/review/index.ts`
- Key detection pattern: `source/terminal/keys.ts:280-299` (isCtrlD, isCtrlE)
