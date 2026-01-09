import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { saveCommand } from "../../source/commands/save/index.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("saveCommand", () => {
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
      getModel: () => "",
      listModels: () => [],
    } as any,
    sessionManager: {
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => Promise.resolve(),
      restore: () => {},
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
    const command = saveCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/save");
    assert.equal(command.description, "Saves the chat history.");
  });

  it("should have correct command properties", () => {
    const command = saveCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/save");
    assert.equal(command.description, "Saves the chat history.");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called", async () => {
    const command = saveCommand(mockOptions);

    const mockTui = {
      requestRender: () => {},
    } as any;
    const mockContainer = {
      addChild: () => {},
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
