import assert from "node:assert";
import { describe, it } from "node:test";
import { Editor } from "../../../source/tui/components/editor.ts";

describe("Editor History", () => {
  describe("addToHistory", () => {
    it("should add non-empty trimmed text to history", () => {
      const editor = new Editor();
      editor.addToHistory("  hello world  ");
      assert.equal(editor.getHistory().length, 1);
      assert.equal(editor.getHistory()[0], "hello world");
    });

    it("should reject empty text", () => {
      const editor = new Editor();
      editor.addToHistory("");
      assert.equal(editor.getHistory().length, 0);
    });

    it("should reject whitespace-only text", () => {
      const editor = new Editor();
      editor.addToHistory("   \t\n  ");
      assert.equal(editor.getHistory().length, 0);
    });

    it("should not add consecutive duplicates", () => {
      const editor = new Editor();
      editor.addToHistory("hello");
      editor.addToHistory("hello");
      assert.equal(editor.getHistory().length, 1);
    });

    it("should add different text after duplicate", () => {
      const editor = new Editor();
      editor.addToHistory("hello");
      editor.addToHistory("world");
      assert.equal(editor.getHistory().length, 2);
      assert.equal(editor.getHistory()[0], "world");
      assert.equal(editor.getHistory()[1], "hello");
    });

    it("should maintain FIFO order with limit", () => {
      const editor = new Editor();
      // Add 101 entries
      for (let i = 0; i < 101; i++) {
        editor.addToHistory(`prompt ${i}`);
      }
      assert.equal(editor.getHistory().length, 100);
      assert.equal(editor.getHistory()[0], "prompt 100");
      assert.equal(editor.getHistory()[99], "prompt 1");
    });
  });

  describe("navigateHistory", () => {
    it("should not navigate when history is empty", () => {
      const editor = new Editor();
      editor.handleInput("\x1b[A"); // Up arrow
      assert.equal(editor.getText(), "");
    });

    it("should navigate to most recent entry when editor is empty", () => {
      const editor = new Editor();
      editor.addToHistory("first prompt");
      editor.addToHistory("second prompt");
      editor.handleInput("\x1b[A"); // Up arrow
      assert.equal(editor.getText(), "second prompt");
    });

    it("should navigate to older entries", () => {
      const editor = new Editor();
      editor.addToHistory("first");
      editor.addToHistory("second");
      editor.addToHistory("third");
      editor.handleInput("\x1b[A"); // ↑ - third
      editor.handleInput("\x1b[A"); // ↑ - second
      assert.equal(editor.getText(), "second");
    });

    it("should navigate back to newer entries", () => {
      const editor = new Editor();
      editor.addToHistory("first");
      editor.addToHistory("second");
      editor.addToHistory("third");
      editor.handleInput("\x1b[A"); // ↑ - third
      editor.handleInput("\x1b[A"); // ↑ - second
      editor.handleInput("\x1b[B"); // ↓ - third
      assert.equal(editor.getText(), "third");
    });

    it("should clear editor when navigating past newest entry", () => {
      const editor = new Editor();
      editor.addToHistory("first");
      editor.handleInput("\x1b[A"); // ↑ - first
      editor.handleInput("\x1b[B"); // ↓ - clear
      assert.equal(editor.getText(), "");
    });

    it("should reset historyIndex when typing", () => {
      const editor = new Editor();
      editor.addToHistory("saved prompt");
      editor.handleInput("\x1b[A"); // ↑ - shows saved prompt
      assert.equal(editor.getText(), "saved prompt");
      editor.handleInput("x"); // Type character
      // After typing, historyIndex should reset, and text should have "x" appended
      assert.ok(editor.getText().includes("saved prompt"));
      // Navigate up again - should show "saved prompt" since we're in a new edit session
      editor.handleInput("\x1b[A");
      assert.equal(editor.getText(), "saved prompt");
    });
  });

  describe("submit and history", () => {
    it("should add submitted text to history", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      // Type and submit
      editor.handleInput("H");
      editor.handleInput("i");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      assert.equal(submittedText, "Hi");
      assert.equal(editor.getHistory().length, 1);
      assert.equal(editor.getHistory()[0], "Hi");
    });

    it("should not add empty submission to history", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      editor.handleInput(" ");
      editor.handleInput(" ");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      assert.equal(submittedText, "");
      assert.equal(editor.getHistory().length, 0);
    });

    it("should add multi-line text to history", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      // Type multi-line text
      editor.handleInput("line 1");
      editor.handleInput("\r"); // Enter creates new line
      editor.handleInput("line 2");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter to submit

      assert.equal(submittedText, "line 1\nline 2");
      assert.equal(editor.getHistory().length, 1);
      assert.equal(editor.getHistory()[0], "line 1\nline 2");
    });

    it("should navigate submitted multi-line history", () => {
      const editor = new Editor();
      editor.onSubmit = () => {}; // Ignore submissions

      // Submit a multi-line prompt
      editor.handleInput("first");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter
      editor.handleInput("second");
      editor.handleInput("\x1b[13;5~"); // Ctrl+Enter

      // Navigate to history
      editor.handleInput("\x1b[A"); // Up - should show "second"
      assert.equal(editor.getText(), "second");

      editor.handleInput("\x1b[A"); // Up - should show "first"
      assert.equal(editor.getText(), "first");
    });

    it("should handle same text submitted twice with edit in between", () => {
      const editor = new Editor();
      editor.onSubmit = () => {};

      // Submit "hello"
      editor.handleInput("hello");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      // Submit "world"
      editor.handleInput("world");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      // Submit "hello" again - should be added since it wasn't consecutive
      editor.handleInput("hello");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      assert.equal(editor.getHistory().length, 3);
      assert.equal(editor.getHistory()[0], "hello");
      assert.equal(editor.getHistory()[1], "world");
      assert.equal(editor.getHistory()[2], "hello");
    });
  });
});
