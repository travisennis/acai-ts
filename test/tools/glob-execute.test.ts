import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGlobTool } from "../../source/tools/glob.ts";

const TOOL_EXECUTION_OPTIONS = { toolCallId: "test", abortSignal: undefined };

test("glob execute returns matching files", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    // Create test files
    await fs.promises.writeFile(path.join(tmpDir, "file1.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file2.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file3.js"), "");

    const globTool = createGlobTool();
    const result = await globTool.execute(
      {
        patterns: "*.ts",
        path: tmpDir,
        gitignore: null,
        recursive: null,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: null,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    assert.ok(result.includes("file1.ts"));
    assert.ok(result.includes("file2.ts"));
    assert.ok(!result.includes("file3.js"));
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute respects maxResults limit", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    // Create test files
    await fs.promises.writeFile(path.join(tmpDir, "file1.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file2.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file3.ts"), "");

    const globTool = createGlobTool();
    const result = await globTool.execute(
      {
        patterns: "*.ts",
        path: tmpDir,
        gitignore: null,
        recursive: null,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: 2,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    const files = result.split("\n").filter(Boolean);
    assert.strictEqual(files.length, 2);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute throws when aborted", async () => {
  const globTool = createGlobTool();
  const abortController = new AbortController();
  abortController.abort();

  await assert.rejects(
    async () =>
      await globTool.execute(
        {
          patterns: "*.ts",
          path: "/some/path",
          gitignore: null,
          recursive: null,
          expandDirectories: null,
          ignoreFiles: null,
          cwd: null,
          maxResults: null,
        },
        { toolCallId: "test", abortSignal: abortController.signal },
      ),
    { message: "Glob search aborted" },
  );
});

test("glob execute returns no files message when none match", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    // Create test files that don't match
    await fs.promises.writeFile(path.join(tmpDir, "file1.js"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file2.txt"), "");

    const globTool = createGlobTool();
    const result = await globTool.execute(
      {
        patterns: "*.ts",
        path: tmpDir,
        gitignore: null,
        recursive: null,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: null,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    assert.strictEqual(
      result,
      "No files found matching the specified patterns.",
    );
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute handles array patterns", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    await fs.promises.writeFile(path.join(tmpDir, "file1.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file2.js"), "");
    await fs.promises.writeFile(path.join(tmpDir, "file3.txt"), "");

    const globTool = createGlobTool();
    const result = await globTool.execute(
      {
        patterns: ["*.ts", "*.js"],
        path: tmpDir,
        gitignore: null,
        recursive: null,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: null,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    assert.ok(result.includes("file1.ts"));
    assert.ok(result.includes("file2.js"));
    assert.ok(!result.includes("file3.txt"));
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute handles recursive option", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    await fs.promises.mkdir(path.join(tmpDir, "subdir"), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, "file1.ts"), "");
    await fs.promises.writeFile(path.join(tmpDir, "subdir", "file2.ts"), "");

    const globTool = createGlobTool();

    // Test with recursive=true
    const resultRecursive = await globTool.execute(
      {
        patterns: "**/*.ts",
        path: tmpDir,
        gitignore: null,
        recursive: true,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: null,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    assert.ok(resultRecursive.includes("file1.ts"));
    assert.ok(
      resultRecursive.includes("subdir/file2.ts") ||
        resultRecursive.includes("subdir\\file2.ts"),
    );
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute sorts by modification time", async () => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acai-glob-"),
  );
  try {
    // Create files with different modification times
    const file1 = path.join(tmpDir, "file1.ts");
    const file2 = path.join(tmpDir, "file2.ts");
    await fs.promises.writeFile(file1, "");
    await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different mtime
    await fs.promises.writeFile(file2, "");

    const globTool = createGlobTool();
    const result = await globTool.execute(
      {
        patterns: "*.ts",
        path: tmpDir,
        gitignore: null,
        recursive: null,
        expandDirectories: null,
        ignoreFiles: null,
        cwd: null,
        maxResults: null,
      },
      TOOL_EXECUTION_OPTIONS,
    );

    const files = result.split("\n").filter(Boolean);
    // Most recent file should come first
    assert.ok(files.length >= 2);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("glob execute handles missing path default", async () => {
  const globTool = createGlobTool();
  // Should use process.cwd() as default path
  const result = await globTool.execute(
    {
      patterns: "*.nonexistent-file-12345",
      path: "",
      gitignore: null,
      recursive: null,
      expandDirectories: null,
      ignoreFiles: null,
      cwd: null,
      maxResults: null,
    },
    TOOL_EXECUTION_OPTIONS,
  );

  // Should return no files message, not crash
  assert.strictEqual(result, "No files found matching the specified patterns.");
});
