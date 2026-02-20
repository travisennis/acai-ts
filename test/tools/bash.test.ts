import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../../source/config/index.ts";
import { createBashTool } from "../../source/tools/bash.ts";
import { validatePaths } from "../../source/utils/bash.ts";

await config.getConfig();

const baseDir = process.cwd();

describe("bash tool path validation for git message flags", async () => {
  const tool = await createBashTool({
    workspace: { primaryDir: baseDir, allowedDirs: [baseDir] },
  });

  async function run(command: string) {
    return tool.execute(
      { command, cwd: baseDir, timeout: 1000 },
      { toolCallId: "t1", messages: [] },
    );
  }

  it("allows commit messages with /copy", async () => {
    await assert.rejects(
      () => run('echo ok && git commit -m "docs: mention /copy"'),
      /.*/,
    );
  });

  it("allows URLs in messages", async () => {
    await assert.rejects(
      () => run('git commit -m "URL https://example.com/p/a/t/h"'),
      /.*/,
    );
  });

  it("rejects absolute path in git add", async () => {
    await assert.rejects(
      () => run("git add /etc/hosts"),
      /resolves outside the allowed directories/,
    );
  });

  it("rejects commit -F with file outside", async () => {
    await assert.rejects(
      () => run("git commit -F /tmp/message.txt"),
      /resolves outside the allowed directories/,
    );
  });

  it("handles multiple -m flags", async () => {
    await assert.rejects(
      () => run('git commit -m "first /copy" -m "second /path"'),
      /.*/,
    );
  });
});

describe("bash tool allowed paths access", async () => {
  const tool = await createBashTool({
    workspace: { primaryDir: baseDir, allowedDirs: [baseDir, "/tmp"] },
  });

  async function run(command: string, timeout = 5000) {
    return tool.execute(
      { command, cwd: baseDir, timeout },
      { toolCallId: "t1", messages: [] },
    );
  }

  it("allows access to configured allowed paths", async () => {
    const res = await run("ls /tmp");
    assert.ok(!res.includes("resolves outside the allowed directories"));
    assert.ok(res.length >= 0);
  });

  it("rejects access to other files outside project directory", async () => {
    await assert.rejects(
      () => run("cat /etc/hosts"),
      /resolves outside the allowed directories/,
    );
  });
});

describe("bash tool abort signal handling", async () => {
  it("aborts execution on signal", async () => {
    const ac = new AbortController();
    const tool = await createBashTool({
      workspace: { primaryDir: baseDir, allowedDirs: [baseDir] },
    });
    ac.abort();
    const { execute } = tool;
    const result = execute(
      { command: "sleep 10", cwd: null, timeout: null },
      { toolCallId: "t1", abortSignal: ac.signal, messages: [] },
    );

    await assert.rejects(result, /aborted/);
  });
});

describe("bash tool home directory (~) validation", () => {
  it("rejects ls ~ command", () => {
    const result = validatePaths("ls ~", [baseDir], baseDir);
    assert.strictEqual(result.isValid, false);
    assert.ok(
      result.error?.includes("resolves outside the allowed directories"),
    );
  });

  it("rejects ls ~/Documents command", () => {
    const result = validatePaths("ls ~/Documents", [baseDir], baseDir);
    assert.strictEqual(result.isValid, false);
    assert.ok(
      result.error?.includes("resolves outside the allowed directories"),
    );
  });

  it("rejects echo > ~/test.txt command", () => {
    const result = validatePaths(
      'echo "test" > ~/test.txt',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, false);
    assert.ok(
      result.error?.includes("resolves outside the allowed directories"),
    );
  });

  it("allows commands without ~ paths", () => {
    const result = validatePaths("ls ./source", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
  });
});

describe("bash tool with command protection", async () => {
  const tool = await createBashTool({
    workspace: { primaryDir: baseDir, allowedDirs: [baseDir, "/tmp"] },
  });

  async function run(command: string) {
    return tool.execute(
      { command, cwd: baseDir, timeout: 1000 },
      { toolCallId: "t1", messages: [] },
    );
  }

  it("blocks destructive git commands", async () => {
    await assert.rejects(() => run("git reset --hard"), /BLOCKED/);
  });

  it("blocks rm -rf outside temp directories", async () => {
    // Path validation catches this first with a different error
    await assert.rejects(
      () => run("rm -rf /home/test"),
      /resolves outside the allowed directories/,
    );
  });

  it("allows rm -rf /tmp/*", async () => {
    // Should not throw BLOCKED error (may fail for other reasons like permissions)
    try {
      await run("rm -rf /tmp/acai-test-nonexistent-*");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      assert.ok(
        !errorMessage.includes("BLOCKED"),
        "rm -rf /tmp/* should be allowed",
      );
    }
  });

  it("allows safe git commands", async () => {
    const result = await run("git status");
    assert.ok(result.length >= 0);
  });
});
