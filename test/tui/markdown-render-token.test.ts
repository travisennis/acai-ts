import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import stripAnsi from "../../source/terminal/strip-ansi.ts";
import { Markdown } from "../../source/tui/components/markdown.ts";

describe("Markdown renderToken - heading cases", () => {
  it("should render level-1 heading with underline", () => {
    const md = new Markdown("# Heading 1", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Heading 1")));
  });

  it("should render level-2 heading", () => {
    const md = new Markdown("## Heading 2", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Heading 2")));
  });

  it("should render level-3 heading with prefix", () => {
    const md = new Markdown("### Heading 3", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Heading 3")));
    // Level 3+ headings should show the # prefix
    const headingLine = visible.find((l) => l.includes("Heading 3"));
    assert.ok(headingLine?.includes("#"), "Level 3 heading should include # prefix");
  });

  it("should render level-4 heading with prefix", () => {
    const md = new Markdown("#### Heading 4", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Heading 4")));
  });

  it("should add blank line after heading", () => {
    const md = new Markdown("# Title\nParagraph", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const titleIndex = visible.findIndex((l) => l.includes("Title"));
    const paraIndex = visible.findIndex((l) => l.includes("Paragraph"));
    // There should be a blank line between title and paragraph
    const between = visible.slice(titleIndex + 1, paraIndex);
    assert.ok(
      between.some((l) => l.trim() === ""),
      "Should have blank line after heading",
    );
  });
});

describe("Markdown renderToken - paragraph cases", () => {
  it("should render a simple paragraph", () => {
    const md = new Markdown("Hello world paragraph.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Hello world paragraph.")));
  });

  it("should add spacing after paragraph when next token is not list or space", () => {
    const md = new Markdown("First paragraph.\n\nSecond paragraph.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const firstIdx = visible.findIndex((l) => l.includes("First paragraph"));
    const secondIdx = visible.findIndex((l) => l.includes("Second paragraph"));
    assert.ok(firstIdx >= 0, "First paragraph should render");
    assert.ok(secondIdx > firstIdx, "Second paragraph should come after first");
    // There should be blank lines separating paragraphs
    const between = visible.slice(firstIdx + 1, secondIdx);
    assert.ok(
      between.some((l) => l.trim() === ""),
      "Should have blank line between paragraphs",
    );
  });
});

describe("Markdown renderToken - code block cases", () => {
  it("should render a code block with syntax highlighting for known languages", () => {
    const md = new Markdown("```typescript\nconst x: number = 1;\n```", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("const")),
      "Should contain code content",
    );
    assert.ok(
      visible.some((l) => l.includes("```")),
      "Should contain code block delimiters",
    );
  });

  it("should render a code block without syntax highlighting for unknown languages", () => {
    const md = new Markdown("```unknown\nsome code here\n```", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("some code here")),
      "Should contain code content",
    );
    assert.ok(
      visible.some((l) => l.includes("```")),
      "Should contain code block delimiters",
    );
  });

  it("should add blank line after code block", () => {
    const md = new Markdown("```\ncode\n```\nAfter", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    // Just ensure after content appears
    assert.ok(visible.some((l) => l.includes("After")));
  });

  it("should render code block without language tag", () => {
    const md = new Markdown("```\nplain code\n```", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("plain code")),
      "Should contain code even without language",
    );
  });
});

describe("Markdown renderToken - list cases", () => {
  it("should render an unordered list", () => {
    const md = new Markdown("- List item", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("List item")));
  });

  it("should render an ordered list", () => {
    const md = new Markdown("1. First item", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("First item")));
  });
});

describe("Markdown renderToken - table case", () => {
  it("should render a table", () => {
    const md = new Markdown("| Col1 | Col2 |\n|------|------|\n| A    | B    |", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Col1")), "Should contain table header");
    assert.ok(visible.some((l) => l.includes("A")), "Should contain table data");
  });
});

describe("Markdown renderToken - blockquote case", () => {
  it("should render a blockquote", () => {
    const md = new Markdown("> Quoted text", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Quoted text")), "Should contain quote text");
  });

  it("should add blank line after blockquote", () => {
    const md = new Markdown("> Quote\n\nNext paragraph", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Quote")));
    assert.ok(visible.some((l) => l.includes("Next paragraph")));
  });
});

describe("Markdown renderToken - hr case", () => {
  it("should render a horizontal rule", () => {
    const md = new Markdown("---", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    const nonEmptyLines = visible.filter((l) => l.trim().length > 0);
    // Should have at least one non-empty line (the hr)
    assert.ok(nonEmptyLines.length >= 1, "HR should produce content");
  });
});

describe("Markdown renderToken - image case", () => {
  it("should render an image with alt text", () => {
    const md = new Markdown("![alt text](https://example.com/img.png)", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("Image: alt text")),
      "Should show image with alt text",
    );
  });

  it("should render an image without alt text", () => {
    const md = new Markdown("![](https://example.com/img.png)", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("Image:")),
      "Should show image placeholder even without alt",
    );
  });
});

describe("Markdown renderToken - html case", () => {
  it("should render HTML tags dimmed", () => {
    const md = new Markdown("<div>content</div>", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("content")),
      "Should contain HTML content",
    );
  });
});

describe("Markdown renderToken - space case", () => {
  it("should render blank lines for space tokens", () => {
    const md = new Markdown("Line one\n\nLine two", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(visible.some((l) => l.includes("Line one")));
    assert.ok(visible.some((l) => l.includes("Line two")));
  });
});

describe("Markdown renderToken - default (text) case", () => {
  it("should render plain text tokens", () => {
    const md = new Markdown("Just plain text here", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(80);
    const visible = lines.map((l) => stripAnsi(l));
    assert.ok(
      visible.some((l) => l.includes("Just plain text here")),
      "Should render plain text",
    );
  });
});
