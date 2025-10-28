import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyCommand } from "../../source/commands/history-command.ts";
import { createMockCommandOptions } from "../utils/mocking.ts";

describe("historyCommand", () => {
  it("should create a command with correct properties", () => {
    const mockOptions = createMockCommandOptions();

    const command = historyCommand(mockOptions);

    assert.equal(command.command, "/history");
    assert.equal(
      command.description,
      "Browse and manage previous conversations.",
    );
    assert.equal(typeof command.execute, "function");
    assert.equal(typeof command.getSubCommands, "function");
  });
});
