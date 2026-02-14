/**
 * Minimal TUI implementation with differential rendering
 */

import {
  getTerminalSize,
  isCtrlC,
  isCtrlD,
  isCtrlM,
  isCtrlN,
  isCtrlO,
  isCtrlR,
  isCtrlZ,
  isEscape,
} from "../terminal/control.ts";
import { isShiftTab } from "../terminal/keys.ts";
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

  /**
   * Optional method to indicate the component wants to handle Tab/Shift+Tab
   * navigation keys itself, preventing the TUI from intercepting them.
   */
  wantsNavigationKeys?(): boolean;
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
 *
 * The TUI splits its children into two regions:
 * - Scrollable content: children added before setFixedFooterStart()
 * - Fixed footer: children added after setFixedFooterStart()
 *
 * The scrollable content region supports virtual scrolling via trackpad/mouse
 * wheel. The fixed footer (editor, footer bar, notifications) is always
 * pinned to the bottom of the terminal.
 */

// biome-ignore lint/style/useNamingConvention: override
export class TUI extends Container {
  private terminal: Terminal;
  private focusedComponent: Component | null = null;
  private renderRequested = false;
  private isRendering = false;
  private renderAgain = false;
  private activeModal: Modal | null = null;
  private scrollOffset = 0;
  private lastScrollableHeight = 0;
  private fixedFooterIndex = -1;
  private isUserScrolledUp = false;

  public onCtrlC?: () => void;
  public onCtrlD?: () => void;
  public onReconstructSession?: () => void;
  public onCtrlN?: () => void;
  public onCtrlO?: () => void;
  /** Callback invoked when Ctrl+M is pressed - opens model selector. */
  public onCtrlM?: () => void;
  public onCtrlR?: () => void;
  public onShiftTab?: () => void;

  constructor(terminal: Terminal) {
    super();
    this.terminal = terminal;
  }

  /**
   * Mark the boundary between scrollable content and fixed footer.
   * All children added after this call will be rendered as fixed
   * footer content pinned to the bottom of the terminal.
   */
  setFixedFooterStart(): void {
    this.fixedFooterIndex = this.children.length;
  }

  setFocus(component: Component | null): void {
    this.focusedComponent = component;
  }

