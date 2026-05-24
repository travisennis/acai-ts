import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("tools command - make", () => {
  let tmpDir: string;
  let mockContainer: ReturnType<typeof createMockContainer>;
  let mockTui: ReturnType<typeof createMockTui>;
  let mockEditor: ReturnType<typeof createMockEditor>;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "acai-tools-test-"));
    mockContainer = createMockContainer();
    mockTui = createMockTui();
    mockEditor = createMockEditor();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function getCommand() {
    const { toolsCommand } = await import(
      "../../source/commands/tools/index.ts"
    );
    const options = createMockCommandOptions({
      workspace: { primaryDir: tmpDir, allowedDirs: [tmpDir] },
    });
    return toolsCommand(options);
  }

  function createHandlerArgs() {
    return {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    };
  }

  it("should create a bash tool file by default", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "my-tool"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(tmpDir, ".acai", "tools", "my-tool.sh");
    assert.ok(fs.existsSync(toolPath));
    const content = fs.readFileSync(toolPath, "utf-8");
    assert.ok(content.includes("#!/bin/bash"));
  });

  it("should create a bash tool with --bash flag", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "bash-tool", "--bash"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(tmpDir, ".acai", "tools", "bash-tool.sh");
    assert.ok(fs.existsSync(toolPath));
  });

  it("should create a zsh tool with --zsh flag", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "zsh-tool", "--zsh"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(tmpDir, ".acai", "tools", "zsh-tool.zsh");
    assert.ok(fs.existsSync(toolPath));
  });

  it("should create a node tool with --node flag", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "node-tool", "--node"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(tmpDir, ".acai", "tools", "node-tool.mjs");
    assert.ok(fs.existsSync(toolPath));
  });

  it("should create text tool files with --text flag", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "text-tool", "--text"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const schemaPath = path.join(tmpDir, ".acai", "tools", "text-tool.tool");
    const companionPath = path.join(tmpDir, ".acai", "tools", "text-tool.sh");
    assert.ok(fs.existsSync(schemaPath));
    assert.ok(fs.existsSync(companionPath));
  });

  it("should return an error when tool name is empty", async () => {
    const command = await getCommand();
    const result = await command.handle(["make"], createHandlerArgs());

    assert.equal(result, "continue");
    // Should have added a child text node for the error
    assert.ok(mockContainer.addChild.mock.calls.length > 0);
  });

  it("should return an error when tool name is invalid", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "invalid name!"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    // Should have added a child text node for the error
    assert.ok(mockContainer.addChild.mock.calls.length > 0);
  });

  it("should use custom description when provided", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "desc-tool", "--description", "Custom description"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(tmpDir, ".acai", "tools", "desc-tool.sh");
    assert.ok(fs.existsSync(toolPath));
    const content = fs.readFileSync(toolPath, "utf-8");
    assert.ok(content.includes("Custom description"));
  });

  it("should use custom directory when --dir is provided", async () => {
    const command = await getCommand();
    const customDir = path.join(tmpDir, "custom-tools");
    const result = await command.handle(
      ["make", "custom-dir-tool", "--dir", customDir],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    const toolPath = path.join(customDir, "custom-dir-tool.sh");
    assert.ok(fs.existsSync(toolPath));
  });

  it("should report an error when tool file already exists", async () => {
    // Create the tool directory and file first
    const toolDir = path.join(tmpDir, ".acai", "tools");
    await fsp.mkdir(toolDir, { recursive: true });
    const toolPath = path.join(toolDir, "existing-tool.sh");
    await fsp.writeFile(toolPath, "#!/bin/bash\necho hello", "utf-8");

    const command = await getCommand();
    const result = await command.handle(
      ["make", "existing-tool"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    // Should have added a child text node for the error
    assert.ok(mockContainer.addChild.mock.calls.length > 0);
  });

  it("should return continue and clear editor on success", async () => {
    const command = await getCommand();
    const result = await command.handle(
      ["make", "success-tool"],
      createHandlerArgs(),
    );

    assert.equal(result, "continue");
    assert.strictEqual(mockEditor.setText.mock.calls.length, 1);
    assert.strictEqual(mockTui.requestRender.mock.calls.length, 1);
  });
});
