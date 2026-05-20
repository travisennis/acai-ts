import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Modal, ModalText } from "../../source/tui/components/modal.ts";
import { Container } from "../../source/tui/index.ts";

describe("Modal Components", () => {
  describe("Modal", () => {
    it("should create a modal with title and content", () => {
      const content = new ModalText("Test content");
      const modal = new Modal("Test Modal", content, true);

      assert.strictEqual(modal instanceof Container, true);
    });

    it("should handle escape key to close", () => {
      let closed = false;
      const content = new ModalText("Test content");
      const modal = new Modal("Test Modal", content, true, () => {
        closed = true;
      });

      modal.handleInput("\x1b");
      assert.strictEqual(closed, true);
    });

    it("should render modal with backdrop", () => {
      const content = new ModalText("Test content");
      const modal = new Modal("Test Modal", content, true);
      const result = modal.render(80);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length > 0, true);
    });

    it("should render modal without backdrop", () => {
      const content = new ModalText("Test content");
      const modal = new Modal("Test Modal", content, false);
      const result = modal.render(80);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length > 0, true);
    });
  });

  describe("ModalText", () => {
    it("should create modal text component", () => {
      const modalText = new ModalText("Test content");

      assert.strictEqual(modalText instanceof Container, true);
    });

    it("should render text with word wrapping", () => {
      const longText =
        "This is a very long text that should wrap to multiple lines when rendered in a modal with limited width";
      const modalText = new ModalText(longText);
      const result = modalText.render(40);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length > 1, true);
    });

    it("should handle empty text", () => {
      const modalText = new ModalText("");
      const result = modalText.render(40);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length, 0);
    });

    it("should render single short line without wrapping", () => {
      const modalText = new ModalText("Hello");
      const result = modalText.render(20);

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("Hello"));
    });

    it("should wrap text that exceeds content width", () => {
      // contentWidth = 12 - 2 = 10 with default paddingX=1
      const modalText = new ModalText("a b c d e f g h i j k l");
      const result = modalText.render(12);

      assert.ok(result.length >= 2);
    });

    it("should truncate words longer than content width", () => {
      // contentWidth = 8 - 2 = 6 with default paddingX=1
      const modalText = new ModalText("abcdefghij");
      const result = modalText.render(8);

      // The long word should be truncated to 6 chars
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("abcdef"));
    });

    it("should handle multiple newline-separated lines", () => {
      const modalText = new ModalText("line1\nline2\nline3");
      const result = modalText.render(80);

      // Each line fits, so we get 3 lines (plus horizontal padding: leftPad=" ")
      assert.ok(result.length >= 3);
      assert.ok(result[0].includes("line1"));
      assert.ok(result[1].includes("line2"));
      assert.ok(result[2].includes("line3"));
    });

    it("should handle whitespace-only text", () => {
      const modalText = new ModalText("   \n  \n  ");
      const result = modalText.render(40);

      assert.strictEqual(result.length, 0);
    });

    it("should handle text with tabs", () => {
      const modalText = new ModalText("a\tb");
      const result = modalText.render(80);

      assert.ok(result.length >= 1);
      assert.ok(result[0].includes("a   b"));
    });

    it("should handle mixed short and long words", () => {
      // contentWidth = 12 - 2 = 10
      // "short longworddddd a b" - longworddddd (12 chars) gets truncated to 10
      const modalText = new ModalText("short longworddddd a b");
      const result = modalText.render(12);

      assert.ok(result.length >= 2);
      assert.ok(result.some((line) => line.includes("longworddd")));
    });

    it("should not wrap when text fits exactly", () => {
      // contentWidth = 12 - 2 = 10, "1234567890" is exactly 10 chars
      const modalText = new ModalText("1234567890");
      const result = modalText.render(12);

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("1234567890"));
    });

    it("should handle single character per word", () => {
      const modalText = new ModalText("a b c d e f g h i j");
      const result = modalText.render(10);

      assert.ok(result.length >= 2);
    });

    it("should respect custom padding", () => {
      // paddingX=2, so contentWidth = 20 - 4 = 16
      const modalText = new ModalText("short", 2);
      const result = modalText.render(20);

      assert.strictEqual(result.length, 1);
      // Should have 2 spaces of left padding
      assert.ok(result[0].startsWith("  short"));
    });

    it("should handle very long single word that needs truncation to width of 1", () => {
      // contentWidth = 3 - 2 = 1 with default paddingX=1
      const modalText = new ModalText("hello");
      const result = modalText.render(3);

      // The long word should be truncated to 1 char
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes("h"));
    });
  });
});
