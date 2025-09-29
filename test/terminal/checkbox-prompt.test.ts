import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CheckboxOptions,
  type Choice,
  checkbox,
} from "../../source/terminal/checkbox-prompt.ts";

describe("checkbox prompt", () => {
  it("should export the checkbox function", () => {
    assert.strictEqual(typeof checkbox, "function");
  });

  it("should have correct types", () => {
    const options: CheckboxOptions<string> = {
      message: "Test message",
      choices: ["option1", "option2"],
    };

    const complexOptions: CheckboxOptions<number> = {
      message: "Test message",
      choices: [
        { name: "Option 1", value: 1 },
        { name: "Option 2", value: 2, checked: true },
        { name: "Option 3", value: 3, disabled: true },
      ],
    };

    assert.strictEqual(options.message, "Test message");
    assert.strictEqual(complexOptions.choices.length, 3);
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
});
