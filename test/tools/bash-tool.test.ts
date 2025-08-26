import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../../source/config.ts";
import { createBashTool } from "../../source/tools/bash.ts";

// Minimal token counter mock
const tokenCounter = { count: (s: string) => s.length } as const;

await config.readProjectConfig();

const baseDir = process.cwd();

describe("bash tool path validation for git message flags", () => {
  const { bash } = createBashTool({
    baseDir,
    tokenCounter,
    autoAcceptAll: true,
  });

  async function run(command: string) {
    const toolImpl = bash as unknown as {
      execute: (
        args: { command: string; cwd: string; timeout: number },
        meta: { toolCallId: string },
      ) => Promise<string>;
    };
    const result = await toolImpl.execute(
      { command, cwd: baseDir, timeout: 1000 },
      { toolCallId: "t1" },
    );
    return String(result);
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
    assert.ok(res.includes("resolves outside the project directory"));
  });

  it("rejects commit -F with file outside", async () => {
    const res = await run("git commit -F /tmp/message.txt");
    assert.ok(res.includes("resolves outside the project directory"));
  });

  it("handles multiple -m flags", async () => {
    const res = await run('git commit -m "first /copy" -m "second /path"');
    assert.ok(!res.includes("references path outside"));
  });
});
