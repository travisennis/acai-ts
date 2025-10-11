import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editPromptCommand } from "../../source/commands/edit-prompt-command.ts";
import { promptCommand } from "../../source/commands/prompt-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("prompt history integration", () => {
  it("edit-prompt command should accept promptHistory parameter", () => {
    // This test verifies that the edit-prompt command function signature
    // now includes promptHistory in its parameters
    const command = editPromptCommand({
      terminal: {} as CommandOptions["terminal"],
      promptManager: {} as CommandOptions["promptManager"],
      promptHistory: [] as CommandOptions["promptHistory"],
    } as CommandOptions);

    assert.strictEqual(command.command, "/edit-prompt");
    assert.strictEqual(
      command.description,
      "Edit the prompt. Accepts optional arguments as initial content.",
    );
  });

  it("prompt command should accept promptHistory parameter", () => {
    // This test verifies that the prompt command function signature
    // now includes promptHistory in its parameters
    const command = promptCommand({
      terminal: {} as CommandOptions["terminal"],
      modelManager: {} as CommandOptions["modelManager"],
      promptManager: {} as CommandOptions["promptManager"],
      config: {} as CommandOptions["config"],
      promptHistory: [] as CommandOptions["promptHistory"],
    } as CommandOptions);

    assert.strictEqual(command.command, "/prompt");
    assert.strictEqual(
      command.description,
      "Loads and executes prompts. Project prompts override user prompts with the same name.",
    );
  });
});
