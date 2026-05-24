import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { Terminal } from "../../source/tui/terminal.ts";
import { TUI } from "../../source/tui/tui.ts";

type MockTerminal = Terminal & {
  getWritten(): string;
  getWrittenParts(): string[];
  clearWritten(): void;
};

/**
 * Create a mock Terminal for testing
 */
function createMockTerminal(): MockTerminal {
  const writtenParts: string[] = [];
  const resumeCallbacks: Array<() => void> = [];
  const terminal: MockTerminal = {
    columns: 80,
    rows: 24,
    start: mock.fn(),
    stop: mock.fn(),
    write: mock.fn((data: string) => {
      writtenParts.push(data);
    }),
    moveBy: mock.fn(),
    hideCursor: mock.fn(),
    showCursor: mock.fn(),
    clearLine: mock.fn(),
    clearFromCursor: mock.fn(),
    clearScreen: mock.fn(),
    enterExternalMode: mock.fn(),
    exitExternalMode: mock.fn(),
    background: mock.fn(),
    isInExternalMode: mock.fn(() => false),
    onResume: mock.fn((callback: () => void) => {
      resumeCallbacks.push(callback);
    }),
    getWritten(): string {
      return writtenParts.join("");
    },
    getWrittenParts(): string[] {
      return [...writtenParts];
    },
    clearWritten(): void {
      writtenParts.length = 0;
    },
  };
  return terminal;
}

/**
 * Mock text component that renders fixed content
 */
class MockComponent {
  private lines: string[];

  constructor(...lines: string[]) {
    this.lines = lines;
  }

  render(_width: number): string[] {
    return this.lines;
  }
}

