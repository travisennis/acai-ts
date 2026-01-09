import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resetCommand } from "../../source/commands/reset/index.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("resetCommand", () => {
  const mockOptions: CommandOptions = {
    promptManager: {
      set: () => {},
      get: () => "",
      addContext: () => {},
      clearContext: () => {},
      getContext: () => "",
      setSystemPrompt: () => {},
      getSystemPrompt: () => "",
    } as any,
    modelManager: {
      setModel: () => {},
      getModel: () => ({ modelId: "test-model" }),
      listModels: () => [],
    } as any,
    sessionManager: {
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => {},
      restore: () => {},
      create: () => {},
      isEmpty: () => false,
    } as any,
    tokenTracker: {
      track: () => {},
      getTotal: () => 0,
      reset: () => {},
    } as any,
    config: {
      get: () => ({}),
      set: () => {},
      save: () => {},
    } as any,
    tokenCounter: {
      count: () => 0,
    } as any,
    promptHistory: [],
    workspace: {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp"],
    } as any,
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

    const mockTui = {
      requestRender: () => {},
      children: [],
    } as any;
    const mockContainer = {
      clear: () => {},
    } as any;
    const mockEditor = {
      setText: () => {},
    } as any;

    const result = await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.equal(result, "continue");
  });
});
