# Background/Resume Functionality Implementation Plan

## Overview

This document outlines the implementation plan for supporting:
1. **Backgrounding the TUI** (Ctrl+Z / SIGTSTP) and resuming with `fg`
2. **Launching external editors** (`$EDITOR`) and returning to the TUI

The implementation follows the pattern from the previously removed `source/terminal/editor-prompt.ts` utility, adapted for the current TUI architecture.

---

## Architecture Analysis

### Current TUI System Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `ProcessTerminal` | `source/tui/terminal.ts` | Raw mode management, input/resize handling |
| `TUI` | `source/tui/tui.ts` | Component rendering, input routing, modal management |
| `NewRepl` | `source/repl-new.ts` | REPL orchestration, message handling, state management |
| `Editor` | `source/tui/components/editor.ts` | Text input component with autocomplete |

### Current Terminal State

The `ProcessTerminal` class currently:
- Saves the previous raw mode state on startup
- Enables raw mode for TUI input
- Has no signal handlers for SIGTSTP/SIGCONT
- No mechanism for preserving screen state during suspension

### Key Insight: Raw Mode and Signals

**Critical**: When `process.stdin.setRawMode(true)` is called, the terminal's `ISIG` flag is disabled. This means:
- Ctrl+Z sends `\x1a` byte to stdin, **not** `SIGTSTP`
- Ctrl+C sends `\x03` byte to stdin, **not** `SIGINT`

Therefore, suspend must be triggered by detecting `\x1a` in the input handler, not by signal handlers.

---

## Implementation Phases

### Phase 1: Terminal State Management

**Goal**: Add suspend/resume lifecycle methods to the terminal

#### 1.1 Updated Interface in `source/tui/terminal.ts`

```typescript
export interface Terminal {
  // ...existing methods...

  // External mode: temporarily restore cooked terminal for subprocesses (editors)
  enterExternalMode(): void;
  exitExternalMode(): void;

  // Job control: background the process (POSIX only)
  background(): void;

  // Check current state
  isInExternalMode(): boolean;

  // Callbacks for state transitions
  onResume(callback: () => void): void;
}
```

**Key Design Decision**: Separate "external mode" (for launching editors) from "background" (job control stop):
- `enterExternalMode()` / `exitExternalMode()` - Switch to cooked mode without stopping the process
- `background()` - Enter external mode AND stop the process via `SIGSTOP`

#### 1.2 Implementation in `ProcessTerminal`

