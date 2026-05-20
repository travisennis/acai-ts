import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import stripAnsi from "../../source/terminal/strip-ansi.ts";
import { Markdown } from "../../source/tui/components/markdown.ts";
import { visibleWidth } from "../../source/tui/utils.ts";

describe("Markdown code span wrapping", () => {
  it("should not overflow contentWidth with short code spans", () => {
    const width = 60;
    const md = new Markdown(
      "Use the `cmd` command to run `foo` and `bar` in your terminal.",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(width);
    for (const line of lines) {
      assert.ok(
        visibleWidth(line) <= width,
        `Line overflows (${visibleWidth(line)} > ${width}): "${stripAnsi(line)}"`,
      );
    }
  });

  it("should not overflow contentWidth with long code spans", () => {
    const width = 50;
    const md = new Markdown(
      "Run `command --flag --option value` to start the process.",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(width);
    for (const line of lines) {
      assert.ok(
        visibleWidth(line) <= width,
        `Line overflows (${visibleWidth(line)} > ${width}): "${stripAnsi(line)}"`,
      );
    }
  });

  it("should not wrap unnecessarily with short code spans", () => {
    const width = 80;
    const text = "Use `cmd` to run it.";
    const md = new Markdown(text, { paddingX: 0, paddingY: 0 });
    const lines = md.render(width);
    const nonEmptyLines = lines.filter((l) => stripAnsi(l).trim().length > 0);
    assert.strictEqual(
      nonEmptyLines.length,
      1,
      `Should be 1 line but got ${nonEmptyLines.length}: ${nonEmptyLines.map((l) => `"${stripAnsi(l).trim()}"`).join(", ")}`,
    );
  });

  it("should handle multiple code spans correctly", () => {
    const width = 60;
    const md = new Markdown(
      "The `first` and `second` and `third` items are important for the system.",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(width);
    for (const line of lines) {
      assert.ok(
        visibleWidth(line) <= width,
        `Line overflows (${visibleWidth(line)} > ${width}): "${stripAnsi(line)}"`,
      );
    }
  });

  it("should handle text without code spans normally", () => {
    const width = 40;
    const md = new Markdown(
      "This is a simple paragraph without any code spans at all.",
      { paddingX: 0, paddingY: 0 },
    );
    const lines = md.render(width);
    for (const line of lines) {
      assert.ok(
        visibleWidth(line) <= width,
        `Line overflows (${visibleWidth(line)} > ${width}): "${stripAnsi(line)}"`,
      );
    }
  });

  it("should preserve code span content after wrapping", () => {
    const width = 80;
    const md = new Markdown("Use the `myFunction` command.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`myFunction`"),
      `Code span content should be preserved: "${fullText}"`,
    );
  });

  it("should handle a single code span at start of text", () => {
    const width = 60;
    const md = new Markdown("`start` of the line is a command.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`start`"),
      `Code span at start should be preserved: "${fullText}"`,
    );
  });

  it("should handle a code span at end of text", () => {
    const width = 60;
    const md = new Markdown("Execute the command `end`", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`end`"),
      `Code span at end should be preserved: "${fullText}"`,
    );
  });

  it("should handle consecutive code spans", () => {
    const width = 80;
    const md = new Markdown("Compare `foo` and `bar` for differences.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`foo`"),
      `First code span should be preserved: "${fullText}"`,
    );
    assert.ok(
      fullText.includes("`bar`"),
      `Second code span should be preserved: "${fullText}"`,
    );
  });

  it("should handle code spans with special characters", () => {
    const width = 80;
    const md = new Markdown("Use `someFunc(args, flags)` for processing.", {
      paddingX: 0,
      paddingY: 0,
    });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`someFunc(args, flags)`"),
      `Code span with special chars should be preserved: "${fullText}"`,
    );
  });

  it("should handle text with only a code span", () => {
    const width = 20;
    const md = new Markdown("`only`", { paddingX: 0, paddingY: 0 });
    const lines = md.render(width);
    const fullText = lines.map((l) => stripAnsi(l)).join("\n");
    assert.ok(
      fullText.includes("`only`"),
      `Code-only text should be preserved: "${fullText}"`,
    );
  });
});
