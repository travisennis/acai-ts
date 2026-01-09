import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { clearCommand } from "../../source/commands/clear/index.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("clearCommand", () => {
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
      save: () => {},
      restore: () => {},
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
    const command = clearCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/clear");
    assert.equal(command.description, "Clears the terminal screen.");
  });

  it("should have correct command properties", () => {
    const command = clearCommand(mockOptions);

    assert.ok(command);
    assert.equal(command.command, "/clear");
    assert.equal(command.description, "Clears the terminal screen.");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called", async () => {
    const command = clearCommand(mockOptions);

    // We can't fully test the handle method without a full TUI setup,
    // but we can verify it exists and returns a promise
    const mockTui = {
      requestRender: () => {},
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
