import assert from "node:assert";
import { describe, it } from "node:test";
import { Input } from "../../../source/tui/components/input.ts";

describe("Input Component", () => {
  describe("handleInput - basic character input", () => {
    it("should add a character to the value", () => {
      const input = new Input();
      input.handleInput("h");
      assert.equal(input.getValue(), "h");
    });

    it("should add multiple characters", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      assert.equal(input.getValue(), "hello");
    });

    it("should ignore non-printable characters", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      input.handleInput("\x00"); // Null character
      assert.equal(input.getValue(), "hello");
    });
  });

  describe("handleInput - Enter key", () => {
    it("should call onSubmit when Enter is pressed", () => {
      const input = new Input();
      let submitted = "";
      input.onSubmit = (value: string) => {
        submitted = value;
      };
      for (const ch of "test value") {
        input.handleInput(ch);
      }
      input.handleInput("\r"); // Enter
      assert.equal(submitted, "test value");
    });

    it("should not throw when Enter is pressed without onSubmit", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      input.handleInput("\r"); // Enter
      assert.equal(input.getValue(), "hello");
    });
  });

  describe("handleInput - Backspace", () => {
    it("should delete the last character", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      input.handleInput("\x7f"); // Backspace
      assert.equal(input.getValue(), "hell");
    });

    it("should delete character before cursor", () => {
      const input = new Input();
      for (const ch of "abcd") {
        input.handleInput(ch);
      }
      // Move cursor left twice (to position 2: "ab|cd")
      for (let i = 0; i < 2; i++) {
        input.handleInput("\x1b[D"); // Left arrow
      }
      // Cursor is at position 2, backspace deletes char at index 1 ('b')
      input.handleInput("\x7f"); // Backspace
      assert.equal(input.getValue(), "acd");
    });

    it("should do nothing when cursor at start", () => {
      const input = new Input();
      for (const ch of "hi") {
        input.handleInput(ch);
      }
      input.handleInput("\x01"); // Ctrl+A (move cursor to start)
      input.handleInput("\x7f"); // Backspace
      assert.equal(input.getValue(), "hi");
    });

    it("should do nothing on empty input", () => {
      const input = new Input();
      input.handleInput("\x7f"); // Backspace
      assert.equal(input.getValue(), "");
    });
  });

  describe("handleInput - Arrow keys", () => {
    it("should move cursor right with Right arrow", () => {
      const input = new Input();
      for (const ch of "ab") {
        input.handleInput(ch);
      }
      // Cursor at position 2 (end)
      input.handleInput("\x1b[C"); // Right arrow - should stay at end
      input.handleInput("X");
      assert.equal(input.getValue(), "abX");
    });

    it("should move cursor left with Left arrow", () => {
      const input = new Input();
      for (const ch of "ab") {
        input.handleInput(ch);
      }
      input.handleInput("\x1b[D"); // Left arrow
      input.handleInput("X");
      assert.equal(input.getValue(), "aXb");
    });

    it("should not move cursor left past start", () => {
      const input = new Input();
      input.handleInput("a");
      input.handleInput("\x1b[D"); // Left arrow (to position 0)
      input.handleInput("\x1b[D"); // Left arrow (should stay at 0)
      input.handleInput("X");
      assert.equal(input.getValue(), "Xa");
    });

    it("should not move cursor right past end", () => {
      const input = new Input();
      input.handleInput("a");
      input.handleInput("\x1b[C"); // Right arrow (should stay at end)
      input.handleInput("X");
      assert.equal(input.getValue(), "aX");
    });
  });

  describe("handleInput - Delete key", () => {
    it("should delete character at cursor", () => {
      const input = new Input();
      for (const ch of "abcd") {
        input.handleInput(ch);
      }
      // Move cursor left twice (to position 2: "ab|cd")
      for (let i = 0; i < 2; i++) {
        input.handleInput("\x1b[D");
      }
      input.handleInput("\x1b[3~"); // Delete key
      assert.equal(input.getValue(), "abd");
    });

    it("should do nothing when cursor at end", () => {
      const input = new Input();
      for (const ch of "abc") {
        input.handleInput(ch);
      }
      input.handleInput("\x1b[3~"); // Delete key at end - nothing to delete
      assert.equal(input.getValue(), "abc");
    });
  });

  describe("handleInput - Ctrl+A / Ctrl+E", () => {
    it("should move cursor to start with Ctrl+A", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      input.handleInput("\x01"); // Ctrl+A
      input.handleInput("X");
      assert.equal(input.getValue(), "Xhello");
    });

    it("should move cursor to end with Ctrl+E", () => {
      const input = new Input();
      for (const ch of "hello") {
        input.handleInput(ch);
      }
      input.handleInput("\x01"); // Ctrl+A (to start)
      input.handleInput("\x05"); // Ctrl+E (to end)
      input.handleInput("X");
      assert.equal(input.getValue(), "helloX");
    });
  });

  describe("handleInput - complex scenarios", () => {
    it("should insert characters at cursor position", () => {
      const input = new Input();
      for (const ch of "helo") {
        input.handleInput(ch);
      }
      // Move cursor left twice (to position 2: "he|lo")
      for (let i = 0; i < 2; i++) {
        input.handleInput("\x1b[D");
      }
      input.handleInput("l");
      assert.equal(input.getValue(), "hello");
    });

    it("should handle backspace after insert", () => {
      const input = new Input();
      for (const ch of "helo") {
        input.handleInput(ch);
      }
      // Move cursor left twice (to position 2: "he|lo")
      for (let i = 0; i < 2; i++) {
        input.handleInput("\x1b[D");
      }
      input.handleInput("l");
      assert.equal(input.getValue(), "hello");
      input.handleInput("\x7f"); // Backspace after 'l'
      assert.equal(input.getValue(), "helo");
    });
  });
});
