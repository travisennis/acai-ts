import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CodeSearchTool,
  createCodeSearchTool,
} from "../../source/tools/code-search.ts";

// Helper to create options with toolCallId
const createOptions = (abortSignal?: AbortSignal) => ({
  toolCallId: "test-call-id",
  abortSignal,
});

test.describe("CodeSearch tool", () => {
  test("should throw error when abortSignal is aborted", async () => {
    const tool = createCodeSearchTool();
    const abortController = new AbortController();
    abortController.abort();

    await assert.rejects(
      async () =>
        await tool.execute(
          {
            query: "test",
            path: ".",
            regexPattern: null,
            filePattern: null,
            excludePattern: null,
            excludeDir: null,
            maxResults: null,
            contextLines: null,
            filesOnly: null,
            showContent: null,
            codeOnly: null,
          },
          createOptions(abortController.signal),
        ),
      { message: "CodeSearch aborted" },
    );
  });

  test("should have correct tool name", () => {
    assert.equal(CodeSearchTool.name, "CodeSearch");
  });

  test("should have description", () => {
    const tool = createCodeSearchTool();
    assert.ok(tool.toolDef.description.length > 0);
  });

  test("should have input schema", () => {
    const tool = createCodeSearchTool();
    assert.ok(tool.toolDef.inputSchema);
  });

  test("should have display function", () => {
    const tool = createCodeSearchTool();
    assert.equal(typeof tool.display, "function");
  });

  test("should have execute function", () => {
    const tool = createCodeSearchTool();
    assert.equal(typeof tool.execute, "function");
  });

  test("display function formats query correctly", () => {
    const tool = createCodeSearchTool();
    const result = tool.display({
      query: "test query",
      path: "/some/path",
      regexPattern: null,
      filePattern: null,
      excludePattern: null,
      excludeDir: null,
      maxResults: null,
      contextLines: null,
      filesOnly: null,
      showContent: null,
      codeOnly: null,
    });

    assert.ok(result.includes("test query"));
    assert.ok(result.includes("/some/path"));
  });

  test("display function includes optional flags when set", () => {
    const tool = createCodeSearchTool();
    const result = tool.display({
      query: "test",
      path: ".",
      regexPattern: "test.*",
      filePattern: "*.ts",
      excludePattern: "*.test.ts",
      excludeDir: "node_modules",
      maxResults: 25,
      contextLines: 5,
      filesOnly: true,
      showContent: true,
      codeOnly: true,
    });

    assert.ok(result.includes("regex:"));
    assert.ok(result.includes("include:"));
    assert.ok(result.includes("exclude:"));
    assert.ok(result.includes("exclude-dir:"));
    assert.ok(result.includes("max:"));
    assert.ok(result.includes("context:"));
    assert.ok(result.includes("files only"));
    assert.ok(result.includes("show content"));
    assert.ok(result.includes("code only"));
  });
});
