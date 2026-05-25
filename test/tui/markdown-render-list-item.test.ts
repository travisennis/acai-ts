import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import stripAnsi from "../../source/terminal/strip-ansi.ts";
import { Markdown } from "../../source/tui/components/markdown.ts";

describe("Markdown renderListItem", () => {
  it("should render a list item with a code block", () => {
    const md = new Markdown("- Item with\n\n  ```js\n  const x = 1;\n  ```", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const allText = visible.join("\n");
    assert.ok(visible.some((l) => l.includes("Item with")));
    assert.ok(allText.includes("const x = 1;"), "Should contain code content");
    assert.ok(allText.includes("```"), "Should contain code block delimiters");
  });

  it("should render a list item with inline code", () => {
    const md = new Markdown("- Item with `inline code` here", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("inline code")));
  });

  it("should render a list item with nested list", () => {
    const md = new Markdown("- Parent\n  - Child\n    - Grandchild", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const parent = visible.find((l) => l.includes("Parent"));
    const child = visible.find((l) => l.includes("Child"));
    const grandchild = visible.find((l) => l.includes("Grandchild"));
    assert.ok(parent, "Should contain Parent");
    assert.ok(child, "Should contain Child");
    assert.ok(grandchild, "Should contain Grandchild");
    // Each level should be progressively indented
    const parentIndent = parent?.search(/\S/);
    const childIndent = child?.search(/\S/);
    const grandchildIndent = grandchild?.search(/\S/);
    assert.ok(
      childIndent > parentIndent,
      `Child indent (${childIndent}) > Parent indent (${parentIndent})`,
    );
    assert.ok(
      grandchildIndent > childIndent,
      `Grandchild indent (${grandchildIndent}) > Child indent (${childIndent})`,
    );
  });

  it("should render a list item with a paragraph continuation", () => {
    const md = new Markdown(
      "- Item with\n  a paragraph continuation\n  and more text",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Item with")));
    assert.ok(visible.some((l) => l.includes("paragraph continuation")));
    assert.ok(visible.some((l) => l.includes("and more text")));
  });

  it("should render a list item with text content only", () => {
    const md = new Markdown("- Simple text item", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const match = visible.find((l) => l.includes("Simple text item"));
    assert.ok(match, "Should contain text content");
  });

  it("should render a list item with bold and italic text", () => {
    const md = new Markdown("- Item with **bold** and *italic* text", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("bold")));
    assert.ok(visible.some((l) => l.includes("italic")));
  });

  it("should render linked text in a list item", () => {
    const md = new Markdown(
      "- Item with [a link](https://example.com) inside",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("a link")));
  });

  it("should handle a list item with only an empty nested list", () => {
    // This ensures no crash when a list item has no text, just sub-lists
    const md = new Markdown("- \n  - Sublist item", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    // Should not crash, should produce some output
    assert.ok(Array.isArray(lines));
    assert.ok(lines.length > 0);
  });

  it("should render an ordered list item with a code block", () => {
    const md = new Markdown(
      "1. First item\n\n  ```sh\n  echo hello\n  ```\n\n2. Second item",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const allText = visible.join("\n");
    assert.ok(visible.some((l) => l.includes("First item")));
    assert.ok(visible.some((l) => l.includes("Second item")));
    assert.ok(allText.includes("echo hello"), "Should contain code content");
  });

  it("should handle list item with mixed token types (text + code + nested list)", () => {
    const md = new Markdown(
      [
        "- Complex item with text",
        "",
        "  ```py",
        '  print("hello")',
        "  ```",
        "",
        "  And a paragraph after code",
        "",
        "  - Nested sub-item",
      ].join("\n"),
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const allText = visible.join("\n");
    assert.ok(allText.includes("Complex item with text"));
    assert.ok(allText.includes('print("hello")'), "Should contain code");
    assert.ok(allText.includes("And a paragraph after code"));
    assert.ok(allText.includes("Nested sub-item"));
  });
});
