import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectImageFormatFromBase64,
  extractBase64Content,
  extractMimeTypeFromDataUrl,
  isValidBase64,
} from "../../../source/commands/paste/utils.ts";

describe("extractBase64Content", () => {
  it("strips data URL prefix", () => {
    assert.equal(
      extractBase64Content("data:image/png;base64,abc123"),
      "abc123",
    );
  });

  it("returns string unchanged if no data URL prefix", () => {
    assert.equal(extractBase64Content("abc123"), "abc123");
  });
});

describe("isValidBase64", () => {
  it("returns true for valid base64", () => {
    const valid = Buffer.from("hello world").toString("base64");
    assert.equal(isValidBase64(valid), true);
  });

  it("returns true for valid base64 data URL", () => {
    const valid = Buffer.from("hello world").toString("base64");
    assert.equal(isValidBase64(`data:text/plain;base64,${valid}`), true);
  });

  it("returns false for invalid base64", () => {
    assert.equal(isValidBase64("!!!not-base64!!!"), false);
  });
});

describe("detectImageFormatFromBase64", () => {
  it("detects JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/jpeg",
    );
  });

  it("detects PNG", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/png",
    );
  });

  it("detects GIF87a", () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/gif",
    );
  });

  it("detects GIF89a", () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/gif",
    );
  });

  it("detects WebP", () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/webp",
    );
  });

  it("detects BMP", () => {
    const buf = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/bmp",
    );
  });

  it("detects TIFF (little-endian)", () => {
    const buf = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/tiff",
    );
  });

  it("detects TIFF (big-endian)", () => {
    const buf = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "image/tiff",
    );
  });

  it("returns unknown for unrecognized format", () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    assert.equal(
      detectImageFormatFromBase64(buf.toString("base64")),
      "unknown",
    );
  });

  it("returns unknown for empty input", () => {
    assert.equal(detectImageFormatFromBase64(""), "unknown");
  });
});

describe("extractMimeTypeFromDataUrl", () => {
  it("extracts mime type from data URL", () => {
    assert.equal(
      extractMimeTypeFromDataUrl("data:image/jpeg;base64,abc"),
      "image/jpeg",
    );
  });

  it("defaults to image/png for non-matching input", () => {
    assert.equal(extractMimeTypeFromDataUrl("not-a-data-url"), "image/png");
  });
});