  /**
   * Get the underlying terminal instance for external mode operations.
   * Used primarily for spawning external editors.
   */
  getTerminal(): Terminal {
    return this.terminal;
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

  private focusedComponentWantsNavigation(): boolean {
    return this.focusedComponent?.wantsNavigationKeys?.() ?? false;
  }

  private handleInput(data: string): void {
    // Handle mouse tracking events (SGR format: \x1b[<button;x;yM)
    if (data.startsWith("\x1b[<")) {
      this.handleMouseEvent(data);
      return;
    }

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

    // Handle Ctrl+D - exit only if editor is empty (handled by Repl)
    if (isCtrlD(data)) {
      if (this.onCtrlD) {
        this.onCtrlD();
      }
      return;
    }

    // Handle Ctrl+O - toggle verbose mode
    if (isCtrlO(data)) {
      if (this.onCtrlO) {
        this.onCtrlO();
      }
      return;
    }

    // Handle Ctrl+R - review
    if (isCtrlR(data)) {
      if (this.onCtrlR) {
        this.onCtrlR();
      }
      return;
    }

    // Handle Ctrl+N - new chat
    if (isCtrlN(data)) {
      if (this.onCtrlN) {
        this.onCtrlN();
      }
      return;
    }

    // Handle Ctrl+M - model selector
    if (isCtrlM(data)) {
      if (this.onCtrlM) {
        this.onCtrlM();
      }
      return;
    }

    // Handle Shift+Tab - cycle mode only when no modal is active,
    // the focused component won't handle navigation (e.g., model selector),
    // and the editor isn't showing autocomplete
    if (isShiftTab(data) && !this.inBracketedPaste) {
      if (!this.activeModal && !this.focusedComponentWantsNavigation()) {
        if (this.onShiftTab) {
          this.onShiftTab();
        }
        return;
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
      this.scrollToBottom();
      this.requestRender();
    }
  }

  private handleMouseEvent(data: string): void {
    // SGR mouse format: \x1b[<button;x;yM (press) or \x1b[<button;x;ym (release)
    // Extract button code between "<" and first ";"
    const start = data.indexOf("<");
    const semi = data.indexOf(";", start);
    if (start === -1 || semi === -1) return;

    const button = Number.parseInt(data.slice(start + 1, semi), 10);
    const scrollLines = 3;
    const { rows } = getTerminalSize();
    const fixedHeight = this.getFixedFooterHeight(this.terminal.columns);
    const scrollableViewport = rows - fixedHeight;

    // Button 64 = scroll up, button 65 = scroll down
    if (button === 64) {
      this.scrollOffset = Math.max(0, this.scrollOffset - scrollLines);
      const maxOffset = Math.max(
        0,
        this.lastScrollableHeight - scrollableViewport,
      );
      this.isUserScrolledUp = this.scrollOffset < maxOffset;
      this.requestRender();
    } else if (button === 65) {
      const maxOffset = Math.max(
        0,
        this.lastScrollableHeight - scrollableViewport,
      );
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + scrollLines);
      this.isUserScrolledUp = this.scrollOffset < maxOffset;
      this.requestRender();
    }
  }

  scrollToBottom(): void {
    const { rows } = getTerminalSize();
    const fixedHeight = this.getFixedFooterHeight(this.terminal.columns);
    const scrollableViewport = rows - fixedHeight;
    this.scrollOffset = Math.max(
      0,
      this.lastScrollableHeight - scrollableViewport,
    );
    this.isUserScrolledUp = false;
  }

  private getFixedFooterHeight(width: number): number {
    if (this.fixedFooterIndex < 0) return 0;
    let height = 0;
    for (let i = this.fixedFooterIndex; i < this.children.length; i++) {
      height += this.children[i].render(width).length;
    }
    return height;
  }

  private renderScrollableContent(width: number): string[] {
    const end =
      this.fixedFooterIndex >= 0 ? this.fixedFooterIndex : this.children.length;
    const lines: string[] = [];
    for (let i = 0; i < end; i++) {
      lines.push(...this.children[i].render(width));
    }
    return lines;
  }

  private renderFixedFooter(width: number): string[] {
    if (this.fixedFooterIndex < 0) return [];
    const lines: string[] = [];
    for (let i = this.fixedFooterIndex; i < this.children.length; i++) {
      lines.push(...this.children[i].render(width));
    }
    return lines;
  }

  private doRender(): void {
    if (this.isRendering) {
      this.renderAgain = true;
      return;
    }
    this.isRendering = true;
    try {
      const width = this.terminal.columns;
      const { rows } = getTerminalSize();

      // Render fixed footer and scrollable content separately
      const fixedLines = this.renderFixedFooter(width);
      const scrollableLines = this.renderScrollableContent(width);
      this.lastScrollableHeight = scrollableLines.length;

      const fixedHeight = fixedLines.length;
      const scrollableViewport = rows - fixedHeight;

      // Auto-scroll to bottom when new content arrives,
      // unless the user has explicitly scrolled up
      if (!this.isUserScrolledUp) {
        this.scrollOffset = Math.max(
          0,
          scrollableLines.length - scrollableViewport,
        );
      }

      // Clamp scroll offset
      const maxOffset = Math.max(
        0,
        scrollableLines.length - scrollableViewport,
      );
      if (this.scrollOffset > maxOffset) {
        this.scrollOffset = maxOffset;
      }

      // Apply scroll offset to get visible scrollable lines
      const visibleScrollable = scrollableLines.slice(
        this.scrollOffset,
        this.scrollOffset + scrollableViewport,
      );

      // Combine visible scrollable content with fixed footer
      const visibleLines = [...visibleScrollable, ...fixedLines];

      // Build output buffer using array join (more efficient than string concat)
      const bufferParts: string[] = [
        "\x1b[?2026h", // Begin synchronized output
        "\x1b[3J\x1b[2J\x1b[H", // Clear scrollback, screen, and home
        visibleLines.join("\r\n"),
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