```typescript
export class ProcessTerminal implements Terminal {
  private wasRaw = false;
  private sigintHandler?: () => void;
  private boundInputListener?: (data: Buffer | string) => void;
  private boundResizeListener?: () => void;
  private stopped = false;
  private inExternalMode = false;
  private listenersAttached = false;

  private resumeCallback?: () => void;

  // Store handler as class field for proper cleanup
  private handleSigCont = (): void => {
    // SIGCONT is sent by shell's `fg` command after SIGSTOP
    // We need to restore terminal state
    if (this.inExternalMode) {
      this.exitExternalMode();
    }
  };

  onResume(callback: () => void): void {
    this.resumeCallback = callback;
  }

  isInExternalMode(): boolean {
    return this.inExternalMode;
  }

  /**
   * Enter external mode: restore cooked terminal for subprocesses.
   * Does NOT stop the process - use background() for that.
   */
  enterExternalMode(): void {
    if (this.inExternalMode || this.stopped) return;
    this.inExternalMode = true;

    // Detach input listeners to avoid queued input issues
    this.detachListeners();

    // Reset styles and print newline for clean shell prompt
    process.stdout.write("\x1b[0m\n");

    // Restore terminal to cooked mode
    process.stdout.write("\x1b[?25h"); // Show cursor
    process.stdout.write("\x1b[?2004l"); // Disable bracketed paste

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  }

  /**
   * Exit external mode: re-enter raw mode for TUI.
   */
  exitExternalMode(): void {
    if (!this.inExternalMode || this.stopped) return;
    this.inExternalMode = false;

    // Re-enter raw mode
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    // Re-enable bracketed paste
    process.stdout.write("\x1b[?2004h");

    // Hide cursor (TUI manages cursor visibility)
    process.stdout.write("\x1b[?25l");

    // Re-attach input listeners
    this.attachListeners();

    // Notify TUI to redraw
    this.resumeCallback?.();
  }

  /**
   * Background the process: enter external mode AND stop via SIGSTOP.
   * Used for Ctrl+Z job control (POSIX only).
   */
  background(): void {
    if (this.stopped) return;

    // Enter external mode first
    this.enterExternalMode();

    // Use SIGSTOP (cannot be caught) to actually stop the process
    // Shell's `fg` will send SIGCONT which triggers handleSigCont
    process.kill(process.pid, "SIGSTOP");
  }

  private attachListeners(): void {
    if (this.listenersAttached || !this.boundInputListener) return;

    process.stdin.on("data", this.boundInputListener);
    if (this.boundResizeListener) {
      process.stdout.on("resize", this.boundResizeListener);
    }
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;

    if (this.boundInputListener) {
      process.stdin.removeListener("data", this.boundInputListener);
    }
    if (this.boundResizeListener) {
      process.stdout.removeListener("resize", this.boundResizeListener);
    }
    this.listenersAttached = false;
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Terminal requires TTY environment");
    }

    // Save previous state and enable raw mode
    this.wasRaw = process.stdin.isRaw ?? false;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    // Enable bracketed paste mode
    process.stdout.write("\x1b[?2004h");

    // Create bound listeners
    this.boundInputListener = (data: Buffer | string) => {
      onInput(typeof data === "string" ? data : data.toString("utf8"));
    };
    this.boundResizeListener = () => {
      onResize();
    };

    this.attachListeners();

    // SIGCONT: Resume from background (sent by shell's `fg` command)
    process.on("SIGCONT", this.handleSigCont);

    // SIGTERM/SIGHUP: Clean exit
    process.on("SIGTERM", () => this.stop());
    process.on("SIGHUP", () => this.stop());

    this.sigintHandler = () => {
      // Let the custom handler in NewRepl handle Ctrl+C
    };
    process.on("SIGINT", this.sigintHandler);

    // Crash cleanup: restore terminal on unexpected exit
    this.setupCrashCleanup();
  }

  private cleanupHandler?: () => void;

  private setupCrashCleanup(): void {
    // Only register once
    if (this.cleanupHandler) return;

    this.cleanupHandler = () => {
      process.stdout.write("\x1b[?25h"); // Show cursor
      process.stdout.write("\x1b[?2004l"); // Disable bracketed paste
      process.stdout.write("\x1b[0m"); // Reset styles
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
    };

    process.on("exit", this.cleanupHandler);

    process.on("uncaughtException", (err) => {
      this.cleanupHandler?.();
      console.error("Uncaught exception:", err);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      this.cleanupHandler?.();
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    // Remove signal handlers
    process.off("SIGCONT", this.handleSigCont);

    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }

    // Disable bracketed paste mode
    process.stdout.write("\x1b[?2004l");

    // Remove event handlers
    this.detachListeners();
    this.boundInputListener = undefined;
    this.boundResizeListener = undefined;

    process.stdin.pause();

    // Restore raw mode state
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(this.wasRaw);
    }
  }

  // ...rest of existing implementation
}
```

---

### Phase 2: TUI Integration

**Goal**: Handle Ctrl+Z in input and integrate suspend/resume

#### 2.1 Add Ctrl+Z Detection in `source/terminal/control.ts`

```typescript
export function isCtrlZ(data: string): boolean {
  return data === "\x1a";
}
```

#### 2.2 Modifications to `source/tui/tui.ts`

