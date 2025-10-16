import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMarkdown } from "../../source/terminal/markdown.ts";

describe("applyMarkdown", () => {
  describe("HTML/XML tag rendering", () => {
    it("should render inline HTML tags", () => {
      const result = applyMarkdown("<span>content</span>");
      // Inline HTML creates separate tokens for opening and closing tags
      // In test environment (non-TTY), style.dim returns raw text
      assert.strictEqual(result, "<span>content</span>");
    });

    it("should render block-level HTML tags", () => {
      const result = applyMarkdown("<div>block content</div>");
      // Block-level HTML creates a single token with the entire content
      assert.strictEqual(result, "<div>block content</div>");
    });

    it("should render self-closing HTML tags", () => {
      const result = applyMarkdown("<br />");
      assert.strictEqual(result, "<br />");
    });

    it("should render image tags", () => {
      const result = applyMarkdown('<img src="image.jpg" />');
      assert.strictEqual(result, '<img src="image.jpg" />');
    });

    it("should render XML tags", () => {
      const result = applyMarkdown("<xml><tag>content</tag></xml>");
      // XML tags are treated as block-level HTML
      assert.strictEqual(result, "<xml><tag>content</tag></xml>");
    });

    it("should handle mixed markdown and HTML content", () => {
      const result = applyMarkdown("**bold** and <span>HTML</span> content");
      // Mixed content: bold text + separate HTML opening/closing tags
      // In test environment, bold text is rendered without ANSI codes
      assert.strictEqual(result, "bold and <span>HTML</span> content");
    });

    it("should handle HTML tags within paragraphs", () => {
      const result = applyMarkdown(
        "This is a paragraph with <span>inline HTML</span> tags.",
      );
      assert.strictEqual(
        result,
        "This is a paragraph with <span>inline HTML</span> tags.",
      );
    });

    it("should handle multiple HTML tags in same content", () => {
      const result = applyMarkdown("<span>first</span> and <div>second</div>");
      assert.strictEqual(result, "<span>first</span> and <div>second</div>");
    });

    it("should handle nested HTML tags", () => {
      const result = applyMarkdown("<div><span>nested content</span></div>");
      // Nested tags are treated as block-level HTML
      assert.strictEqual(result, "<div><span>nested content</span></div>");
    });

    it("should handle HTML comments", () => {
      const result = applyMarkdown("<!-- This is a comment -->");
      assert.strictEqual(result, "<!-- This is a comment -->");
    });

    it("should handle HTML with attributes", () => {
      const result = applyMarkdown('<a href="https://example.com">link</a>');
      // Inline HTML with attributes creates separate tokens
      assert.strictEqual(result, '<a href="https://example.com">link</a>');
    });

    it("should handle empty HTML tags", () => {
      const result = applyMarkdown("<span></span>");
      // Empty tags create separate opening and closing tokens
      assert.strictEqual(result, "<span></span>");
    });

    it("should handle HTML tags with special characters", () => {
      const result = applyMarkdown(
        '<input type="text" value="test & value" />',
      );
      assert.strictEqual(result, '<input type="text" value="test & value" />');
    });
  });

  describe("Backwards compatibility", () => {
    it("should still render regular markdown correctly", () => {
      const result = applyMarkdown("**bold** and *italic* text");
      // In test environment, formatting is rendered without ANSI codes
      assert.strictEqual(result, "bold and italic text");
    });

    it("should still render code blocks correctly", () => {
      const result = applyMarkdown("`inline code`");
      assert.strictEqual(result, "inline code");
    });

    it("should still render links correctly", () => {
      const result = applyMarkdown("[link](https://example.com)");
      // In test environment, links are rendered without formatting
      assert.strictEqual(result, "[link](https://example.com)");
    });

    it("should still render headers correctly", () => {
      const result = applyMarkdown("# Header 1");
      // In test environment, headers are rendered without formatting
      assert.strictEqual(result, "Header 1");
    });
  });
});
