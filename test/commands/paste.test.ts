import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  detectImageFormatFromBase64,
  extractBase64Content,
  extractMimeTypeFromDataUrl,
  isValidBase64,
} from "../../source/commands/paste/utils.ts";

describe("paste/utils.ts", () => {
  describe("extractBase64Content", () => {
    it("extracts base64 content from data URL", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = extractBase64Content(dataUrl);
      assert.strictEqual(
        result,
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      );
    });

    it("handles data URL without prefix", () => {
      const result = extractBase64Content(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
      );
      assert.strictEqual(
        result,
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
      );
    });
  });

  describe("isValidBase64", () => {
    it("returns true for valid base64", () => {
      const result = isValidBase64("data:image/png;base64,SGVsbG8gV29ybGQh");
      assert.strictEqual(result, true);
    });

    it("returns false for invalid base64", () => {
      const result = isValidBase64(
        "data:image/png;base64,!!!invalid-base64!!!",
      );
      assert.strictEqual(result, false);
    });

    it("handles base64 without data URL prefix", () => {
      const result = isValidBase64("SGVsbG8gV29ybGQh");
      assert.strictEqual(result, true);
    });

    it("handles empty string", () => {
      const result = isValidBase64("");
      assert.strictEqual(result, true);
    });
  });

  describe("detectImageFormatFromBase64", () => {
    it("detects JPEG format", () => {
      const jpegHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      ]);
      const base64 = jpegHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/jpeg");
    });

    it("detects PNG format", () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const base64 = pngHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/png");
    });

    it("detects GIF87a format", () => {
      const gifHeader = Buffer.from("GIF87a");
      const base64 = gifHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/gif");
    });

    it("detects GIF89a format", () => {
      const gifHeader = Buffer.from("GIF89a");
      const base64 = gifHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/gif");
    });

    it("detects WebP format", () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const base64 = webpHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/webp");
    });

    it("detects BMP format", () => {
      const bmpHeader = Buffer.from([0x42, 0x4d]);
      const base64 = bmpHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/bmp");
    });

    it("detects TIFF little-endian format", () => {
      const tiffHeader = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
      const base64 = tiffHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/tiff");
    });

    it("detects TIFF big-endian format", () => {
      const tiffHeader = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
      const base64 = tiffHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "image/tiff");
    });

    it("returns unknown for unrecognized format", () => {
      const unknownHeader = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const base64 = unknownHeader.toString("base64");
      const result = detectImageFormatFromBase64(base64);
      assert.strictEqual(result, "unknown");
    });

    it("handles empty string", () => {
      const result = detectImageFormatFromBase64("");
      assert.strictEqual(result, "unknown");
    });
  });

  describe("extractMimeTypeFromDataUrl", () => {
    it("extracts MIME type from data URL", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = extractMimeTypeFromDataUrl(dataUrl);
      assert.strictEqual(result, "image/png");
    });

    it("extracts JPEG MIME type", () => {
      const dataUrl =
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==";
      const result = extractMimeTypeFromDataUrl(dataUrl);
      assert.strictEqual(result, "image/jpeg");
    });

    it("returns default for invalid data URL", () => {
      const result = extractMimeTypeFromDataUrl("invalid-string");
      assert.strictEqual(result, "image/png");
    });

    it("handles data URL without MIME type", () => {
      const result = extractMimeTypeFromDataUrl("data:;base64,SGVsbG8=");
      assert.strictEqual(result, "image/png");
    });
  });
});