```typescript
import { isCtrlC, isCtrlZ, isEscape } from "../terminal/control.ts";

export class TUI extends Container {
  private terminal: Terminal;
  private focusedComponent: Component | null = null;
  private renderRequested = false;
  private isRendering = false;
  private renderAgain = false;
  private activeModal: Modal | null = null;
  private inBracketedPaste = false; // Track paste mode to avoid false Ctrl+Z

  public onCtrlC?: () => void;

  constructor(terminal: Terminal) {
    super();
    this.terminal = terminal;
  }

  start(): void {
    // Handle resume from background - redraw the screen
    this.terminal.onResume(() => {
      this.requestRender();
    });

    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.requestRender(),
    );
    this.terminal.hideCursor();
    this.requestRender();
  }

  private handleInput(data: string): void {
    // Track bracketed paste mode to avoid treating \x1a inside paste as Ctrl+Z
    if (data.includes("\x1b[200~")) {
      this.inBracketedPaste = true;
    }
    if (data.includes("\x1b[201~")) {
      this.inBracketedPaste = false;
    }

    // Handle Ctrl+C globally
    if (isCtrlC(data)) {
      console.info("\nCtrl+C pressed - exiting...");
      if (this.onCtrlC) {
        this.onCtrlC();
      } else {
        this.stop();
        process.exit(0);
      }
      return;
    }

    // Handle Ctrl+Z - background the process (POSIX only)
    // Only treat as Ctrl+Z if it's a standalone keypress, not inside a paste
    if (data === "\x1a" && !this.inBracketedPaste) {
      if (process.platform === "win32") {
        // Windows doesn't support job control
        return;
      }
      this.terminal.background();
      return;
    }

    // Handle Escape key to close modal
    if (isEscape(data) && this.activeModal) {
      this.hideModal();
      return;
    }

    // Pass input to active modal or focused component
    if (this.activeModal?.handleInput) {
      this.activeModal.handleInput(data);
      this.requestRender();
    } else if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
    }
  }

  requestRender(): void {
    // Don't render while in external mode
    if (this.terminal.isInExternalMode()) {
      this.renderAgain = true;
      return;
    }
    if (this.isRendering) {
      this.renderAgain = true;
      return;
    }
    if (this.renderRequested) return;
    this.renderRequested = true;
    setImmediate(() => {
      this.renderRequested = false;
      this.doRender();
    });
  }

  private doRender(): void {
    if (this.terminal.isInExternalMode() || this.isRendering) {
      this.renderAgain = true;
      return;
    }
    // ...rest of existing implementation
  }

  // ...rest of existing implementation
}
```

---

### Phase 3: External Editor Launcher

**Goal**: Create utility to launch external editors with proper terminal handling

#### 3.1 New File: `source/tui/editor-launcher.ts`

```typescript
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Terminal } from "./terminal.ts";

export interface EditorLaunchOptions {
  initialContent?: string;
  postfix?: string;
  terminal: Terminal;
  signal?: AbortSignal;
}

export interface EditorLaunchResult {
  content: string;
  aborted: boolean;
}

export async function launchEditor(
  options: EditorLaunchOptions,
): Promise<EditorLaunchResult> {
  const { terminal, initialContent = "", postfix = ".txt", signal } = options;

  // Check for abort before starting
  if (signal?.aborted) {
    return { content: "", aborted: true };
  }

  // Create temp file
  const tempDir = await mkdtemp(join(tmpdir(), "acai-editor-"));
  const tempFile = join(tempDir, `edit${postfix}`);

  let enteredExternalMode = false;

  try {
    await writeFile(tempFile, initialContent, "utf8");

    // Enter external mode - exits raw mode, shows cursor, etc.
    // Does NOT stop the process (unlike background())
    terminal.enterExternalMode();
    enteredExternalMode = true;

    const editor = process.env.EDITOR || process.env.VISUAL || "vi";

    // Spawn editor with inherited stdio
    const child = spawn(editor, [tempFile], {
      stdio: "inherit",
      shell: true, // Allows $EDITOR to contain args like "code -w"
    });

    // Handle abort signal
    let abortHandler: (() => void) | undefined;
    if (signal) {
      abortHandler = () => {
        // Try SIGTERM first, fall back to kill() for cross-platform
        child.kill("SIGTERM") || child.kill();
      };
      signal.addEventListener("abort", abortHandler);
    }

    try {
      // Wait for editor to exit
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 0));
      });

      if (signal?.aborted) {
        return { content: "", aborted: true };
      }

      if (exitCode !== 0) {
        throw new Error(`Editor exited with code ${exitCode}`);
      }

      // Read edited content
      const content = await readFile(tempFile, "utf8");
      return { content, aborted: false };
    } finally {
      // Always remove abort listener
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  } finally {
    // ALWAYS restore terminal state, even on errors
    if (enteredExternalMode) {
      terminal.exitExternalMode();
    }

    // Cleanup temp file
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

---

### Phase 4: Usage in Commands

#### 4.1 Example: Editor Command Integration

```typescript
import { launchEditor } from "../tui/editor-launcher.ts";

async function handleEditCommand(
  terminal: Terminal,
  currentContent: string,
): Promise<string> {
  const result = await launchEditor({
    initialContent: currentContent,
    postfix: ".md",
    terminal,
  });

  if (result.aborted) {
    throw new Error("Editor was aborted");
  }

  return result.content;
}
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `source/tui/terminal.ts` | Modified | Add `enterExternalMode()`, `exitExternalMode()`, `background()`, `isInExternalMode()`, crash cleanup |
| `source/tui/tui.ts` | Modified | Handle Ctrl+Z input, integrate external mode, bracketed paste tracking |
| `source/tui/editor-launcher.ts` | **New** | Editor launching with proper terminal handling |

