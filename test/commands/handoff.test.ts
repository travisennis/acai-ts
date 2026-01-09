import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  generateHandoffFilename,
  generateHandoffSlug,
  handoffPrompt,
} from "../../source/commands/handoff/utils.ts";

describe("handoff/utils.ts", () => {
  describe("handoffPrompt", () => {
    it("should return a non-empty string", () => {
      const result = handoffPrompt("test purpose");
      assert.ok(result.length > 0, "Prompt should not be empty");
    });

    it("should include the purpose in the prompt", () => {
      const purpose = "my test purpose";
      const result = handoffPrompt(purpose);
      assert.ok(result.includes(purpose), "Prompt should include the purpose");
    });

    it("should contain analysis tags", () => {
      const result = handoffPrompt("test");
      assert.ok(result.includes("<analysis>"), "Should contain analysis tags");
      assert.ok(
        result.includes("</analysis>"),
        "Should contain closing analysis tags",
      );
    });

    it("should contain plan tags", () => {
      const result = handoffPrompt("test");
      assert.ok(result.includes("<plan>"), "Should contain plan tags");
      assert.ok(result.includes("</plan>"), "Should contain closing plan tags");
    });

    it("should mention Primary Request and Intent section", () => {
      const result = handoffPrompt("test");
      assert.ok(
        result.includes("Primary Request and Intent"),
        "Should mention Primary Request section",
      );
    });

    it("should mention Key Technical Concepts section", () => {
      const result = handoffPrompt("test");
      assert.ok(
        result.includes("Key Technical Concepts"),
        "Should mention Key Technical Concepts section",
      );
    });

    it("should mention Files and Code Sections section", () => {
      const result = handoffPrompt("test");
      assert.ok(
        result.includes("Files and Code Sections"),
        "Should mention Files and Code Sections section",
      );
    });

    it("should mention slug creation", () => {
      const result = handoffPrompt("test");
      assert.ok(result.includes("slug"), "Should mention slug creation");
    });
  });

  describe("generateHandoffSlug", () => {
    it("should convert to lowercase", () => {
      const result = generateHandoffSlug("My Test Purpose");
      assert.strictEqual(result, "my-test-purpose");
    });

    it("should remove special characters", () => {
      const result = generateHandoffSlug("Test @#$% Purpose!");
      assert.strictEqual(result, "test-purpose");
    });

    it("should replace spaces with hyphens", () => {
      const result = generateHandoffSlug("test purpose here");
      assert.strictEqual(result, "test-purpose-here");
    });

    it("should limit to maxLength characters", () => {
      const result = generateHandoffSlug(
        "this is a very long purpose that should be truncated",
        10,
      );
      assert.ok(
        result.length <= 10,
        `Slug should be <= 10 chars, got ${result.length}`,
      );
    });

    it("should default to session if empty after processing", () => {
      const result = generateHandoffSlug("!!!");
      assert.strictEqual(result, "session");
    });

    it("should handle multiple consecutive hyphens", () => {
      const result = generateHandoffSlug("test   purpose");
      assert.strictEqual(result, "test-purpose");
    });

    it("should trim leading and trailing hyphens", () => {
      const result = generateHandoffSlug("-test purpose-");
      assert.strictEqual(result, "test-purpose");
    });

    it("should use default maxLength of 20", () => {
      const longPurpose = "a".repeat(50);
      const result = generateHandoffSlug(longPurpose);
      assert.strictEqual(result.length, 20);
    });
  });

  describe("generateHandoffFilename", () => {
    it("should return a .md file", () => {
      const result = generateHandoffFilename("test-slug");
      assert.ok(result.endsWith(".md"), "Should end with .md");
    });

    it("should include the slug in the filename", () => {
      const result = generateHandoffFilename("my-slug");
      assert.ok(result.includes("my-slug"), "Should include the slug");
    });

    it("should include a date in ISO format", () => {
      const result = generateHandoffFilename("test");
      const datePattern = /\d{4}-\d{2}-\d{2}/;
      assert.ok(datePattern.test(result), "Should include ISO date");
    });

    it("should match expected filename format", () => {
      const result = generateHandoffFilename("my-slug");
      assert.ok(
        /^\d{4}-\d{2}-\d{2}-my-slug\.md$/.test(result),
        "Should match expected format",
      );
    });
  });
});
