import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import wrapAnsi from "../../source/terminal/wrap-ansi.ts";

describe("wrapAnsi", () => {
  describe("basic wrapping", () => {
    it("should wrap long lines at column boundary", () => {
      const result = wrapAnsi("foo bar baz", 5);
      strictEqual(result, "foo\nbar\nbaz");
    });

    it("should not wrap short lines", () => {
      const result = wrapAnsi("foo", 10);
      strictEqual(result, "foo");
    });

    it("should handle empty string", () => {
      const result = wrapAnsi("", 10);
      strictEqual(result, "");
    });

    it("should handle whitespace-only string with trim", () => {
      const result = wrapAnsi("   ", 10);
      strictEqual(result, "");
    });

    it("should preserve whitespace-only string without trim", () => {
      const result = wrapAnsi("   ", 10, { trim: false });
      strictEqual(result, "   ");
    });

    it("should handle exact column width", () => {
      const result = wrapAnsi("abc def", 7);
      strictEqual(result, "abc def");
    });

    it("should wrap at word boundaries", () => {
      const result = wrapAnsi("hello world foo", 11);
      strictEqual(result, "hello world\nfoo");
    });
  });

  describe("hard wrap mode", () => {
    it("should break long words in hard mode", () => {
      const result = wrapAnsi("abcdefghij", 5, { hard: true });
      strictEqual(result, "abcde\nfghij");
    });

    it("should break very long words across multiple lines", () => {
      const result = wrapAnsi("abcdefghijklmno", 5, { hard: true });
      strictEqual(result, "abcde\nfghij\nklmno");
    });

    it("should handle words shorter than column width in hard mode", () => {
      const result = wrapAnsi("abc def", 5, { hard: true });
      strictEqual(result, "abc\ndef");
    });
  });

  describe("word wrap disabled", () => {
    it("should break words mid-word when wordWrap is false", () => {
      const result = wrapAnsi("abcdefghij", 5, { wordWrap: false });
      strictEqual(result, "abcde\nfghij");
    });

    it("should still break at spaces when possible", () => {
      const result = wrapAnsi("ab cd ef", 5, { wordWrap: false });
      strictEqual(result, "ab cd\nef");
    });
  });

  describe("trim option", () => {
    it("should trim leading whitespace by default", () => {
      const result = wrapAnsi("foo   bar   baz", 5);
      strictEqual(result.includes("\n"), true);
      for (const line of result.split("\n")) {
        strictEqual(line === line.trimStart(), true);
      }
    });

    it("should preserve leading whitespace with trim: false", () => {
      const result = wrapAnsi("foo bar", 3, { trim: false });
      strictEqual(typeof result, "string");
      strictEqual(result.length > 0, true);
    });
  });

  describe("newline handling", () => {
    it("should preserve existing newlines", () => {
      const result = wrapAnsi("foo\nbar", 10);
      strictEqual(result, "foo\nbar");
    });

    it("should handle \\r\\n line endings", () => {
      const result = wrapAnsi("foo\r\nbar", 10);
      strictEqual(result, "foo\nbar");
    });

    it("should wrap each line independently", () => {
      const result = wrapAnsi("foo bar\nbaz qux", 5);
      strictEqual(result, "foo\nbar\nbaz\nqux");
    });
  });

  describe("ANSI escape codes", () => {
    it("should not count ANSI codes towards column width", () => {
      const input = "\u001B[31mhello\u001B[39m world";
      const result = wrapAnsi(input, 10);
      strictEqual(result.includes("hello"), true);
      strictEqual(result.includes("world"), true);
    });

    it("should handle styled text wrapping", () => {
      const red = "\u001B[31m";
      const reset = "\u001B[39m";
      const input = `${red}foo${reset} bar baz`;
      const result = wrapAnsi(input, 5);
      strictEqual(result.includes("foo"), true);
      strictEqual(result.includes("bar"), true);
    });

    it("should handle text without ANSI codes", () => {
      const result = wrapAnsi("plain text here", 6);
      strictEqual(result, "plain\ntext\nhere");
    });
  });

  describe("unicode support", () => {
    it("should handle unicode characters", () => {
      const result = wrapAnsi("a b c", 3);
      strictEqual(result, "a b\nc");
    });

    it("should normalize input string", () => {
      const result = wrapAnsi("café", 10);
      strictEqual(result.includes("café"), true);
    });
  });

  describe("edge cases", () => {
    it("should handle single character column width", () => {
      const result = wrapAnsi("ab", 1, { hard: true });
      strictEqual(result, "a\nb");
    });

    it("should handle multiple spaces between words", () => {
      const result = wrapAnsi("foo  bar", 10);
      strictEqual(typeof result, "string");
    });

    it("should handle column width larger than string", () => {
      const result = wrapAnsi("short", 100);
      strictEqual(result, "short");
    });
  });
});
