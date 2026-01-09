import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { addDirectoryCommand } from "../../source/commands/add-directory/index.ts";
import {
  resolveDirectoryPath,
  validateDirectory,
} from "../../source/commands/add-directory/utils.ts";
import type { WorkspaceContext } from "../../source/index.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("addDirectoryCommand", () => {
  it("should be defined", () => {
    const command = addDirectoryCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/add-directory");
    assert.equal(
      command.description,
      "Add a directory to the list of allowed working directories",
    );
  });

  it("should have correct command properties", () => {
    const command = addDirectoryCommand(createMockCommandOptions());

    assert.ok(command);
    assert.equal(command.command, "/add-directory");
    assert.strictEqual(typeof command.getSubCommands, "function");
  });

  it("should return continue when handle is called without path", async () => {
    const command = addDirectoryCommand(createMockCommandOptions());

    const result = await command.handle([], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.equal(result, "continue");
  });

  it("should add directory to workspace when valid path provided", async () => {
    const workspace = {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp"],
    };
    const command = addDirectoryCommand({
      ...createMockCommandOptions(),
      workspace: workspace as WorkspaceContext,
    });

    await command.handle(["/usr"], {
      tui: createMockTui(),
      container: createMockContainer(),
      inputContainer: createMockContainer(),
      editor: createMockEditor(),
    });

    assert.ok(workspace.allowedDirs.includes("/usr"));
  });
});

describe("addDirectoryUtils", () => {
  describe("resolveDirectoryPath", () => {
    it("should resolve relative path to absolute", () => {
      const result = resolveDirectoryPath("src");
      assert.ok(result.endsWith("src"));
    });

    it("should resolve home directory", () => {
      const result = resolveDirectoryPath("~/test");
      assert.ok(result.includes("test"));
    });
  });

  describe("validateDirectory", () => {
    it("should return true for valid directory", async () => {
      const result = await validateDirectory("/tmp");
      assert.equal(result, true);
    });

    it("should return false for non-existent path", async () => {
      const result = await validateDirectory("/nonexistent/path");
      assert.equal(result, false);
    });
  });
});
