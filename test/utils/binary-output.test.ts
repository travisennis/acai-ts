import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type BinarySaveResult,
  formatBinaryMessage,
  isBinaryOutput,
  saveBinaryOutput,
} from "../../source/utils/binary-output.ts";

describe("isBinaryOutput", () => {
  it("returns false for empty string", () => {
    assert.strictEqual(isBinaryOutput(""), false);
  });

  it("returns false for plain text", () => {
    assert.strictEqual(isBinaryOutput("Hello, world!"), false);
  });

  it("returns false for multiline text", () => {
    const multiline = `Line 1
Line 2
Line 3`;
    assert.strictEqual(isBinaryOutput(multiline), false);
  });

  it("returns false for text with tabs and newlines", () => {
    assert.strictEqual(isBinaryOutput("\t\tIndented\nNew line\r\nCRLF"), false);
  });

  it("returns false for UTF-8 text with emoji", () => {
    assert.strictEqual(isBinaryOutput("Hello 👋 世界 🌍"), false);
  });

  it("returns true for null byte", () => {
    assert.strictEqual(isBinaryOutput("text\0more"), true);
  });

  it("returns true for null byte at start", () => {
    assert.strictEqual(isBinaryOutput("\0binary"), true);
  });

  it("returns true for null byte at end", () => {
    assert.strictEqual(isBinaryOutput("binary\0"), true);
  });

  it("returns true for high ratio of control characters", () => {
    // Create string with many control characters (but no null)
    const binaryish = "\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F";
    assert.strictEqual(isBinaryOutput(binaryish), true);
  });

  it("returns false for normal text with some extended ASCII", () => {
    // Extended ASCII characters (128+) should be fine
    assert.strictEqual(isBinaryOutput("Café résumé naïve"), false);
  });

  it("returns false for JSON output", () => {
    const json = JSON.stringify({ key: "value", nested: { a: 1 } });
    assert.strictEqual(isBinaryOutput(json), false);
  });

  it("returns false for code output", () => {
    const code = `function hello() {
  console.log("Hello, world!");
}`;
    assert.strictEqual(isBinaryOutput(code), false);
  });
});

describe("saveBinaryOutput", () => {
  it("saves binary output to temp file", () => {
    const result = saveBinaryOutput("\x00\x01\x02\x03");

    assert.strictEqual(result.success, true);
    assert.ok(result.path);
    assert.ok(result.path?.startsWith("/tmp/acai/bash_binary_"));
    assert.strictEqual(result.size, 4);
    assert.ok(result.mimeType);

    // Cleanup
    if (result.path && existsSync(result.path)) {
      unlinkSync(result.path);
    }
  });

  it("detects MIME type for saved file", () => {
    // PNG header (partial)
    const pngHeader = "\x89PNG\r\n\x1a\n";
    const result = saveBinaryOutput(pngHeader);

    assert.strictEqual(result.success, true);
    // MIME type detection depends on `file` command being available
    assert.ok(result.mimeType);

    // Cleanup
    if (result.path && existsSync(result.path)) {
      unlinkSync(result.path);
    }
  });

  it("saves empty binary", () => {
    const result = saveBinaryOutput("");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.size, 0);

    // Cleanup
    if (result.path && existsSync(result.path)) {
      unlinkSync(result.path);
    }
  });
});

describe("formatBinaryMessage", () => {
  it("formats successful save result", () => {
    const result: BinarySaveResult = {
      success: true,
      path: "/tmp/acai/bash_binary_test",
      size: 1024,
      mimeType: "image/png",
    };

    const message = formatBinaryMessage(result);

    assert.ok(message.includes("📦 Binary output detected"));
    assert.ok(message.includes("**Size:** 1.0 KB"));
    assert.ok(message.includes("**Type:** image/png"));
    assert.ok(message.includes("**Saved to:** `/tmp/acai/bash_binary_test`"));
    assert.ok(message.includes("`file <path>`"));
    assert.ok(message.includes("`xxd <path>`"));
  });

  it("formats bytes correctly for small files", () => {
    const result: BinarySaveResult = {
      success: true,
      path: "/tmp/test",
      size: 512,
      mimeType: "application/octet-stream",
    };

    const message = formatBinaryMessage(result);
    assert.ok(message.includes("**Size:** 512 bytes"));
  });

  it("formats bytes correctly for MB files", () => {
    const result: BinarySaveResult = {
      success: true,
      path: "/tmp/test",
      size: 2.5 * 1024 * 1024,
      mimeType: "video/mp4",
    };

    const message = formatBinaryMessage(result);
    assert.ok(message.includes("**Size:** 2.5 MB"));
  });

  it("formats failed save result", () => {
    const result: BinarySaveResult = {
      success: false,
      error: "Permission denied",
    };

    const message = formatBinaryMessage(result);
    assert.ok(message.includes("⚠️ Binary output detected"));
    assert.ok(message.includes("Permission denied"));
  });
});
