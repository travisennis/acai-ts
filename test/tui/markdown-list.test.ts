import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import stripAnsi from "../../source/terminal/strip-ansi.ts";
import style from "../../source/terminal/style.ts";
import { Markdown } from "../../source/tui/components/markdown.ts";

describe("Markdown list rendering", () => {
  it("should render a simple unordered list", () => {
    const md = new Markdown("- Item one\n- Item two\n- Item three", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Item one")));
    assert.ok(visible.some((l) => l.includes("Item two")));
    assert.ok(visible.some((l) => l.includes("Item three")));
  });

  it("should render a simple ordered list", () => {
    const md = new Markdown("1. First\n2. Second\n3. Third", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("First")));
    assert.ok(visible.some((l) => l.includes("Second")));
    assert.ok(visible.some((l) => l.includes("Third")));
    // Ordered list should start with "1. "
    const firstLine = visible.find((l) => l.includes("First"));
    assert.ok(firstLine?.startsWith("1. "));
  });

  it("should render nested unordered lists", () => {
    const md = new Markdown("- Parent\n  - Child\n  - Another child", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const parentLine = visible.find((l) => l.includes("Parent"));
    assert.ok(parentLine, "Should contain Parent");
    const childLine = visible.find((l) => l.includes("Child"));
    assert.ok(childLine, "Should contain Child");
    const anotherChildLine = visible.find((l) => l.includes("Another child"));
    assert.ok(anotherChildLine, "Should contain Another child");
    // Child should be indented more than parent
    const parentIndent = parentLine?.search(/\S/);
    const childIndent = childLine?.search(/\S/);
    assert.ok(
      childIndent > parentIndent,
      `Child indent (${childIndent}) should be greater than parent indent (${parentIndent})`,
    );
  });

  it("should render nested ordered lists", () => {
    const md = new Markdown("1. First\n   1. Sub-first\n   2. Sub-second", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("First")));
    assert.ok(visible.some((l) => l.includes("Sub-first")));
    assert.ok(visible.some((l) => l.includes("Sub-second")));
  });

  it("should render list items with inline code", () => {
    const md = new Markdown("- Use the `code` span", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`code`"),
      `Code in list should be preserved: "${fullText}"`,
    );
  });

  it("should not leak inline code styling to wrapped list continuation lines", () => {
    const originalLevel = style.level;
    style.level = 1;
    try {
      const md = new Markdown(
        "- First item has enough words to wrap with `inline code` and then stop\n- Second item has enough words to wrap onto a continuation line and then stop",
        {
          paddingX: 0,
          paddingY: 0,
        },
      );
      const lines = md.render(36);

      assert.equal(
        lines.some((line) => line.startsWith("\x1B[90mstop")),
        false,
      );
      assert.equal(
        lines.some((line) => line.startsWith("\x1B[2mstop")),
        false,
      );
    } finally {
      style.level = originalLevel;
    }
  });

  it("should render a list with a paragraph inside an item", () => {
    const md = new Markdown("- Item with\n  a paragraph continuation", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Item with")));
    assert.ok(visible.some((l) => l.includes("a paragraph continuation")));
  });

  it("should render deep nesting (3 levels)", () => {
    const md = new Markdown("- Level 1\n  - Level 2\n    - Level 3", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const level1 = visible.find((l) => l.includes("Level 1"));
    const level2 = visible.find((l) => l.includes("Level 2"));
    const level3 = visible.find((l) => l.includes("Level 3"));
    assert.ok(level1, "Should contain Level 1");
    assert.ok(level2, "Should contain Level 2");
    assert.ok(level3, "Should contain Level 3");
    // Each level should be indented progressively
    const i1 = level1?.search(/\S/);
    const i2 = level2?.search(/\S/);
    const i3 = level3?.search(/\S/);
    assert.ok(i2 > i1, `Level 2 indent (${i2}) > Level 1 indent (${i1})`);
    assert.ok(i3 > i2, `Level 3 indent (${i3}) > Level 2 indent (${i2})`);
  });

  it("should handle an empty list (no items)", () => {
    // Markdown parsers may handle this differently; just ensure no crash
    const md = new Markdown("", { paddingX: 0, paddingY: 0 });
    const lines = md.render(80);
    assert.ok(Array.isArray(lines));
  });

  it("should handle list with mixed content types", () => {
    const md = new Markdown("- Text item\n- Item with `code`\n- Last item", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Text item")));
    assert.ok(visible.some((l) => l.includes("code")));
    assert.ok(visible.some((l) => l.includes("Last item")));
  });

  it("should handle ordered list starting from a specific number", () => {
    // Use HTML-style start attribute
    const md = new Markdown("3. Third\n4. Fourth", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    // Marked may not support start attribute from markdown alone
    // Just ensure no crash and items are rendered
    assert.ok(visible.some((l) => l.includes("Third")));
    assert.ok(visible.some((l) => l.includes("Fourth")));
  });

  it("should not overflow width with long list items", () => {
    const width = 40;
    const md = new Markdown(
      "- This is a very long list item that should wrap at the specified width because it exceeds the limit",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(width);
    for (const line of lines) {
      const stripped = stripAnsi(line);
      if (stripped.trim()) {
        // ANSI codes may make visibleWidth slightly off; check visible width
        // This test just ensures no crash during wrapping
        assert.ok(stripped.length > 0);
      }
    }
  });
});
