import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_THEME } from "../../source/terminal/default-theme.ts";
import {
  highlight,
  listLanguages,
  supportsLanguage,
} from "../../source/terminal/highlight/index.ts";
import { createStyle } from "../../source/terminal/style.ts";

describe("highlight functionality", () => {
  it("should highlight JavaScript code", () => {
    // Create a custom theme with forced color support
    const forcedStyle = createStyle({ level: 1 });
    const forcedTheme = {
      ...DEFAULT_THEME,
      keyword: forcedStyle.blue,
      // biome-ignore lint/style/useNamingConvention: API name from highlight.js
      built_in: forcedStyle.cyan,
      type: forcedStyle.cyan.dim,
      literal: forcedStyle.blue,
      number: forcedStyle.green,
      regexp: forcedStyle.red,
      string: forcedStyle.red,
    };

    const code = `function hello() {
    console.log("Hello, world!");
}`;
    const result = highlight(code, {
      language: "javascript",
      theme: forcedTheme,
    });

    // Result should contain ANSI escape codes for highlighting
    strictEqual(typeof result, "string");
    strictEqual(result.length > 0, true);
    // Should contain some ANSI codes
    strictEqual(result.includes("\u001B["), true);
  });

  it("should support language detection", () => {
    strictEqual(supportsLanguage("javascript"), true);
    strictEqual(supportsLanguage("typescript"), true);
    strictEqual(supportsLanguage("python"), true);
    strictEqual(supportsLanguage("nonexistent"), false);
  });

  it("should list available languages", () => {
    const languages = listLanguages();
    strictEqual(Array.isArray(languages), true);
    strictEqual(languages.length > 0, true);
    strictEqual(languages.includes("javascript"), true);
  });

  it("should auto-detect language", () => {
    const jsCode = `const test = "hello";`;
    const result = highlight(jsCode, { theme: DEFAULT_THEME });
    strictEqual(typeof result, "string");
    strictEqual(result.length > 0, true);
  });

  it("should handle plain text without highlighting", () => {
    const plainText = "Just some plain text";
    const result = highlight(plainText, {
      language: "plaintext",
      theme: DEFAULT_THEME,
    });
    strictEqual(typeof result, "string");
    strictEqual(result.length > 0, true);
  });
});
