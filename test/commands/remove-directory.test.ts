import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { removeDirectoryCommand } from "../../source/commands/remove-directory/index.ts";
import type { WorkspaceContext } from "../../source/index.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("removeDirectoryCommand", () => {
  it("should be defined", () => {
    const command = removeDirectoryCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/remove-directory");
    assert.equal(
      command.description,
      "Remove a directory from the list of allowed working directories",
    );
  });

  it("should have correct command properties", () => {
    const command = removeDirectoryCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/remove-directory");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called without path", async () => {
    const command = removeDirectoryCommand(createMockCommandOptions());

    const result = await command.handle([], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.equal(result, "continue");
  });

  it("should remove directory from workspace when valid path provided", async () => {
    const workspace: WorkspaceContext = {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp", "/usr", "/opt"],
    };

    const command = removeDirectoryCommand({
      ...createMockCommandOptions(),
      workspace,
    });

    await command.handle(["/usr"], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.ok(!workspace.allowedDirs.includes("/usr"));
    assert.deepStrictEqual(workspace.allowedDirs, ["/tmp", "/opt"]);
  });

  it("should not remove primary directory", async () => {
    const workspace: WorkspaceContext = {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp", "/usr"],
    };

    const command = removeDirectoryCommand({
      ...createMockCommandOptions(),
      workspace,
    });

    await command.handle(["/tmp"], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.ok(workspace.allowedDirs.includes("/tmp"));
    assert.deepStrictEqual(workspace.allowedDirs, ["/tmp", "/usr"]);
  });

  it("should not remove non-existent directory", async () => {
    const workspace: WorkspaceContext = {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp", "/usr"],
    };

    const command = removeDirectoryCommand({
      ...createMockCommandOptions(),
      workspace,
    });

    await command.handle(["/nonexistent"], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.deepStrictEqual(workspace.allowedDirs, ["/tmp", "/usr"]);
  });
});
