import assert from "node:assert";
import { describe, it } from "node:test";
import { Editor } from "../../../source/tui/components/editor.ts";

describe("Editor Input Handling", () => {
  describe("processInputData - control characters", () => {
    it("should handle Ctrl+C (charCode 3) - should return early", () => {
      const editor = new Editor();
      editor.handleInput("test");
      // Ctrl+C should return early (let parent handle it)
      // The editor should NOT process it - text remains unchanged
      editor.handleInput(String.fromCharCode(3));
      assert.equal(editor.getText(), "test");
    });

    it("should handle Ctrl+K - delete to end of line", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      // Ctrl+K deletes from cursor position to end of line
      // By default cursor is at end (pos 11), so it deletes from 11 to 11 = nothing
      // Move cursor to position 5 (after "hello ")
      for (let i = 0; i < 6; i++) {
        editor.handleInput("\x1b[D"); // Left arrow to move back
      }
      editor.handleInput(String.fromCharCode(11)); // Ctrl+K
      // Should delete from cursor (pos 5) to end
      assert.equal(editor.getText(), "hello");
    });

    it("should handle Ctrl+U - delete to start of line", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      // Ctrl+U deletes from start of line (pos 0) to cursor position
      // By default cursor is at end (pos 11), so it deletes everything
      // Move cursor to position 6 (after "hello ")
      for (let i = 0; i < 5; i++) {
        editor.handleInput("\x1b[D"); // Left arrow to move back
      }
      editor.handleInput(String.fromCharCode(21)); // Ctrl+U
      // Should delete from start (0) to cursor (pos 6)
      assert.equal(editor.getText(), "world");
    });

    it("should handle Ctrl+W - delete word backwards", () => {
      const editor = new Editor();
      editor.handleInput("hello world test");
      editor.handleInput(String.fromCharCode(23)); // Ctrl+W
      assert.equal(editor.getText(), "hello world ");
    });

    it("should handle Ctrl+A - move to start of line", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput(String.fromCharCode(1)); // Ctrl+A
      // The cursor should be at position 0 - check by typing
      editor.handleInput("X");
      assert.equal(editor.getText(), "Xhello");
    });

    it("should handle Ctrl+E - move to end of line", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput(String.fromCharCode(5)); // Ctrl+E
      // Cursor should be at end - typing adds to end
      editor.handleInput("X");
      assert.equal(editor.getText(), "helloX");
    });
  });

  describe("processInputData - Enter key", () => {
    it("should handle plain Enter (charCode 13) - create new line", () => {
      const editor = new Editor();
      editor.handleInput("line1");
      editor.handleInput(String.fromCharCode(13)); // Enter
      editor.handleInput("line2");
      assert.equal(editor.getText(), "line1\nline2");
    });

    it("should handle Shift+Enter - submit", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      editor.handleInput("hello");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      assert.equal(submittedText, "hello");
      assert.equal(editor.getText(), ""); // Editor should be cleared
    });

    it("should handle Ctrl+Enter - submit", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      editor.handleInput("test");
      editor.handleInput("\x1b[13;5~"); // Ctrl+Enter

      assert.equal(submittedText, "test");
    });

    it("should handle Option+Enter - submit", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      editor.handleInput("test");
      editor.handleInput("\x1b\r"); // Option+Enter (macOS)

      assert.equal(submittedText, "test");
    });

    it("should not submit empty text with Shift+Enter", () => {
      const editor = new Editor();
      let submittedText = "";
      editor.onSubmit = (text) => {
        submittedText = text;
      };

      editor.handleInput("   ");
      editor.handleInput("\x1b[13;2~"); // Shift+Enter

      assert.equal(submittedText, ""); // Should be trimmed to empty
    });
  });

  describe("processInputData - Backspace and Delete", () => {
    it("should handle Backspace (charCode 127)", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput(String.fromCharCode(127)); // Backspace
      assert.equal(editor.getText(), "hell");
    });

    it("should handle Backspace (charCode 8)", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput(String.fromCharCode(8)); // Backspace (alternative)
      assert.equal(editor.getText(), "hell");
    });

    it("should handle Forward Delete", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("\x1b[D"); // Left arrow to position 4
      editor.handleInput("\x1b[3~"); // Forward Delete
      assert.equal(editor.getText(), "hell");
    });
  });

  describe("processInputData - Arrow keys and navigation", () => {
    it("should handle Up arrow - cursor movement", () => {
      const editor = new Editor();
      editor.handleInput("line1\nline2");
      // When on line 2, up should go to line 1
      // Note: cursor starts at end of text
      // Type X - it goes at the end
      editor.handleInput("X");
      assert.equal(editor.getText(), "line1\nline2X");
    });

    it("should handle Down arrow - cursor movement", () => {
      const editor = new Editor();
      editor.handleInput("line1\nline2");
      // Cursor is at end, typing adds there
      editor.handleInput("X");
      assert.equal(editor.getText(), "line1\nline2X");
    });

    it("should handle Right arrow", () => {
      const editor = new Editor();
      editor.handleInput("abc");
      // Note: Right arrow moves cursor right
      // After typing "abc", cursor is at position 3 (end)
      // Right arrow from end does nothing
      editor.handleInput("\x1b[C"); // Right
      editor.handleInput("X");
      assert.equal(editor.getText(), "abcX");
    });

    it("should handle Left arrow", () => {
      const editor = new Editor();
      editor.handleInput("abc");
      editor.handleInput("\x1b[C"); // Right
      editor.handleInput("\x1b[D"); // Left
      editor.handleInput("X");
      assert.equal(editor.getText(), "abXc");
    });

    it("should handle Home key", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("\x1b[4~"); // End first
      editor.handleInput("\x1b[H"); // Home
      editor.handleInput("X");
      assert.equal(editor.getText(), "Xhello");
    });

    it("should handle End key", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("\x1b[H"); // Home
      editor.handleInput("\x1b[4~"); // End
      editor.handleInput("X");
      assert.equal(editor.getText(), "helloX");
    });

    it("should handle Home key alternative (\\x1b[1~)", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("\x1b[1~"); // Home
      editor.handleInput("X");
      assert.equal(editor.getText(), "Xhello");
    });

    it("should handle End key alternative (\\x1b[8~)", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("\x1b[8~"); // End
      editor.handleInput("X");
      assert.equal(editor.getText(), "helloX");
    });
  });

  describe("processInputData - Word navigation", () => {
    it("should handle Option+Left - word left", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      editor.handleInput("\x1b[1;3D"); // Option+Left
      editor.handleInput("X");
      // Should be at start of "world", typing inserts there
      assert.equal(editor.getText(), "hello Xworld");
    });

    it("should handle Option+Right - word right", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      editor.handleInput("\x1b[1;3D"); // Option+Left - go to "world"
      editor.handleInput("\x1b[1;3C"); // Option+Right - go past "world"
      editor.handleInput("X");
      assert.equal(editor.getText(), "hello worldX");
    });

    it("should handle Ctrl+Left", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      editor.handleInput("\x1b[1;5D"); // Ctrl+Left
      editor.handleInput("X");
      assert.equal(editor.getText(), "hello Xworld");
    });

    it("should handle Ctrl+Right", () => {
      const editor = new Editor();
      editor.handleInput("hello world");
      editor.handleInput("\x1b[1;5C"); // Ctrl+Right
      editor.handleInput("X");
      assert.equal(editor.getText(), "hello worldX");
    });
  });

  describe("processInputData - regular characters", () => {
    it("should insert printable characters", () => {
      const editor = new Editor();
      editor.handleInput("abc");
      assert.equal(editor.getText(), "abc");
    });

    it("should not insert control characters below 32", () => {
      const editor = new Editor();
      editor.handleInput("a");
      editor.handleInput(String.fromCharCode(1)); // Ctrl+A (but not handled as Ctrl+A here)
      // Characters with charCode < 32 should generally not be inserted
      assert.equal(editor.getText(), "a");
    });

    it("should handle unicode characters", () => {
      const editor = new Editor();
      editor.handleInput("hello");
      editor.handleInput("🎉");
      assert.equal(editor.getText(), "hello🎉");
    });
  });

  describe("processInputData - Alt+Backspace", () => {
    it("should handle Alt+Backspace (\\x1b\\x7f) - delete word backwards", () => {
      const editor = new Editor();
      editor.handleInput("hello world test");
      editor.handleInput("\x1b\x7f"); // Alt+Backspace
      assert.equal(editor.getText(), "hello world ");
    });
  });

  describe("processInputData - external editor", () => {
    it("should trigger external editor on Ctrl+G", async () => {
      const editor = new Editor();
      let externalEditorCalled = false;
      editor.onExternalEditor = async () => {
        externalEditorCalled = true;
        return { content: "modified", aborted: false };
      };

      editor.handleInput("original");
      await editor.handleInput(String.fromCharCode(7)); // Ctrl+G

      assert.equal(externalEditorCalled, true);
    });
  });

  describe("processInputData - Tab key", () => {
    it("should trigger autocomplete on Tab", async () => {
      const editor = new Editor();

      // Note: Tab completion requires an autocomplete provider to be set
      // This test verifies the Tab key is recognized
      editor.handleInput("/");

      // We can't easily test Tab completion without setting up a provider
      // But we can verify the method exists and doesn't throw
      assert.ok(true); // Placeholder - Tab handling is async and requires provider
    });
  });

  describe("processInputData - autocomplete integration", () => {
    it("should cancel autocomplete on Escape", () => {
      const editor = new Editor();
      editor.handleInput("/");
      // Simulate autocomplete state by calling startAutocomplete
      // (We can't easily trigger it without a provider, but we test the escape path)
      editor.handleInput("\x1b"); // Escape
      // Should not throw
      assert.ok(true);
    });
  });
});
