import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { listDirectoriesCommand } from "../../source/commands/list-directories/index.ts";
import type { WorkspaceContext } from "../../source/index.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("listDirectoriesCommand", () => {
  it("should be defined", () => {
    const command = listDirectoriesCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/list-directories");
    assert.equal(command.description, "List all allowed working directories");
  });

  it("should have correct command properties", () => {
    const command = listDirectoriesCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/list-directories");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should show modal with directories", async () => {
    const workspace: WorkspaceContext = {
      primaryDir: "/primary",
      allowedDirs: ["/primary", "/secondary", "/tertiary"],
    };

    const mockTui = createMockTui();
    const mockEditor = createMockEditor();
    const mockContainer = createMockContainer();

    const command = listDirectoriesCommand({
      ...createMockCommandOptions(),
      workspace,
    });

    await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.strictEqual(mockTui.showModal.mock.calls.length, 1);
  });

  it("should show empty message when no directories", async () => {
    const workspace: WorkspaceContext = {
      primaryDir: "/tmp",
      allowedDirs: [],
    };

    const mockTui = createMockTui();
    const mockEditor = createMockEditor();
    const mockContainer = createMockContainer();

    const command = listDirectoriesCommand({
      ...createMockCommandOptions(),
      workspace,
    });

    await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.strictEqual(mockTui.showModal.mock.calls.length, 1);
  });

  it("should return continue when handle is called", async () => {
    const command = listDirectoriesCommand(createMockCommandOptions());

    const result = await command.handle([], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.equal(result, "continue");
  });
});
