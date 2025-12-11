import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, describe, it } from "node:test";
import { config } from "../../source/config.ts";
import { createBashTool } from "../../source/tools/bash.ts";
import { validatePaths } from "../../source/utils/bash.ts";
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
    allowedDirs: [baseDir, "/tmp"],
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
    // Test reading the log file
    const res = await run("ls /tmp");
    assert.ok(!res.includes("resolves outside the allowed directories"));
    assert.ok(res.length >= 0);
  });

  it("rejects access to other files outside project directory", async () => {
    const res = await run("cat /etc/hosts");
    assert.ok(res.includes("resolves outside the allowed directories"));
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

describe("bash tool mutating command warnings", async () => {
  const tool = await createBashTool({
    baseDir,
    tokenCounter,
  });

  after(() => {
    try {
      rmSync("test-file.txt");
    } catch {
      // Ignore if file doesn't exist
    }
  });

  async function collectEvents(command: string) {
    const generator = tool.execute(
      { command, cwd: baseDir, timeout: 100 },
      { toolCallId: "t1", messages: [] },
    );

    const events: Array<{ event: string; data: string }> = [];
    for await (const value of generator) {
      if (typeof value === "object" && "event" in value) {
        events.push({ event: value.event, data: value.data });
      }
    }
    return events;
  }

  it("shows warning indicator for mutating commands", async () => {
    const events = await collectEvents("touch test-file.txt");
    const completionEvent = events.find((e) => e.event === "tool-completion");
    assert.ok(completionEvent, "Should emit tool-completion event");
    assert.ok(
      completionEvent?.data.includes("*"),
      "Should include warning indicator for mutating command",
    );
  });

  it("does not show warning indicator for non-mutating commands", async () => {
    const events = await collectEvents("ls ./source");
    const completionEvent = events.find((e) => e.event === "tool-completion");
    assert.ok(completionEvent, "Should emit tool-completion event");
    assert.ok(
      !completionEvent?.data.includes("*"),
      "Should not include warning indicator for non-mutating command",
    );
  });
});
