/**
 * Minimal TUI implementation with differential rendering
 */

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
    const lines: string[] = [];
    for (const child of this.children) {
      lines.push(...child.render(width));
    }
    return lines;
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
    this.terminal.hideCursor();
    this.requestRender();
  }

  stop(): void {
    this.terminal.showCursor();
    this.terminal.stop();
  }

  requestRender(): void {
    if (this.renderRequested) return;
    this.renderRequested = true;
    process.nextTick(() => {
      this.renderRequested = false;
      this.doRender();
    });
  }

  private handleInput(data: string): void {
    // Handle Ctrl+C globally - exit the application
    if (data.charCodeAt(0) === 3) {
      console.log("\nCtrl+C pressed - exiting...");
      this.stop();
      process.exit(0);
    }

    // Pass input to focused component
    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
    }
  }

  private doRender(): void {
    const width = this.terminal.columns;

    // Render all components to get new lines
    const newLines = this.render(width);

    // Always do full re-render for simplicity and reliability
    // This ensures that previous content is properly cleared
    let buffer = "\x1b[?2026h"; // Begin synchronized output
    buffer += "\x1b[3J\x1b[2J\x1b[H"; // Clear scrollback, screen, and home
    for (let i = 0; i < newLines.length; i++) {
      if (i > 0) buffer += "\r\n";
      buffer += newLines[i];
    }
    buffer += "\x1b[?2026l"; // End synchronized output
    this.terminal.write(buffer);
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
}
