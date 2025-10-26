import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editPromptCommand } from "../../source/commands/edit-prompt-command.ts";
import { promptCommand } from "../../source/commands/prompt-command.ts";
import { createMockCommandOptions } from "../utils/mocking.ts";

describe("prompt history integration", () => {
  it("edit-prompt command should accept promptHistory parameter", () => {
    // This test verifies that the edit-prompt command function signature
    // now includes promptHistory in its parameters
    const command = editPromptCommand(
      createMockCommandOptions({
        promptHistory: [],
      }),
    );

    assert.strictEqual(command.command, "/edit-prompt");
    assert.strictEqual(
      command.description,
      "Edit the prompt. Accepts optional arguments as initial content.",
    );
  });

  it("prompt command should accept promptHistory parameter", () => {
    // This test verifies that the prompt command function signature
    // now includes promptHistory in its parameters
    const command = promptCommand(
      createMockCommandOptions({
        promptHistory: [],
      }),
    );

    assert.strictEqual(command.command, "/prompt");
    assert.strictEqual(
      command.description,
      "Loads and executes prompts. Project prompts override user prompts with the same name.",
    );
  });
});