---

## Platform Considerations

### POSIX (Linux, macOS)
- Full support for Ctrl+Z backgrounding and `fg` resume
- `SIGSTOP` used instead of `SIGTSTP` to avoid handler recursion
- `SIGCONT` handler restores terminal state on resume

### Windows
- **No job control support** - Ctrl+Z is ignored in the TUI
- Editor launching still works (terminal suspend/resume for spawning)
- Consider showing a message: "Backgrounding not supported on Windows"

---

## Testing Strategy

### Manual Tests

#### Test 1: Background and Resume (POSIX only)
```bash
# Start acai
acai

# While in conversation, press Ctrl+Z
^Z
[1]+  Stopped                 acai

# Resume
fg

# Expected: TUI redraws correctly, input works
```

#### Test 2: External Editor Launch
```bash
# Start acai with EDITOR set
EDITOR=vim acai

# Use a command that launches an editor
/edit /path/to/file.md

# Editor opens
# Make changes, save, exit

# Expected: TUI returns with redrawn state
```

#### Test 3: Multiple Suspend/Resume Cycles
```bash
acai
# Ctrl+Z, fg, Ctrl+Z, fg, Ctrl+Z, fg
# Expected: No listener leaks, no state corruption
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Editor crash | TUI restores via `finally`, error message shown |
| Ctrl+C during editor | Sent to editor (stdio: inherit), not TUI |
| Multiple suspend/resume cycles | State preserved, no listener leaks (tracked via `listenersAttached`) |
| Resize during suspension | Full redraw on resume |
| No `$EDITOR` env var | Falls back to "vi" |
| Windows Ctrl+Z | Ignored (no-op) |
| Crash/uncaughtException | Terminal restored via cleanup handlers |
| Ctrl+Z inside bracketed paste | Ignored (tracked via `inBracketedPaste`) |
| SIGTERM/SIGHUP | Clean exit with terminal restoration |
| spawn() fails before editor starts | Terminal still restored via `finally` |

---

## Technical Notes

### Why Separate `enterExternalMode()` from `background()`?

These are two different operations that were conflated in earlier designs:

1. **`enterExternalMode()` / `exitExternalMode()`** - Switch terminal to cooked mode for running subprocesses (editors). The Node process keeps running.

2. **`background()`** - Enter external mode AND stop the process via `SIGSTOP`. Used only for Ctrl+Z job control.

If `suspend()` always called `SIGSTOP`, the editor launcher would freeze the process before spawning the editor!

### Why SIGSTOP instead of SIGTSTP?

`SIGTSTP` can be caught/handled. If you have a handler installed and call `process.kill(pid, "SIGTSTP")`, the handler fires again instead of stopping the process—causing infinite recursion.

`SIGSTOP` cannot be caught, blocked, or ignored. It always stops the process, and the shell's `fg` command sends `SIGCONT` to resume.

### Why Handle Ctrl+Z as Input, Not Signal?

When `setRawMode(true)` is called, the terminal's `ISIG` flag is disabled. This means special characters like Ctrl+Z (`\x1a`) and Ctrl+C (`\x03`) are delivered as bytes on stdin, not as signals. The existing Ctrl+C handling already uses this pattern.

### Why Track Bracketed Paste Mode?

With bracketed paste enabled, the terminal wraps pasted content in `\x1b[200~` ... `\x1b[201~`. If someone pastes text containing a literal `\x1a` byte, we must not treat it as Ctrl+Z. The `inBracketedPaste` flag prevents false triggers.

### Terminal State: Don't Restore, Reset

Terminal modes like bracketed paste aren't queryable. Instead of trying to "save and restore" unknown prior state:
- Always disable bracketed paste on suspend/external mode
- Always enable it on resume
- This is deterministic and avoids corruption

### Why `try/finally` in Editor Launcher?

Terminal state restoration MUST happen on all paths:
- Normal exit
- Editor crash (non-zero exit code)
- `spawn()` failure
- Abort signal

The `finally` block guarantees `exitExternalMode()` is called, preventing the user from being stranded with a broken terminal.

---

## References

- Original `editor-prompt.ts`: https://github.com/travisennis/acai-ts/blob/6b5dea3f7d9423a090a2772e0f9d7382ffc59b08/source/terminal/editor-prompt.ts
- Node.js child_process: https://nodejs.org/api/child_process.html
- Terminal escape codes: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
- POSIX signals: https://man7.org/linux/man-pages/man7/signal.7.html
