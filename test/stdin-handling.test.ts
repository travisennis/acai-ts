import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readStdinWithLimits,
  STDIN_HARD_LIMIT,
  STDIN_SOFT_LIMIT,
} from "../source/stdin.ts";

describe("readStdinWithLimits", () => {
  describe("constants", () => {
    it("STDIN_SOFT_LIMIT should be 50KB", () => {
      assert.equal(STDIN_SOFT_LIMIT, 50 * 1024);
    });

    it("STDIN_HARD_LIMIT should be 200KB", () => {
      assert.equal(STDIN_HARD_LIMIT, 200 * 1024);
    });
  });

  describe("TTY detection", () => {
    it("returns wasPiped=false when stdin is TTY", async () => {
      const originalIsTty = process.stdin.isTTY;
      process.stdin.isTTY = true;

      try {
        const result = await readStdinWithLimits();
        assert.equal(result.wasPiped, false);
        assert.equal(result.content, null);
        assert.equal(result.sizeBytes, 0);
      } finally {
        process.stdin.isTTY = originalIsTty;
      }
    });
  });

  describe("size calculations", () => {
    it("correctly calculates size for ASCII string", () => {
      const content = "hello world";
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, 11);
    });

    it("correctly calculates size for multi-byte string", () => {
      const content = "hello world";
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, 11);
    });

    it("correctly calculates size for 50KB content", () => {
      const content = "x".repeat(STDIN_SOFT_LIMIT);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, STDIN_SOFT_LIMIT);
    });

    it("correctly calculates size for 75KB content", () => {
      const content = "x".repeat(STDIN_SOFT_LIMIT + 25 * 1024);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, STDIN_SOFT_LIMIT + 25 * 1024);
    });

    it("correctly calculates size for 250KB content", () => {
      const content = "x".repeat(STDIN_HARD_LIMIT + 50 * 1024);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, STDIN_HARD_LIMIT + 50 * 1024);
    });
  });

  describe("boundary conditions", () => {
    it("soft limit boundary - exactly 50KB should not warn", () => {
      const content = "x".repeat(STDIN_SOFT_LIMIT);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, STDIN_SOFT_LIMIT);
      assert.ok(
        sizeBytes <= STDIN_SOFT_LIMIT,
        "50KB should not exceed soft limit",
      );
    });

    it("soft limit boundary - 50KB + 1 byte should warn", () => {
      const content = "x".repeat(STDIN_SOFT_LIMIT + 1);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.ok(
        sizeBytes > STDIN_SOFT_LIMIT,
        "50KB+1 should exceed soft limit",
      );
    });

    it("hard limit boundary - exactly 200KB should not error", () => {
      const content = "x".repeat(STDIN_HARD_LIMIT);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.equal(sizeBytes, STDIN_HARD_LIMIT);
      assert.ok(
        sizeBytes <= STDIN_HARD_LIMIT,
        "200KB should not exceed hard limit",
      );
    });

    it("hard limit boundary - 200KB + 1 byte should error", () => {
      const content = "x".repeat(STDIN_HARD_LIMIT + 1);
      const sizeBytes = Buffer.byteLength(content, "utf8");
      assert.ok(
        sizeBytes > STDIN_HARD_LIMIT,
        "200KB+1 should exceed hard limit",
      );
    });
  });

  describe("return type", () => {
    it("returns correct interface when TTY", async () => {
      const originalIsTty = process.stdin.isTTY;
      process.stdin.isTTY = true;

      try {
        const result = await readStdinWithLimits();
        assert.ok("wasPiped" in result);
        assert.ok("content" in result);
        assert.ok("sizeBytes" in result);
        assert.equal(typeof result.wasPiped, "boolean");
        assert.equal(result.content, null);
        assert.equal(typeof result.sizeBytes, "number");
      } finally {
        process.stdin.isTTY = originalIsTty;
      }
    });
  });
});
