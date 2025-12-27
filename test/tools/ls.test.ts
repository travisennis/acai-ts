import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TokenCounter } from "../../source/tokens/counter.ts";
import { createLsTool, LsTool } from "../../source/tools/ls.ts";
import type { ToolResult } from "../../source/tools/types.ts";

describe("LS tool", () => {
  it("should have correct name", () => {
    assert.equal(LsTool.name, "LS");
  });

  it("should have correct description", async () => {
    const tool = await createLsTool({
      workingDir: "/tmp",
      tokenCounter: new TokenCounter(),
    });
    assert.ok(tool.toolDef.description.includes("List directory contents"));
  });

  it("should list current directory contents", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
      tokenCounter: new TokenCounter(),
    });

    const results: ToolResult[] = [];
    for await (const result of tool.execute(
      { path: ".", limit: null },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    )) {
      results.push(result);
    }

    // Should have init, completion, and content results
    assert.equal(results.length, 3);
    const initResult = results[0] as { event: string };
    const completionResult = results[1] as { event: string };
    assert.ok(initResult.event === "tool-init");
    assert.ok(completionResult.event === "tool-completion");
    assert.ok(typeof results[2] === "string");
    assert.ok(results[2].length > 0); // Should have some content
  });

  it("should handle non-existent directory", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
      tokenCounter: new TokenCounter(),
    });

    const results: ToolResult[] = [];
    for await (const result of tool.execute(
      { path: "./non-existent-directory-12345", limit: null },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    )) {
      results.push(result);
    }

    // Should have init and error results
    const hasError = results.some((r) => {
      if (typeof r === "object" && r && "event" in r) {
        return r.event === "tool-error";
      }
      return false;
    });
    assert.ok(hasError);

    const hasPathError = results.some((r) => {
      if (typeof r === "string") {
        return r.includes("does not exist");
      }
      return false;
    });
    assert.ok(hasPathError);
  });

  it("should handle non-directory path", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
      tokenCounter: new TokenCounter(),
    });

    // Create a test file first
    const testFilePath = `${process.cwd()}/test-file-12345.txt`;
    const fs = await import("node:fs/promises");
    await fs.writeFile(testFilePath, "test content");

    const results: ToolResult[] = [];
    for await (const result of tool.execute(
      { path: "test-file-12345.txt", limit: null },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    )) {
      results.push(result);
    }

    // Should have error about not being a directory
    const hasError = results.some((r) => {
      if (typeof r === "object" && r && "event" in r) {
        return r.event === "tool-error";
      }
      return false;
    });
    assert.ok(hasError);

    const hasDirError = results.some((r) => {
      if (typeof r === "string") {
        return r.includes("Not a directory");
      }
      return false;
    });
    assert.ok(hasDirError);

    // Clean up
    await fs.rm(testFilePath);
  });

  it("should respect limit parameter", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
      tokenCounter: new TokenCounter(),
    });

    const results: ToolResult[] = [];
    for await (const result of tool.execute(
      { path: ".", limit: 5 },
      { toolCallId: "test-123", abortSignal: new AbortController().signal },
    )) {
      results.push(result);
    }

    // Should have init, completion, and content results
    assert.equal(results.length, 3);
    const content = results[2] as string;
    const lines = content.split("\n");

    // Should have at most 5 entries (plus potential completion message)
    assert.ok(lines.length <= 6); // 5 entries + 1 potential message
  });
});
