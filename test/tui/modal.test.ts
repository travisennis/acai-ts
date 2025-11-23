import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Modal,
  ModalTable,
  ModalText,
} from "../../source/tui/components/modal.ts";
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
  });

  describe("ModalTable", () => {
    it("should create modal table component", () => {
      const data = [
        ["Row 1", "Value 1"],
        ["Row 2", "Value 2"],
      ];
      const modalTable = new ModalTable(data, ["Column 1", "Column 2"]);

      assert.strictEqual(modalTable instanceof Container, true);
    });

    it("should render table data", () => {
      const data = [
        ["Row 1", "Value 1"],
        ["Row 2", "Value 2"],
      ];
      const modalTable = new ModalTable(data, ["Column 1", "Column 2"]);
      const result = modalTable.render(60);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length > 0, true);
    });

    it("should handle empty data", () => {
      const modalTable = new ModalTable([], ["Column 1", "Column 2"]);
      const result = modalTable.render(60);

      assert.strictEqual(Array.isArray(result), true);
      assert.strictEqual(result.length, 0);
    });
  });
});
