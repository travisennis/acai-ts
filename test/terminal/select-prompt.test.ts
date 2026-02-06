import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncateToWidth, visibleWidth } from "../../source/tui/utils.ts";

describe("truncateToWidth", () => {
  it("truncates long strings with ellipsis", () => {
    const result = truncateToWidth("This is a very long string", 15, "...");
    assert.strictEqual(visibleWidth(result), 15);
    assert.ok(result.endsWith("..."));
  });

  it("preserves short strings without truncation", () => {
    const result = truncateToWidth("Hi", 10, "...");
    assert.strictEqual(result, "Hi");
  });

  it("handles ANSI codes correctly", () => {
    const result = truncateToWidth("\x1b[36mCyan Text\x1b[0m", 7, "...");
    assert.strictEqual(visibleWidth(result), 7);
    assert.ok(result.includes("\x1b[36m"));
    assert.ok(result.endsWith("..."));
  });

  it("handles emojis and wide characters", () => {
    const result = truncateToWidth("Hello 🌍 World", 12, "...");
    assert.strictEqual(visibleWidth(result), 12);
    assert.ok(result.endsWith("..."));
  });

  it("returns ellipsis when maxWidth equals ellipsisWidth", () => {
    const result = truncateToWidth("Very long text", 3, "...");
    assert.strictEqual(result, "...");
  });

  it("returns empty string when maxWidth is 0", () => {
    const result = truncateToWidth("Some text", 0, "...");
    assert.strictEqual(result, "");
  });

  it("truncates strings with combining characters correctly", () => {
    const result = truncateToWidth("Héllo Wörld", 10, "...");
    assert.strictEqual(visibleWidth(result), 10);
  });

  it("preserves ANSI codes in truncated output", () => {
    const result = truncateToWidth(
      "\x1b[31mRed\x1b[0m and more text",
      15,
      "...",
    );
    assert.strictEqual(visibleWidth(result), 15);
    assert.ok(result.startsWith("\x1b[31m"));
  });
});

describe("visibleWidth", () => {
  it("counts ASCII characters correctly", () => {
    assert.strictEqual(visibleWidth("Hello"), 5);
  });

  it("counts emojis as 2 columns", () => {
    assert.strictEqual(visibleWidth("Hello 🌍"), 8);
  });

  it("ignores ANSI escape codes", () => {
    assert.strictEqual(visibleWidth("\x1b[36mCyan\x1b[0m"), 4);
  });

  it("handles combining characters", () => {
    assert.strictEqual(visibleWidth("Héllo"), 5);
  });

  it("replaces tabs with spaces", () => {
    assert.strictEqual(visibleWidth("a\tb"), 5);
  });
});
