import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { createLsTool } from "../../source/tools/ls.ts";

const baseDir = process.cwd();
const testDir = `${baseDir}/test-ls-fixture`;

describe("ls tool", async () => {
  const tool = await createLsTool({
    workspace: { primaryDir: baseDir, allowedDirs: [baseDir] },
  });

  before(async () => {
    try {
      mkdirSync(testDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
  });

  after(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  it("lists directory contents", async () => {
    const result = await tool.execute(
      { path: ".", limit: null },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    );
    assert.ok(result.includes("test-ls-fixture"));
  });

  it("rejects listing non-existent directory", async () => {
    const result = tool.execute(
      { path: "./non-existent-directory-12345", limit: null },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    );
    await assert.rejects(result, /The specified path does not exist/);
  });

  it("creates files with correct format", async () => {
    const testFileName = `${testDir}/test-file-${Date.now()}.txt`;
    writeFileSync(testFileName, "test content");

    // For a file path, it should reject since it's not a directory
    await assert.rejects(
      async () =>
        await tool.execute(
          { path: testFileName, limit: null },
          { toolCallId: "test-123", abortSignal: new AbortController().signal },
        ),
      /Not a directory/,
    );

    // Clean up
    rmSync(testFileName);
  });

  it("respects limit parameter", async () => {
    const result = await tool.execute(
      { path: ".", limit: 5 },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    );

    const lines = result.split("\n");
    assert.ok(lines.length <= 5);
  });
});
