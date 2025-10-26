import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { config } from "../../source/config.ts";
import { createBashTool } from "../../source/tools/bash.ts";
import { validatePaths } from "../../source/tools/bash-utils.ts";
import { createMockTokenCounter } from "../utils/mocking.ts";

const tokenCounter = createMockTokenCounter((s: string) => s.length);

await config.readProjectConfig();

const baseDir = process.cwd();

describe("bash tool path validation for git message flags", async () => {
  const tool = await createBashTool({
    baseDir,
    tokenCounter,
  });

  async function run(command: string) {
    const generator = tool.execute(
      { command, cwd: baseDir, timeout: 1000 },
      { toolCallId: "t1", messages: [] },
    );

    let finalResult = "";
    for await (const value of generator) {
      if (typeof value === "string") {
        finalResult = value;
      }
    }
    return finalResult;
  }

  it("allows commit messages with /copy", async () => {
    const res = await run('echo ok && git commit -m "docs: mention /copy"');
    assert.ok(!res.includes("references path outside"));
  });

  it("allows URLs in messages", async () => {
    const res = await run('git commit -m "URL https://example.com/p/a/t/h"');
    assert.ok(!res.includes("references path outside"));
  });

  it("rejects absolute path in git add", async () => {
    const res = await run("git add /etc/hosts");
    assert.ok(res.includes("resolves outside the allowed directories"));
  });

  it("rejects commit -F with file outside", async () => {
    const res = await run("git commit -F /tmp/message.txt");
    assert.ok(res.includes("resolves outside the allowed directories"));
  });

  it("handles multiple -m flags", async () => {
    const res = await run('git commit -m "first /copy" -m "second /path"');
    assert.ok(!res.includes("references path outside"));
  });
});

describe("bash tool allowed paths access", async () => {
  const tool = await createBashTool({
    baseDir,
    tokenCounter,
  });

  async function run(command: string) {
    const generator = tool.execute(
      { command, cwd: baseDir, timeout: 1000 },
      { toolCallId: "t1", messages: [] },
    );

    let finalResult = "";
    for await (const value of generator) {
      if (typeof value === "string") {
        finalResult = value;
      }
    }
    return finalResult;
  }

  it("allows access to configured allowed paths", async () => {
    const projectConfig = await config.readProjectConfig();
    const logPath = projectConfig.logs?.path;

    if (!logPath) {
      // Skip test if no log path is configured
      console.info("No log path configured, skipping test");
      return;
    }

    // Ensure the log file exists for testing
    try {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.writeFile(logPath, "test log content\n", "utf8");
    } catch (error) {
      console.info("Could not create test log file:", error);
      return;
    }

    try {
      // Test reading the log file
      const res = await run(`cat "${logPath}"`);
      assert.ok(!res.includes("resolves outside the allowed directories"));
      assert.ok(res.includes("test log content"));
    } finally {
      // Clean up test file
      try {
        await fs.unlink(logPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("rejects access to other files outside project directory", async () => {
    const res = await run("cat /etc/hosts");
    assert.ok(res.includes("resolves outside the allowed directories"));
  });

  it("allows access to multiple allowed paths", async () => {
    // Test the validatePaths function directly with multiple allowed paths
    const result = validatePaths(
      "cat /tmp/test1.txt /tmp/test2.txt",
      [baseDir],
      baseDir,
      ["/tmp/test1.txt", "/tmp/test2.txt"],
    );
    assert.strictEqual(result.isValid, true);
  });

  it("rejects access to paths not in allowed list", async () => {
    // Test the validatePaths function directly with specific allowed paths
    const result = validatePaths(
      "cat /tmp/test1.txt /tmp/test3.txt",
      [baseDir],
      baseDir,
      ["/tmp/test1.txt", "/tmp/test2.txt"],
    );
    assert.strictEqual(result.isValid, false);
    assert.ok(
      result.error?.includes("resolves outside the allowed directories"),
    );
  });
});

describe("bash tool abort signal handling", async () => {
  it("aborts execution on signal", async () => {
    const ac = new AbortController();
    const tool = await createBashTool({
      baseDir,
      tokenCounter,
    });
    ac.abort();
    const { execute } = tool;
    const generator = execute(
      { command: "sleep 10", cwd: null, timeout: null },
      { toolCallId: "t1", abortSignal: ac.signal, messages: [] },
    );

    let finalResult = "";
    for await (const value of generator) {
      if (typeof value === "string") {
        finalResult = value;
      }
    }
    assert.match(finalResult, /aborted/);
  });
});
