import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyCommand } from "../../source/commands/history-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("historyCommand", () => {
  it("should create a command with correct properties", () => {
    // Use type assertion for test mocks
    const mockOptions = {
      promptManager: {},
      modelManager: {},
      terminal: {},
      messageHistory: {},
      tokenTracker: {},
      config: {},
      tokenCounter: {},
      toolExecutor: undefined,
      promptHistory: [],
      workspace: {},
    } as unknown as CommandOptions;

    const command = historyCommand(mockOptions);

    assert.equal(command.command, "/history");
    assert.equal(
      command.description,
      "Browse and resume previous conversations.",
    );
    assert.equal(typeof command.execute, "function");
    assert.equal(typeof command.getSubCommands, "function");
  });
});
