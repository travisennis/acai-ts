import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { clearCommand } from "../../source/commands/clear/index.ts";
import type { CommandOptions } from "../../source/commands/types.ts";
import { fromAny } from "../utils/mocking.ts";

describe("clearCommand", () => {
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
      getModel: () => "",
      listModels: () => [],
    }),
    sessionManager: fromAny({
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => {},
      restore: () => {},
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
    const mockTui = fromAny({
      requestRender: () => {},
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
