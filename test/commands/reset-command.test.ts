import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resetCommand } from "../../source/commands/reset/index.ts";
import type { CommandOptions } from "../../source/commands/types.ts";
import { fromAny } from "../utils/mocking.ts";

describe("resetCommand", () => {
  const mockOptions: CommandOptions = {
    promptManager: fromAny({
      set: () => {},
      get: () => "",
      addContext: () => {},
      clearContext: () => {},
      getContext: () => "",
      setSystemPrompt: () => {},
      getSystemPrompt: () => "",
    }),
    modelManager: fromAny({
      setModel: () => {},
      getModel: () => ({ modelId: "test-model" }),
      listModels: () => [],
    }),
    sessionManager: fromAny({
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => {},
      restore: () => {},
      create: () => {},
      isEmpty: () => false,
    }),
    tokenTracker: fromAny({
      track: () => {},
      getTotal: () => 0,
      reset: () => {},
    }),
    config: fromAny({
      get: () => ({}),
      set: () => {},
      save: () => {},
    }),
    tokenCounter: fromAny({
      count: () => 0,
    }),
    promptHistory: [],
    workspace: fromAny({
      primaryDir: "/tmp",
      allowedDirs: ["/tmp"],
    }),
  };

  it("should be defined", () => {
    const command = resetCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/reset");
    assert.deepStrictEqual(command.aliases, ["/new"]);
    assert.equal(
      command.description,
      "Saves the chat history and then resets it.",
    );
  });

  it("should have correct command properties", () => {
    const command = resetCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/reset");
    assert.deepStrictEqual(command.aliases, ["/new"]);
    assert.equal(
      command.description,
      "Saves the chat history and then resets it.",
    );
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called", async () => {
    const command = resetCommand(mockOptions);

    const mockTui = fromAny({
      requestRender: () => {},
      children: [],
    });
    const mockContainer = fromAny({
      clear: () => {},
    });
    const mockEditor = fromAny({
      setText: () => {},
    });

    const result = await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.equal(result, "continue");
  });
});
