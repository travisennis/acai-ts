/**
 * Minimal terminal interface for TUI
 */
export interface Terminal {
  // Start the terminal with input and resize handlers
  start(onInput: (data: string) => void, onResize: () => void): void;

  // Stop the terminal and restore state
  stop(): void;

  // Write output to terminal
  write(data: string): void;

  // Get terminal dimensions
  get columns(): number;
  get rows(): number;

  // Cursor positioning (relative to current position)
  moveBy(lines: number): void; // Move cursor up (negative) or down (positive) by N lines

  // Cursor visibility
  hideCursor(): void; // Hide the cursor
  showCursor(): void; // Show the cursor

  // Clear operations
  clearLine(): void; // Clear current line
  clearFromCursor(): void; // Clear from cursor to end of screen
  clearScreen(): void; // Clear entire screen and move cursor to (1,1)
}

/**
 * Real terminal using process.stdin/stdout
 */
export class ProcessTerminal implements Terminal {
  private wasRaw = false;
  private sigintHandler?: () => void;
  private boundInputListener?: (data: Buffer | string) => void;
  private boundResizeListener?: () => void;
  private stopped = false;

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

    // Enable bracketed paste mode - terminal will wrap pastes in \x1b[200~ ... \x1b[201~
    process.stdout.write("\x1b[?2004h");

    // Create bound listeners so we can properly remove them later
    this.boundInputListener = (data: Buffer | string) => {
      onInput(typeof data === "string" ? data : data.toString("utf8"));
    };
    this.boundResizeListener = () => {
      onResize();
    };

    process.stdin.on("data", this.boundInputListener);
    process.stdout.on("resize", this.boundResizeListener);

    this.sigintHandler = () => this.stop();
    process.on("SIGINT", this.sigintHandler);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }

    // Disable bracketed paste mode
    process.stdout.write("\x1b[?2004l");

    // Remove event handlers using the exact references that were added
    if (this.boundInputListener) {
      process.stdin.removeListener("data", this.boundInputListener);
      this.boundInputListener = undefined;
    }
    if (this.boundResizeListener) {
      process.stdout.removeListener("resize", this.boundResizeListener);
      this.boundResizeListener = undefined;
    }

    process.stdin.pause();

    // Restore raw mode state
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(this.wasRaw);
    }
  }

  write(data: string): void {
    process.stdout.write(data);
  }

  get columns(): number {
    return process.stdout.columns || 80;
  }

  get rows(): number {
    return process.stdout.rows || 24;
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      // Move down
      process.stdout.write(`\x1b[${lines}B`);
    } else if (lines < 0) {
      // Move up
      process.stdout.write(`\x1b[${-lines}A`);
    }
    // lines === 0: no movement
  }

  hideCursor(): void {
    process.stdout.write("\x1b[?25l");
  }

  showCursor(): void {
    process.stdout.write("\x1b[?25h");
  }

  clearLine(): void {
    process.stdout.write("\x1b[K");
  }

  clearFromCursor(): void {
    process.stdout.write("\x1b[J");
  }

  clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H"); // Clear screen and move to home (1,1)
  }
}
