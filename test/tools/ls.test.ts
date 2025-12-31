import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import { createLsTool, LsTool } from "../../source/tools/ls.ts";
import type { ToolResult } from "../../source/tools/types.ts";

describe("LS tool", () => {
  it("should have correct name", () => {
    assert.equal(LsTool.name, "LS");
  });

  it("should have correct description", async () => {
    const tool = await createLsTool({
      workingDir: "/tmp",
    });
    assert.ok(tool.toolDef.description.includes("List directory contents"));
  });

  it("should list current directory contents", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
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
    });

    // Create a test file in the project directory (within allowed dirs)
    const testFileName = `test-file-${Date.now()}.txt`;
    const testFilePath = `${process.cwd()}/${testFileName}`;
    await fs.writeFile(testFilePath, "test content");

    const results: ToolResult[] = [];
    for await (const result of tool.execute(
      { path: testFileName, limit: null },
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

    const errorResults = results.filter((r) => typeof r === "string");
    const hasDirError = errorResults.some((r) => {
      return (
        String(r).includes("Not a directory") ||
        String(r).includes("not a directory") ||
        String(r).includes("is not a directory")
      );
    });
    assert.ok(
      hasDirError,
      `Expected "not a directory" error, got: ${JSON.stringify(errorResults)}`,
    );

    // Clean up
    await fs.rm(testFilePath);
  });

  it("should respect limit parameter", async () => {
    const tool = await createLsTool({
      workingDir: process.cwd(),
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
