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
    // Result ends with reset code before and after ellipsis for safety
    assert.ok(result.endsWith("\x1b[0m...\x1b[0m"));
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

  it("keeps output within width for very large unicode input", () => {
    const text = "🙂界".repeat(100_000);
    const truncated = truncateToWidth(text, 40, "…");

    assert.ok(visibleWidth(truncated) <= 40);
    assert.strictEqual(truncated.endsWith("…"), true);
  });

  it("preserves ANSI styling for kept text and resets before and after ellipsis", () => {
    const text = `\x1b[31m${"hello ".repeat(1000)}\x1b[0m`;
    const truncated = truncateToWidth(text, 20, "…");

    assert.ok(visibleWidth(truncated) <= 20);
    assert.ok(truncated.includes("\x1b[31m"));
    // Reset codes both before and after ellipsis
    assert.ok(truncated.includes("\x1b[0m…\x1b[0m"));
  });

  it("handles malformed ANSI escape prefixes without hanging", () => {
    const text = `abc\x1bnot-ansi ${"🙂".repeat(1000)}`;
    const truncated = truncateToWidth(text, 20, "…");

    assert.ok(visibleWidth(truncated) <= 20);
  });

  it("clips wide ellipsis safely", () => {
    // When ellipsis (🙂 = width 2) doesn't fit in maxWidth=1, return empty
    assert.strictEqual(truncateToWidth("abcdef", 1, "🙂"), "");
    // When ellipsis fits exactly, show it with reset codes
    const result = truncateToWidth("abcdef", 2, "🙂");
    assert.ok(visibleWidth(result) <= 2);
    assert.ok(result.includes("🙂"));
  });

  it("returns the original text when it already fits even if ellipsis is too wide", () => {
    assert.strictEqual(truncateToWidth("a", 2, "🙂"), "a");
    assert.strictEqual(truncateToWidth("界", 2, "🙂"), "界");
  });

  it("pads truncated output to requested width", () => {
    const truncated = truncateToWidth("🙂界🙂界🙂界", 8, "…", true);
    assert.strictEqual(visibleWidth(truncated), 8);
  });

  it("adds a trailing reset when truncating without an ellipsis", () => {
    const truncated = truncateToWidth(`\x1b[31m${"hello".repeat(100)}`, 10, "");
    assert.ok(visibleWidth(truncated) <= 10);
    assert.strictEqual(truncated.endsWith("\x1b[0m"), true);
  });

  it("keeps a contiguous prefix instead of skipping a wide grapheme and resuming later", () => {
    const truncated = truncateToWidth("🙂\t界", 5, "…", true);
    assert.ok(visibleWidth(truncated) <= 5);
    // Should have the emoji and tab or just the emoji, not skip and resume
    assert.ok(truncated.includes("🙂"));
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
