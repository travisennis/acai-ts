import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Choice,
  type SearchOptions,
  search,
} from "../../source/terminal/search-prompt.ts";

describe("search prompt", () => {
  it("should export the search function", () => {
    assert.strictEqual(typeof search, "function");
  });

  it("should have correct types", () => {
    const options: SearchOptions<string> = {
      message: "Test message",
      source: async (input) => {
        return [
          { name: `Result 1 for ${input}`, value: "result1" },
          { name: `Result 2 for ${input}`, value: "result2" },
        ];
      },
    };

    assert.strictEqual(options.message, "Test message");
    assert.strictEqual(typeof options.source, "function");
  });

  it("should handle Choice type correctly", () => {
    const stringChoice: Choice<string> = "string choice";
    const objectChoice: Choice<number> = { name: "object choice", value: 42 };

    assert.strictEqual(typeof stringChoice, "string");
    assert.strictEqual(typeof objectChoice, "object");

    if (typeof objectChoice === "object") {
      assert.strictEqual(objectChoice.name, "object choice");
      assert.strictEqual(objectChoice.value, 42);
    }
  });

  it("should handle async source function", async () => {
    const source = async (input: string): Promise<Choice<string>[]> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return [{ name: `Result for ${input}`, value: `value-${input}` }];
    };

    const result = await source("test");
    assert.strictEqual(result.length, 1);

    // Handle the Choice type which can be string or object
    const choice = result[0];
    if (typeof choice === "string") {
      assert.fail("Expected object choice, got string");
    } else {
      assert.strictEqual(choice.name, "Result for test");
      assert.strictEqual(choice.value, "value-test");
    }
  });
});
