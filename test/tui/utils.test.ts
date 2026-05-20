import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncateToWidth } from "../../source/tui/utils.ts";

describe("truncateToWidth", () => {
  // --- edge cases ---

  it("returns empty string when maxWidth <= 0", () => {
    assert.equal(truncateToWidth("hello", 0), "");
    assert.equal(truncateToWidth("hello", -1), "");
  });

  it("returns empty string for empty text without pad", () => {
    assert.equal(truncateToWidth("", 10), "");
  });

  it("returns padded empty string for empty text with pad", () => {
    assert.equal(truncateToWidth("", 10, "...", true), "          ");
  });

  // --- short text (no truncation needed) ---

  it("returns original text when it fits", () => {
    assert.equal(truncateToWidth("hi", 10), "hi");
  });

  it("returns padded text when it fits and pad=true", () => {
    const result = truncateToWidth("hi", 10, "...", true);
    assert.equal(result, "hi        ");
    assert.equal(result.length, 10);
  });

  // --- ASCII truncation ---

  it("truncates ASCII text longer than maxWidth", () => {
    const result = truncateToWidth("hello world", 8);
    // "hello w" + "..." truncated to fit
    assert.ok(result !== "hello world");
    assert.ok(result.length <= 8);
    assert.ok(result.endsWith("..."));
  });

  it("truncates ASCII text and pads when pad=true", () => {
    const result = truncateToWidth("hello world", 8, "...", true);
    assert.equal(result.length, 8);
    assert.ok(result.endsWith("..."));
  });

  // --- custom ellipsis ---

  it("uses custom ellipsis", () => {
    const result = truncateToWidth("hello world", 8, "..");
    assert.ok(result.endsWith(".."));
  });

  it("handles ellipsis wider than maxWidth", () => {
    // ellipsis "..." is width 3, maxWidth is 2
    const result = truncateToWidth("hello", 2);
    assert.equal(result.length, 2);
  });

  it("returns empty ellipsis result when clipped to zero width", () => {
    // extremely narrow: ellipsis ">>" is width 2, maxWidth is 1
    const result = truncateToWidth("hello", 1, ">>");
    assert.ok(result.length <= 1);
  });

  // --- ANSI codes ---

  it("preserves ANSI codes when truncating", () => {
    const result = truncateToWidth("\x1b[31mhello\x1b[0m world", 8);
    assert.ok(result.includes("\x1b[31m"));
    assert.ok(result.includes("\x1b[0m") || result.endsWith("..."));
  });

  it("preserves ANSI codes when text fits", () => {
    const result = truncateToWidth("\x1b[32mok\x1b[0m", 10);
    assert.equal(result, "\x1b[32mok\x1b[0m");
  });

  // --- Unicode / wide characters ---

  it("handles emoji characters", () => {
    const result = truncateToWidth("a😀b", 3);
    // emoji is width 2, "a" is width 1, so "a😀" = 3 columns, no truncation needed
    assert.ok(result.length > 0);
  });

  it("handles CJK characters", () => {
    const result = truncateToWidth("ab中文def", 6);
    // Should truncate since "ab中文def" is 4+ characters with wide CJK
    assert.ok(result.length <= 8); // CJK chars are 2 wide each
    assert.ok(result.endsWith("..."));
  });

  // --- tabs ---

  it("handles tab characters", () => {
    const result = truncateToWidth("a\tb", 5);
    assert.ok(result.includes("\t"));
  });

  // --- exact fit ---

  it("returns exact text when length equals maxWidth (ASCII)", () => {
    assert.equal(truncateToWidth("12345", 5), "12345");
    assert.equal(truncateToWidth("12345", 5, "...", true), "12345");
  });

  it("returns text plus ellipsis when one over maxWidth", () => {
    const result = truncateToWidth("123456", 5);
    assert.equal(result, "12...");
  });
});
