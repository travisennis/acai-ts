import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMarkdown } from "../../source/terminal/markdown.ts";

// ANSI escape pattern for removing styling
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes are needed for testing
const ANSI_ESCAPE_PATTERN = /\x1b[[0-9;]*m/g;

// Helper to check if result contains HTML tags (with or without ANSI codes)
function containsHtmlTags(result: string, expectedHtml: string): boolean {
  // Remove ANSI escape codes for comparison
  const cleanResult = result.replace(ANSI_ESCAPE_PATTERN, "");
  return cleanResult === expectedHtml;
}

describe("applyMarkdown", () => {
  describe("HTML/XML tag rendering", () => {
    it("should render inline HTML tags", () => {
      const result = applyMarkdown("<span>content</span>");
      // Inline HTML creates separate tokens for opening and closing tags
      // Test that HTML tags are present (with or without ANSI styling)
      assert.ok(containsHtmlTags(result, "<span>content</span>"));
    });

    it("should render block-level HTML tags", () => {
      const result = applyMarkdown("<div>block content</div>");
      // Block-level HTML creates a single token with the entire content
      assert.ok(containsHtmlTags(result, "<div>block content</div>"));
    });

    it("should render self-closing HTML tags", () => {
      const result = applyMarkdown("<br />");
      assert.ok(containsHtmlTags(result, "<br />"));
    });

    it("should render image tags", () => {
      const result = applyMarkdown('<img src="image.jpg" />');
      assert.ok(containsHtmlTags(result, '<img src="image.jpg" />'));
    });

    it("should render XML tags", () => {
      const result = applyMarkdown("<xml><tag>content</tag></xml>");
      // XML tags are treated as block-level HTML
      assert.ok(containsHtmlTags(result, "<xml><tag>content</tag></xml>"));
    });

    it("should handle mixed markdown and HTML content", () => {
      const result = applyMarkdown("**bold** and <span>HTML</span> content");
      // Mixed content: bold text + separate HTML opening/closing tags
      // Test that HTML tags are present (with or without ANSI styling)
      assert.ok(containsHtmlTags(result, "bold and <span>HTML</span> content"));
    });

    it("should handle HTML tags within paragraphs", () => {
      const result = applyMarkdown(
        "This is a paragraph with <span>inline HTML</span> tags.",
      );
      assert.ok(
        containsHtmlTags(
          result,
          "This is a paragraph with <span>inline HTML</span> tags.",
        ),
      );
    });

    it("should handle multiple HTML tags in same content", () => {
      const result = applyMarkdown("<span>first</span> and <div>second</div>");
      assert.ok(
        containsHtmlTags(result, "<span>first</span> and <div>second</div>"),
      );
    });

    it("should handle nested HTML tags", () => {
      const result = applyMarkdown("<div><span>nested content</span></div>");
      // Nested tags are treated as block-level HTML
      assert.ok(
        containsHtmlTags(result, "<div><span>nested content</span></div>"),
      );
    });

    it("should handle HTML comments", () => {
      const result = applyMarkdown("<!-- This is a comment -->");
      assert.ok(containsHtmlTags(result, "<!-- This is a comment -->"));
    });

    it("should handle HTML with attributes", () => {
      const result = applyMarkdown('<a href="https://example.com">link</a>');
      // Inline HTML with attributes creates separate tokens
      assert.ok(
        containsHtmlTags(result, '<a href="https://example.com">link</a>'),
      );
    });

    it("should handle empty HTML tags", () => {
      const result = applyMarkdown("<span></span>");
      // Empty tags create separate opening and closing tokens
      assert.ok(containsHtmlTags(result, "<span></span>"));
    });

    it("should handle HTML tags with special characters", () => {
      const result = applyMarkdown(
        '<input type="text" value="test & value" />',
      );
      assert.ok(
        containsHtmlTags(result, '<input type="text" value="test & value" />'),
      );
    });
  });

  describe("Backwards compatibility", () => {
    it("should still render regular markdown correctly", () => {
      const result = applyMarkdown("**bold** and *italic* text");
      // Test that the content is present (with or without ANSI styling)
      const cleanResult = result.replace(ANSI_ESCAPE_PATTERN, "");
      assert.strictEqual(cleanResult, "bold and italic text");
    });

    it("should still render code blocks correctly", () => {
      const result = applyMarkdown("`inline code`");
      // Test that the content is present (with or without ANSI styling)
      const cleanResult = result.replace(ANSI_ESCAPE_PATTERN, "");
      assert.strictEqual(cleanResult, "inline code");
    });

    it("should still render links correctly", () => {
      const result = applyMarkdown("[link](https://example.com)");
      // Test that the content is present (with or without ANSI styling)
      // When color support is disabled, links may render as raw markdown
      const cleanResult = result.replace(ANSI_ESCAPE_PATTERN, "");
      // Accept either the formatted link text or the raw markdown
      assert.ok(
        cleanResult === "link" || cleanResult === "[link](https://example.com)",
      );
    });

    it("should still render headers correctly", () => {
      const result = applyMarkdown("# Header 1");
      // Test that the content is present (with or without ANSI styling)
      const cleanResult = result.replace(ANSI_ESCAPE_PATTERN, "");
      assert.strictEqual(cleanResult, "Header 1");
    });
  });
});
