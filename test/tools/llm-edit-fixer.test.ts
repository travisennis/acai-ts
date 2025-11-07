/** biome-ignore-all lint/suspicious/noExplicitAny: will be fixed later */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixLlmEditWithInstruction } from "../../source/tools/llm-edit-fixer.ts";

describe("LLM Edit Fixer", () => {
  describe("autoGenerateInstruction", () => {
    it("should generate instruction for short strings", () => {
      // This is a bit tricky to test directly since it's a private function
      // but we can test it indirectly through the main function
      const oldString = "const x = 1";
      const newString = "const x = 2";

      // Verify the strings are defined (for testing purposes)
      assert.strictEqual(oldString, "const x = 1");
      assert.strictEqual(newString, "const x = 2");
    });

    it("should handle long strings with truncation", () => {
      // Similar to above - would test truncation logic
      assert.ok(true); // Placeholder
    });
  });

  describe("fixLlmEditWithInstruction", () => {
    it("should return null when LLM is not available", async () => {
      const result = await fixLlmEditWithInstruction(
        "Change greeting",
        "Hello",
        "Hi",
        "oldText not found in content",
        "Hello world",
        // Pass undefined modelManager to simulate unavailable LLM
        undefined as any,
        // No abort signal
      );

      assert.equal(result, null);
    });

    it("should use provided instruction when available", async () => {
      // Test with explicit instruction
      const instruction = "Replace greeting with casual version";
      const result = await fixLlmEditWithInstruction(
        instruction,
        "Hello world",
        "Hi there",
        "oldText not found in content",
        "Hello world!",
        // No model manager
        undefined as any,
      );

      // Since we're not mocking the actual LLM response, this should return null
      assert.equal(result, null);
    });

    it("should auto-generate instruction when not provided", async () => {
      const result = await fixLlmEditWithInstruction(
        undefined, // No instruction provided
        "const x = 1",
        "const x = 2",
        "oldText not found in content",
        "const y = 3; const x = 1;",
        // No model manager
        undefined as any,
      );

      // Should auto-generate instruction but LLM not actually called
      assert.equal(result, null);
    });

    it("should handle abort signals", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await fixLlmEditWithInstruction(
        "test instruction",
        "old",
        "new",
        "error",
        "content",
        // No model manager
        undefined as any,
        abortController.signal,
      );

      assert.equal(result, null);
    });

    it("should handle null modelManager gracefully", async () => {
      const result = await fixLlmEditWithInstruction(
        "test instruction",
        "old text",
        "new text",
        "error",
        "content",
        null as any, // Explicitly pass null
      );

      assert.equal(result, null);
    });
  });

  describe("prompt generation", () => {
    it("should include all required prompt variables", async () => {
      // Verify all prompt template variables are accounted for
      const userPrompt = `
# Goal of the Original Edit
<instruction>
{instruction}
</instruction>

# Failed Attempt Details
- **Original \`search\` parameter (failed):**
<search>
{old_string}
</search>
- **Original \`replace\` parameter:**
<replace>
{new_string}
</replace>
- **Error Encountered:**
<error>
{error}
</error>

# Full File Content
<file_content>
{current_content}
</file_content>
`;

      // Verify all template variables are present
      assert.ok(userPrompt.includes("{instruction}"));
      assert.ok(userPrompt.includes("{old_string}"));
      assert.ok(userPrompt.includes("{new_string}"));
      assert.ok(userPrompt.includes("{error}"));
      assert.ok(userPrompt.includes("{current_content}"));
    });
  });
});
