import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMetadata } from "../source/models/providers.ts";
import { processPrompt } from "../source/prompts/mentions.ts";

const mockModel: ModelMetadata = {
  id: "openai:gpt-4.1",
  provider: "openai",
  promptFormat: "markdown",
  contextWindow: 128000,
  maxOutputTokens: 4096,
  defaultTemperature: 0.7,
  supportsToolCalling: true,
  supportsReasoning: false,
  costPerInputToken: 0.00003,
  costPerOutputToken: 0.00006,
};

describe("mentions", () => {
  describe("processPrompt", () => {
    it("should not execute shell commands in prompts", async () => {
      const message = "Run this command: !`echo hello`";

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
      });

      assert.equal(result.message, message);
      assert.equal(result.context.length, 0);
    });

    it("should process file mentions successfully", async () => {
      const message = "Check this file: @package.json";

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
      });

      assert.ok(result.message.includes("package.json"));
      assert.ok(result.context.length > 0);
    });

    it("should expand paste placeholders when pasteStore is provided", async () => {
      const message =
        "Here is some text [Paste #1, 100 characters] and more [Paste #2, 50 characters]";
      const pasteStore = new Map([
        [
          1,
          "This is the first paste content that is exactly 100 characters long to test the placeholder functionality",
        ],
        [2, "Second paste content"],
      ]);

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
        pasteStore,
      });

      assert.ok(result.message.includes("This is the first paste content"));
      assert.ok(result.message.includes("Second paste content"));
      assert.ok(!result.message.includes("[Paste #1"));
      assert.ok(!result.message.includes("[Paste #2"));
    });

    it("should handle missing paste IDs gracefully", async () => {
      const message =
        "Here is some text [Paste #1, 100 characters] and [Paste #3, 50 characters]";
      const pasteStore = new Map([[1, "First paste content"]]);

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
        pasteStore,
      });

      assert.ok(result.message.includes("First paste content"));
      assert.ok(result.message.includes("[Paste #3"));
    });

    it("should not process paste placeholders when pasteStore is empty", async () => {
      const message = "Here is some text [Paste #1, 100 characters]";

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
      });

      assert.ok(result.message.includes("[Paste #1"));
    });

    it("should handle recursive paste placeholders", async () => {
      const message = "Here is some text [Paste #1, 100 characters]";
      const pasteStore = new Map([
        [1, "This text contains [Paste #2, 20 characters] inside"],
        [2, "nested paste content"],
      ]);

      const result = await processPrompt(message, {
        baseDir: ".",
        model: mockModel,
        pasteStore,
      });

      assert.ok(result.message.includes("This text contains"));
      assert.ok(result.message.includes("nested paste content"));
      assert.ok(!result.message.includes("[Paste #1"));
      assert.ok(!result.message.includes("[Paste #2"));
    });
  });
});
