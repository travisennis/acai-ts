import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { listToolsCommand } from "../../source/commands/list-tools/index.ts";
import type { ConfigManager } from "../../source/config.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("listToolsCommand", () => {
  it("should be defined", () => {
    const command = listToolsCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/list-tools");
    assert.equal(command.description, "List all available tools.");
    assert.deepStrictEqual(command.aliases, ["/lt"]);
  });

  it("should have correct command properties", () => {
    const command = listToolsCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/list-tools");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called", async () => {
    const command = listToolsCommand(createMockCommandOptions());

    const result = await command.handle([], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.equal(result, "continue");
  });

  it("should show modal when handle is called", async () => {
    const mockTui = createMockTui();
    const mockEditor = createMockEditor();
    const mockContainer = createMockContainer();

    const command = listToolsCommand({
      ...createMockCommandOptions(),
      config: {
        ...createMockCommandOptions().config,
        getConfig: async () => ({
          tools: {
            activeTools: undefined,
          },
        }),
      } as ConfigManager,
    });

    await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.strictEqual(mockTui.showModal.mock.calls.length, 1);
  });
});