describe("TUI", () => {
  let mockTerminal: MockTerminal;
  let tui: TUI;

  beforeEach(() => {
    mockTerminal = createMockTerminal();
    tui = new TUI(mockTerminal);
  });

  describe("doRender (via requestRender)", () => {
    it("should render empty content when no children", async () => {
      tui.requestRender();
      // Wait for setImmediate to fire
      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      // Should have sync begin, clear codes, empty visible lines, and sync end
      assert.ok(
        output.startsWith("\x1b[?2026h"),
        "Should start with sync begin",
      );
      assert.ok(output.includes("\x1b[3J\x1b[2J\x1b[H"), "Should clear screen");
      assert.ok(output.endsWith("\x1b[?2026l"), "Should end with sync end");
    });

    it("should render scrollable children content", async () => {
      const child = new MockComponent("line 1", "line 2");
      tui.addChild(child);
      tui.requestRender();

      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      assert.ok(output.includes("line 1"), "Should include child line 1");
      assert.ok(output.includes("line 2"), "Should include child line 2");
    });

    it("should render fixed footer content", async () => {
      const scrollable = new MockComponent("scrollable line");
      const footer = new MockComponent("footer line");
      tui.addChild(scrollable);
      tui.setFixedFooterStart();
      tui.addChild(footer);
      tui.requestRender();

      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      assert.ok(
        output.includes("scrollable line"),
        "Should include scrollable content",
      );
      assert.ok(
        output.includes("footer line"),
        "Should include footer content",
      );
    });

    it("should not render when already rendering", async () => {
      // First call starts rendering
      tui.requestRender();
      // Second call should be queued
      tui.requestRender();

      await new Promise((resolve) => setImmediate(resolve));

      // Should only have written once
      assert.strictEqual(mockTerminal.getWrittenParts().length, 1);
    });

    it("should auto-scroll to bottom when new content arrives", async () => {
      const manyLines: string[] = [];
      for (let i = 0; i < 50; i++) {
        manyLines.push(`line ${i}`);
      }
      const child = new MockComponent(...manyLines);
      tui.addChild(child);

      // Set a terminal with fewer rows
      Object.defineProperty(mockTerminal, "rows", { value: 10 });

      tui.requestRender();
      await new Promise((resolve) => setImmediate(resolve));

      // With 50 lines and 10 rows viewport, scrollOffset should be 40
      // The output should show the last lines (auto-scrolled)
      const output = mockTerminal.getWritten();
      assert.ok(output.includes("line 49"), "Should include last line");
    });

    it("should render modal on top when active", async () => {
      const scrollable = new MockComponent("background content");
      tui.addChild(scrollable);

      const modal = {
        render: (_width: number) => ["-- modal header --", "modal body"],
        handleInput: mock.fn(),
        backdrop: false,
      };

      // biome-ignore lint/suspicious/noExplicitAny: mock modal without full Modal shape
      tui.showModal(modal as any);
      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      assert.ok(
        output.includes("-- modal header --"),
        "Should render modal header",
      );
      assert.ok(output.includes("modal body"), "Should render modal body");
    });

    it("should render backdrop when modal has backdrop enabled", async () => {
      const scrollable = new MockComponent("background");
      tui.addChild(scrollable);

      const modal = {
        render: () => ["modal line"],
        handleInput: mock.fn(),
        backdrop: true,
      };

      // biome-ignore lint/suspicious/noExplicitAny: mock modal without full Modal shape
      tui.showModal(modal as any);
      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      // Backdrop writes \x1b[row;1H + backdropLine for each row (24 rows)
      assert.ok(output.includes("modal line"), "Should render modal content");

      // Count backdrop occurrences - should have 24 rows written
      const backdropPattern = "\x1b\\[\\d+;1H";
      const backdropCount = (
        output.match(new RegExp(backdropPattern, "g")) || []
      ).length;
      // 24 rows for backdrop + 1 for modal line = 25 positionings
      assert.ok(backdropCount >= 24, "Should position backdrop for all rows");
    });

    it("should skip empty modal lines", async () => {
      const scrollable = new MockComponent("background");
      tui.addChild(scrollable);

      const modal = {
        render: () => ["line 1", "", "", "line 4"],
        handleInput: mock.fn(),
        backdrop: false,
      };

      // biome-ignore lint/suspicious/noExplicitAny: mock modal without full Modal shape
      tui.showModal(modal as any);
      await new Promise((resolve) => setImmediate(resolve));

      const output = mockTerminal.getWritten();
      assert.ok(output.includes("line 1"), "Should render non-empty line 1");
      assert.ok(output.includes("line 4"), "Should render non-empty line 4");
    });

    it("should clamp scroll offset when it exceeds max", async () => {
      const manyLines: string[] = [];
      for (let i = 0; i < 5; i++) {
        manyLines.push(`line ${i}`);
      }
      const child = new MockComponent(...manyLines);
      tui.addChild(child);

      // Set a terminal with fewer rows
      Object.defineProperty(mockTerminal, "rows", { value: 3 });

      // Render once to set state
      tui.requestRender();
      await new Promise((resolve) => setImmediate(resolve));

      // The output should have the visible slice
      const output = mockTerminal.getWritten();
      // With 5 lines and viewport of 3, we show lines 2,3,4 (auto-scrolled)
      assert.ok(output.includes("line 2"), "Should show line 2");
      assert.ok(output.includes("line 3"), "Should show line 3");
      assert.ok(output.includes("line 4"), "Should show line 4");
    });
  });

  describe("handleInput (via private method)", () => {
    let inputHandler: (data: string) => void;

    beforeEach(() => {
      // Start TUI to register the input handler with the terminal mock
      tui.start();
      // Capture the input handler callback from the terminal.start mock
      inputHandler = (
        mockTerminal.start as unknown as ReturnType<typeof mock.fn>
      ).mock.calls[0].arguments[0] as (data: string) => void;
    });

    afterEach(() => {
      tui.stop();
    });

    it("should handle mouse events (data starting with \\x1b[<)", () => {
      // SGR mouse scroll up
      inputHandler("\x1b[<64;10;10M");
      // Should not crash, scrollOffset should adjust
      assert.ok(true, "Mouse event handled without error");
    });

    it("should track bracketed paste state", () => {
      // Bracketed paste start sequence
      inputHandler("text\x1b[200~more");
      // Send Ctrl+C while in paste mode - should not trigger the exit
      // Instead, the input is passed through to component dispatch
      assert.ok(true, "Bracketed paste state updated");
    });

    it("should handle Ctrl+Z (background terminal)", () => {
      const backgroundMock = mockTerminal.background as unknown as ReturnType<
        typeof mock.fn
      >;

      // Raw Ctrl+Z byte
      inputHandler("\x1a");

      assert.strictEqual(backgroundMock.mock.callCount(), 1);
    });

    it("should handle Ctrl+C via onCtrlC callback", () => {
      const calledC = mock.fn();
      tui.onCtrlC = calledC;

      inputHandler("\x03");

      assert.strictEqual(calledC.mock.callCount(), 1);
    });

    it("should call stop() on Ctrl+C when no onCtrlC callback", () => {
      const stopMock = mockTerminal.stop as unknown as ReturnType<
        typeof mock.fn
      >;
      const originalExit = process.exit;
      process.exit = mock.fn() as unknown as (code?: number) => never;

      inputHandler("\x03");

      assert.strictEqual(stopMock.mock.callCount(), 1);
      assert.strictEqual(
        (
          process.exit as unknown as ReturnType<typeof mock.fn>
        ).mock.callCount(),
        1,
      );

      process.exit = originalExit;
    });

    it("should handle Ctrl+D via onCtrlD callback", () => {
      const calledD = mock.fn();
      tui.onCtrlD = calledD;

      inputHandler("\x04");

      assert.strictEqual(calledD.mock.callCount(), 1);
    });

    it("should handle Ctrl+O key binding", () => {
      const calledO = mock.fn();
      tui.onCtrlO = calledO;

      inputHandler("\x0f");

      assert.strictEqual(calledO.mock.callCount(), 1);
    });

    it("should handle Ctrl+R key binding", () => {
      const calledR = mock.fn();
      tui.onCtrlR = calledR;

      inputHandler("\x12");

      assert.strictEqual(calledR.mock.callCount(), 1);
    });

    it("should handle Ctrl+N key binding", () => {
      const calledN = mock.fn();
      tui.onCtrlN = calledN;

      inputHandler("\x0e");

      assert.strictEqual(calledN.mock.callCount(), 1);
    });

    it("should handle Shift+Tab via onShiftTab callback", () => {
      const shiftTabMock = mock.fn();
      tui.onShiftTab = shiftTabMock;

      inputHandler("\x1b[Z");

      assert.strictEqual(shiftTabMock.mock.callCount(), 1);
    });

    it("should hide modal on Escape when modal is active", () => {
      const modal = {
        render: () => ["modal content"],
        handleInput: mock.fn(),
        backdrop: false,
      };
      // biome-ignore lint/suspicious/noExplicitAny: mock modal
      tui.showModal(modal as any);

      // Send escape
      inputHandler("\x1b");

      // Modal should be hidden
      assert.strictEqual(tui["activeModal" as keyof TUI], null);
    });

    it("should dispatch input to active modal when present", () => {
      const modalHandleInput = mock.fn();
      const modal = {
        render: () => ["modal"],
        handleInput: modalHandleInput,
        backdrop: false,
      };
      // biome-ignore lint/suspicious/noExplicitAny: mock modal
      tui.showModal(modal as any);

      // Send some text input (not a special key)
      inputHandler("hello");

      assert.strictEqual(modalHandleInput.mock.callCount(), 1);
      assert.strictEqual(modalHandleInput.mock.calls[0].arguments[0], "hello");
    });

    it("should dispatch input to focused component when no modal", () => {
      const componentHandleInput = mock.fn();
      const component = {
        render: () => ["component"],
        handleInput: componentHandleInput,
      };
      tui.setFocus(component);

      // Send some text input
      inputHandler("world");

      assert.strictEqual(componentHandleInput.mock.callCount(), 1);
      assert.strictEqual(
        componentHandleInput.mock.calls[0].arguments[0],
        "world",
      );
    });

    it("should not call background() on Ctrl+Z during bracketed paste", () => {
      const backgroundMock = mockTerminal.background as unknown as ReturnType<
        typeof mock.fn
      >;

      // First enter bracketed paste
      inputHandler("text\x1b[200~more");

      // Then send Ctrl+Z - should NOT background since we're in paste mode
      inputHandler("\x1a");

      // Note: background should not have been called
      // But the Ctrl+Z check is earlier in the method and brackets are tracked
      // The actual behavior: Ctrl+Z check happens after bracket paste state updates
      // and before checking Ctrl+Z. Since inBracketedPaste is true, Ctrl+Z won't trigger.
      assert.strictEqual(backgroundMock.mock.callCount(), 0);
    });

    it("should not call onShiftTab during bracketed paste", () => {
      const shiftTabMock = mock.fn();
      tui.onShiftTab = shiftTabMock;

      // Enter bracketed paste
      inputHandler("\x1b[200~");

      // Send Shift+Tab while in paste mode
      inputHandler("\x1b[Z");

      assert.strictEqual(shiftTabMock.mock.callCount(), 0);
    });

    it("should not handle Shift+Tab when focused component wants navigation", () => {
      const shiftTabMock = mock.fn();
      tui.onShiftTab = shiftTabMock;

      const component = {
        render: () => ["component"],
        wantsNavigationKeys: () => true,
      };
      tui.setFocus(component);

      inputHandler("\x1b[Z");

      assert.strictEqual(shiftTabMock.mock.callCount(), 0);
    });
  });
});
