/**
 * Minimal TUI implementation with differential rendering
 */

import {
  getTerminalSize,
  isCtrlC,
  isCtrlZ,
  isEscape,
} from "../terminal/control.ts";
import style from "../terminal/style.ts";
import type { Modal } from "./components/modal.ts";
import type { Terminal } from "./terminal.ts";
import { visibleWidth } from "./utils.ts";

/**
 * Component interface - all components must implement this
 */
export interface Component {
  /**
   * Render the component to lines for the given viewport width
   * @param width - Current viewport width
   * @returns Array of strings, each representing a line
   */
  render(width: number): string[];

  /**
   * Optional handler for keyboard input when component has focus
   */
  handleInput?(data: string): void;

  /**
   * Optional method to get cursor position relative to component
   * Returns [row, col] where row is 0-indexed within component
   * and col is 0-indexed column position
   */
  getCursorPosition?(): [number, number] | null;
}

export { visibleWidth };

/**
 * Container - a component that contains other components
 */
export class Container implements Component {
  children: Component[] = [];

  addChild(component: Component): void {
    this.children.push(component);
  }

  removeChild(component: Component): void {
    const index = this.children.indexOf(component);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }

  clear(): void {
    this.children = [];
  }

  render(width: number): string[] {
    return this.children.flatMap((child) => child.render(width));
  }
}

/**
 * TUI - Main class for managing terminal UI with differential rendering
 */

// biome-ignore lint/style/useNamingConvention: override
export class TUI extends Container {
  private terminal: Terminal;
  private focusedComponent: Component | null = null;
  private renderRequested = false;
  private isRendering = false;
  private renderAgain = false;
  private activeModal: Modal | null = null;

  public onCtrlC?: () => void;
  public onReconstructSession?: () => void;

  constructor(terminal: Terminal) {
    super();
    this.terminal = terminal;
  }

  setFocus(component: Component | null): void {
    this.focusedComponent = component;
  }

  start(): void {
    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.requestRender(),
    );
    this.terminal.onResume(() => this.requestRender());
    this.terminal.hideCursor();
    this.requestRender();
  }

  stop(): void {
    this.terminal.showCursor();
    this.terminal.stop();
  }

  requestRender(): void {
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

  private inBracketedPaste = false;

  private handleInput(data: string): void {
    if (data.includes("\x1b[200~")) {
      this.inBracketedPaste = true;
    }
    if (data.includes("\x1b[201~")) {
      this.inBracketedPaste = false;
    }

    // Handle Ctrl+Z - background the process (POSIX only)
    if (
      isCtrlZ(data) &&
      !this.inBracketedPaste &&
      process.platform !== "win32"
    ) {
      this.terminal.background();
      return;
    }

    // Handle Ctrl+C globally - exit the application
    if (isCtrlC(data)) {
      console.info("\nCtrl+C pressed - exiting...");
      if (this.onCtrlC) {
        this.onCtrlC();
      } else {
        this.stop();
        process.exit(0);
      }
    }

    // Handle Escape key to close modal if one is active
    if (isEscape(data) && this.activeModal) {
      this.hideModal();
      return;
    }

    // Pass input to active modal first, then focused component
    if (this.activeModal?.handleInput) {
      this.activeModal.handleInput(data);
      this.requestRender();
    } else if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
    }
  }

  private doRender(): void {
    if (this.isRendering) {
      this.renderAgain = true;
      return;
    }
    this.isRendering = true;
    try {
      const width = this.terminal.columns;

      // Render all components to get new lines
      const newLines = this.render(width);

      // Build output buffer using array join (more efficient than string concat)
      const bufferParts: string[] = [
        "\x1b[?2026h", // Begin synchronized output
        "\x1b[3J\x1b[2J\x1b[H", // Clear scrollback, screen, and home
        newLines.join("\r\n"),
      ];

      // Render modal on top if active
      if (this.activeModal) {
        const modalLines = this.activeModal.render(width);

        // Render backdrop first if modal has backdrop
        if (this.activeModal.backdrop) {
          const backdropLine = style.bgRgb(0, 0, 0)(" ".repeat(width));
          const { rows } = getTerminalSize();
          for (let i = 0; i < rows; i++) {
            bufferParts.push(`\x1b[${i + 1};1H`, backdropLine);
          }
        }

        // Render modal content
        for (let i = 0; i < modalLines.length; i++) {
          if (modalLines[i]) {
            bufferParts.push(`\x1b[${i + 1};1H`, modalLines[i]);
          }
        }
      }

      bufferParts.push("\x1b[?2026l"); // End synchronized output
      this.terminal.write(bufferParts.join(""));
    } finally {
      this.isRendering = false;
      if (this.renderAgain) {
        this.renderAgain = false;
        this.requestRender();
      }
    }
  }

  // private positionCursor(
  //   componentCursorPos: [number, number] | null,
  // ): void {
  //   if (!componentCursorPos) {
  //     // No cursor position from component, hide cursor
  //     this.terminal.hideCursor();
  //     return;
  //   }

  //   const [cursorRow, cursorCol] = componentCursorPos;
  //
  //   // Calculate absolute cursor position in the terminal
  //   // We need to find which line in newLines corresponds to the component's cursor row
  //   // and then position the cursor at that line and column
  //
  //   // Find the line offset for the focused component
  //   let componentStartLine = 0;
  //   if (this.focusedComponent) {
  //     // Find the line where this component starts by summing heights of previous components
  //     for (const child of this.children) {
  //       if (child === this.focusedComponent) {
  //         break;
  //       }
  //       // Use the already-rendered lines to calculate height, not re-render
  //       const childLines = child.render(this.terminal.columns);
  //       componentStartLine += childLines.length;
  //     }
  //   }
  //
  //   const absoluteRow = componentStartLine + cursorRow;
  //   const absoluteCol = cursorCol;
  //
  //   // Position cursor using absolute positioning
  //   // Move to home position first, then move down to row, then right to column
  //   // Note: terminal rows/columns are 1-indexed, so we add 1
  //   this.terminal.write(`\x1b[H\x1b[${absoluteRow + 1}B\x1b[${absoluteCol + 1}G`);
  //   this.terminal.showCursor();
  // }

  /**
   * Show a modal dialog
   */
  showModal(modal: Modal): void {
    this.activeModal = modal;
    this.requestRender();
  }

  /**
   * Hide the active modal
   */
  hideModal(): void {
    this.activeModal = null;
    this.requestRender();
  }

  /**
   * Check if a modal is currently active
   */
  isModalActive(): boolean {
    return this.activeModal !== null;
  }
}
