import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  truncateFragmentToWidth,
  truncateToWidth,
} from "../../source/tui/utils.ts";

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

describe("truncateFragmentToWidth", () => {
  // --- edge cases ---

  it("returns empty result when maxWidth <= 0", () => {
    assert.deepEqual(truncateFragmentToWidth("hello", 0), {
      text: "",
      width: 0,
    });
    assert.deepEqual(truncateFragmentToWidth("hello", -1), {
      text: "",
      width: 0,
    });
  });

  it("returns empty result for empty text", () => {
    assert.deepEqual(truncateFragmentToWidth("", 10), {
      text: "",
      width: 0,
    });
  });

  // --- ASCII path ---

  it("returns full text for ASCII that fits", () => {
    const result = truncateFragmentToWidth("hello", 10);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
  });

  it("clips ASCII text to maxWidth", () => {
    const result = truncateFragmentToWidth("hello world", 5);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
  });

  it("returns exact text when ASCII length equals maxWidth", () => {
    const result = truncateFragmentToWidth("hello", 5);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
  });

  // --- Grapheme path (no ANSI, no tabs) ---

  it("handles Unicode text without ANSI or tabs", () => {
    const result = truncateFragmentToWidth("a😀b", 10);
    assert.equal(result.text, "a😀b");
    assert.equal(result.width, 4); // 'a'=1, '😀'=2, 'b'=1
  });

  it("truncates Unicode text at grapheme boundaries", () => {
    // "a😀b" width 4, truncate to width 3
    // 'a' (1) + '😀' (2) = 3, 'b' would make it 4 > 3
    const result = truncateFragmentToWidth("a😀b", 3);
    assert.equal(result.text, "a😀");
    assert.equal(result.width, 3);
  });

  it("handles CJK characters without ANSI or tabs", () => {
    const result = truncateFragmentToWidth("ab中文", 10);
    assert.equal(result.text, "ab中文");
    assert.equal(result.width, 6); // 'a'=1, 'b'=1, '中'=2, '文'=2
  });

  it("truncates CJK text at grapheme boundaries", () => {
    // "ab中文" width 6, truncate to width 3
    // 'a'(1)+'b'(1)=2, +'中'(2)=4 > 3, so stops at "ab"
    const result = truncateFragmentToWidth("ab中文", 3);
    assert.equal(result.text, "ab");
    assert.equal(result.width, 2);
  });

  it("truncates at exact boundary with CJK", () => {
    const result = truncateFragmentToWidth("ab中文", 4);
    assert.equal(result.text, "ab中");
    assert.equal(result.width, 4);
  });

  // --- ANSI path ---

  it("preserves ANSI codes in result", () => {
    const result = truncateFragmentToWidth("\x1b[31mhello\x1b[0m", 10);
    assert.ok(result.text.includes("\x1b[31m"));
    assert.ok(result.text.includes("\x1b[0m") || result.width < 10);
  });

  it("truncates text with ANSI codes", () => {
    const result = truncateFragmentToWidth("\x1b[31mhello\x1b[0m world", 5);
    // Should include ANSI code and truncated text
    assert.ok(result.text.includes("\x1b[31m"));
    assert.ok(result.text.length > 0);
    assert.equal(result.width, 5);
  });

  it("handles multiple ANSI codes", () => {
    const result = truncateFragmentToWidth(
      "\x1b[31mhello\x1b[32m world\x1b[0m",
      20,
    );
    assert.ok(result.text.includes("\x1b[31m"));
    assert.ok(result.text.includes("\x1b[32m"));
  });

  // --- Tab path ---

  it("counts tab as width 3", () => {
    const result = truncateFragmentToWidth("a\tb", 10);
    // 'a'(1) + tab(3) + 'b'(1) = 5
    assert.equal(result.text, "a\tb");
    assert.equal(result.width, 5);
  });

  it("breaks on tab when it exceeds maxWidth", () => {
    // 'a'(1) + tab(3) = 4, 'b'(1) would be 5 which fits at maxWidth=5
    // But let's test with smaller: 'a'(1) + tab(3) = 4 > maxWidth=3, so break at tab
    const result = truncateFragmentToWidth("a\tb", 3);
    assert.equal(result.text, "a");
    assert.equal(result.width, 1);
  });

  it("breaks on tab when tab itself exceeds maxWidth", () => {
    // 'a'(1) + tab(3) would be 4 > maxWidth=2, break before tab
    const result = truncateFragmentToWidth("a\tb", 2);
    assert.equal(result.text, "a");
    assert.equal(result.width, 1);
  });

  // --- Combined ANSI + tabs ---

  it("handles text with both ANSI codes and tabs", () => {
    const result = truncateFragmentToWidth("\x1b[31ma\tb\x1b[0m", 10);
    assert.ok(result.text.includes("\x1b[31m"));
    assert.ok(result.text.includes("\t") || result.width < 4);
  });

  // --- Edge: exact fit ---

  it("stops exactly at maxWidth boundary", () => {
    const result = truncateFragmentToWidth("abcdef", 3);
    assert.equal(result.text, "abc");
    assert.equal(result.width, 3);
  });

  it("stops exactly at maxWidth with emoji", () => {
    const result = truncateFragmentToWidth("a😀c", 3);
    assert.equal(result.text, "a😀");
    assert.equal(result.width, 3);
  });

  // --- Non-ASCII but no ANSI/tabs that doesn't need truncation ---

  it("handles pure emoji text", () => {
    const result = truncateFragmentToWidth("😀😀", 10);
    assert.equal(result.text, "😀😀");
    assert.equal(result.width, 4);
  });

  it("truncates pure emoji text", () => {
    const result = truncateFragmentToWidth("😀😀", 3);
    assert.equal(result.text, "😀");
    assert.equal(result.width, 2);
  });

  it("returns zero width when first grapheme exceeds maxWidth", () => {
    const result = truncateFragmentToWidth("😀", 1);
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
  });

  it("returns zero width when first char after ANSI exceeds maxWidth", () => {
    const result = truncateFragmentToWidth("\x1b[31m😀\x1b[0m", 1);
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
  });
});
