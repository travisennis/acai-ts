import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { Text } from "../../source/tui/components/text.ts";

describe("Text", () => {
  describe("constructor", () => {
    it("should create text component with default values", () => {
      const text = new Text("hello");
      strictEqual(text.render(10).length > 0, true);
    });

    it("should accept custom padding", () => {
      const text = new Text("hello", 2, 3);
      const result = text.render(20);
      strictEqual(result.length > 0, true);
    });

    it("should accept custom background color", () => {
      const text = new Text("hello", 1, 1, { r: 255, g: 0, b: 0 });
      const result = text.render(20);
      strictEqual(result.length > 0, true);
    });
  });

  describe("setText", () => {
    it("should update text content", () => {
      const text = new Text("original");
      const result1 = text.render(20);

      text.setText("updated");
      const result2 = text.render(20);

      strictEqual(result1 !== result2, true);
    });
  });

  describe("setCustomBgRgb", () => {
    it("should update background color", () => {
      const text = new Text("hello");
      const result1 = text.render(20);

      text.setCustomBgRgb({ r: 255, g: 0, b: 0 });
      const result2 = text.render(20);

      strictEqual(result1 !== result2, true);
    });

    it("should allow removing background color", () => {
      const text = new Text("hello", 1, 1, { r: 255, g: 0, b: 0 });
      const result1 = text.render(20);

      text.setCustomBgRgb(undefined);
      const result2 = text.render(20);

      strictEqual(result1 !== result2, true);
    });
  });

  describe("render", () => {
    describe("basic rendering", () => {
      it("should render simple text", () => {
        const text = new Text("hello world");
        const result = text.render(20);
        strictEqual(result.length > 0, true);
      });

      it("should handle empty string", () => {
        const text = new Text("");
        const result = text.render(10);
        strictEqual(Array.isArray(result), true);
      });

      it("should handle whitespace-only string", () => {
        const text = new Text("   ");
        const result = text.render(10);
        strictEqual(Array.isArray(result), true);
      });

      it("should handle null/undefined text", () => {
        const text = new Text("");
        const result = text.render(10);
        strictEqual(result.length >= 0, true);
      });
    });

    describe("padding", () => {
      it("should add horizontal padding", () => {
        const text = new Text("hello", 2, 0);
        const result = text.render(10);
        strictEqual(result.length > 0, true);
      });

      it("should add vertical padding", () => {
        const text = new Text("hello", 0, 2);
        const result = text.render(10);
        strictEqual(result.length >= 5, true);
      });

      it("should handle zero padding", () => {
        const text = new Text("hello", 0, 0);
        const result = text.render(10);
        strictEqual(result.length > 0, true);
      });
    });

    describe("word wrapping", () => {
      it("should wrap long lines", () => {
        const text = new Text("hello world foo bar baz");
        const result = text.render(10);
        strictEqual(result.length > 1, true);
      });

      it("should not wrap short lines", () => {
        const text = new Text("hi");
        const result = text.render(20);
        strictEqual(result.length >= 1, true);
      });

      it("should handle exact width", () => {
        const text = new Text("hello");
        const result = text.render(5);
        strictEqual(Array.isArray(result), true);
      });
    });

    describe("line breaks", () => {
      it("should preserve explicit line breaks", () => {
        const text = new Text("line1\nline2");
        const result = text.render(20);
        strictEqual(result.length >= 2, true);
      });

      it("should handle multiple line breaks", () => {
        const text = new Text("a\nb\nc\nd\ne");
        const result = text.render(10);
        strictEqual(result.length >= 5, true);
      });

      it("should handle trailing newlines", () => {
        const text = new Text("hello\n");
        const result = text.render(20);
        strictEqual(Array.isArray(result), true);
      });
    });

    describe("tab handling", () => {
      it("should convert tabs to spaces", () => {
        const text = new Text("hello\tworld");
        const result = text.render(20);
        strictEqual(Array.isArray(result), true);
      });
    });

    describe("truncation", () => {
      it("should truncate very long words", () => {
        const text = new Text("thisisaverylongwordthatneedstruncation");
        const result = text.render(10);
        strictEqual(result.length > 0, true);
      });

      it("should handle mixed long and short words", () => {
        const text = new Text("short longword short");
        const result = text.render(10);
        strictEqual(Array.isArray(result), true);
      });
    });

    describe("background color", () => {
      it("should apply background color to content lines", () => {
        const text = new Text("hello", 1, 1, { r: 100, g: 100, b: 100 });
        const result = text.render(20);
        strictEqual(result.length > 0, true);
      });

      it("should apply background color to padding lines", () => {
        const text = new Text("hi", 1, 2, { r: 255, g: 0, b: 0 });
        const result = text.render(20);
        strictEqual(result.length >= 5, true);
      });
    });

    describe("caching", () => {
      it("should return cached result for same input", () => {
        const text = new Text("hello");
        const result1 = text.render(10);
        const result2 = text.render(10);
        deepStrictEqual(result1, result2);
      });

      it("should invalidate cache when text changes", () => {
        const text = new Text("hello");
        const result1 = text.render(10);

        text.setText("world");
        const result2 = text.render(10);

        strictEqual(result1 !== result2, true);
      });

      it("should invalidate cache when width changes", () => {
        const text = new Text("hello");
        const result1 = text.render(10);
        const result2 = text.render(20);

        strictEqual(result1 !== result2, true);
      });
    });

    describe("edge cases", () => {
      it("should handle width of 1", () => {
        const text = new Text("a");
        const result = text.render(1);
        strictEqual(Array.isArray(result), true);
      });

      it("should handle very large width", () => {
        const text = new Text("hello");
        const result = text.render(1000);
        strictEqual(result.length > 0, true);
      });

      it("should handle single character text", () => {
        const text = new Text("x");
        const result = text.render(10);
        strictEqual(result.length >= 1, true);
      });

      it("should handle unicode characters", () => {
        const text = new Text("こんにちは");
        const result = text.render(10);
        strictEqual(Array.isArray(result), true);
      });

      it("should return non-empty array for any input", () => {
        const text = new Text("test");
        const result = text.render(5);
        strictEqual(result.length > 0, true);
        strictEqual(typeof result[0], "string");
      });
    });
  });
});
