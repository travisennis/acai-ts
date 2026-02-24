import assert from "node:assert/strict";
import { describe, it } from "node:test";
import stringWidth from "../../source/terminal/string-width.ts";

describe("stringWidth", () => {
  it("returns 0 for empty string", () => {
    assert.equal(stringWidth(""), 0);
  });

  it("returns 0 for non-string input", () => {
    assert.equal(stringWidth(undefined as unknown as string), 0);
  });

  it("returns correct width for ASCII text", () => {
    assert.equal(stringWidth("hello"), 5);
  });

  it("returns width 2 for fullwidth CJK characters", () => {
    assert.equal(stringWidth("你好"), 4);
  });

  it("returns width 2 for emoji", () => {
    assert.equal(stringWidth("😀"), 2);
  });

  it("handles mixed ASCII and CJK", () => {
    assert.equal(stringWidth("a你b"), 4);
  });

  it("strips ANSI escape codes by default", () => {
    assert.equal(stringWidth("\u001B[31mhello\u001B[0m"), 5);
  });

  it("counts ANSI escape codes when option is set", () => {
    const result = stringWidth("\u001B[31mhello\u001B[0m", {
      countAnsiEscapeCodes: true,
    });
    assert.ok(result > 5);
  });

  it("returns 0 for string with only ANSI codes", () => {
    assert.equal(stringWidth("\u001B[31m\u001B[0m"), 0);
  });

  it("handles zero-width characters", () => {
    assert.equal(stringWidth("a\u200Bb"), 2);
  });

  it("handles compound emoji sequences", () => {
    assert.equal(stringWidth("👨‍👩‍👧‍👦"), 2);
  });

  it("handles single character", () => {
    assert.equal(stringWidth("a"), 1);
  });

  it("handles ambiguous width characters as narrow by default", () => {
    const width = stringWidth("→");
    assert.equal(width, 1);
  });

  it("handles ambiguous width characters as wide when option set", () => {
    const width = stringWidth("→", { ambiguousIsNarrow: false });
    assert.equal(width, 2);
  });
});
