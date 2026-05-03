import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("applyChanges", () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "acai-apply-patch-"));
    testFile = path.join(tmpDir, "test.txt");
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // Helper to create a simple test file
  async function writeFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filePath, content, "utf-8");
  }

  // Helper to read file content
  async function readFile(filePath: string): Promise<string> {
    return fsp.readFile(filePath, "utf-8");
  }

  it("should add a new file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    const newPath = path.join(tmpDir, "newfile.txt");
    const changes = [
      { type: "add" as const, path: newPath, content: "hello world" },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [newPath]);
    const content = await readFile(newPath);
    assert.equal(content, "hello world");
  });

  it("should create parent directories when adding a file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    const newPath = path.join(tmpDir, "deep", "nested", "file.txt");
    const changes = [
      { type: "add" as const, path: newPath, content: "nested content" },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [newPath]);
    const content = await readFile(newPath);
    assert.equal(content, "nested content");
  });

  it("should delete an existing file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    await writeFile(testFile, "to be deleted");

    const changes = [{ type: "delete" as const, path: testFile }];
    const result = await applyChanges(changes);

    assert.deepEqual(result, [testFile]);
    assert.equal(fs.existsSync(testFile), false);
  });

  it("should not throw when deleting a non-existent file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    const nonexistent = path.join(tmpDir, "does-not-exist.txt");

    const changes = [{ type: "delete" as const, path: nonexistent }];
    const result = await applyChanges(changes);

    assert.deepEqual(result, [nonexistent]);
  });

  it("should update an existing file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    await writeFile(testFile, "original content");

    const changes = [
      {
        type: "update" as const,
        path: testFile,
        newContent: "updated content",
        unifiedDiff: "diff here",
      },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [testFile]);
    const content = await readFile(testFile);
    assert.equal(content, "updated content");
  });

  it("should move a file to a new path on update with movePath", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    await writeFile(testFile, "original content");
    const movedPath = path.join(tmpDir, "moved.txt");

    const changes = [
      {
        type: "update" as const,
        path: testFile,
        movePath: movedPath,
        newContent: "moved content",
        unifiedDiff: "diff here",
      },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [movedPath]);
    // Original should be deleted
    assert.equal(fs.existsSync(testFile), false);
    // New file should exist with new content
    const content = await readFile(movedPath);
    assert.equal(content, "moved content");
  });

  it("should create parent directories for moved file", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    await writeFile(testFile, "original content");
    const movedPath = path.join(tmpDir, "deep", "moved.txt");

    const changes = [
      {
        type: "update" as const,
        path: testFile,
        movePath: movedPath,
        newContent: "moved deep",
        unifiedDiff: "diff here",
      },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [movedPath]);
    const content = await readFile(movedPath);
    assert.equal(content, "moved deep");
  });

  it("should throw when signal is aborted", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    const controller = new AbortController();
    controller.abort();

    const changes = [{ type: "add" as const, path: testFile, content: "x" }];

    await assert.rejects(
      () => applyChanges(changes, controller.signal),
      /Cancelled/,
    );
  });

  it("should process multiple changes in order", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    const file1 = path.join(tmpDir, "file1.txt");
    const file2 = path.join(tmpDir, "file2.txt");

    const changes = [
      { type: "add" as const, path: file1, content: "first" },
      { type: "add" as const, path: file2, content: "second" },
    ];

    const result = await applyChanges(changes);

    assert.equal(result.length, 2);
    assert.deepEqual(result, [file1, file2]);
  });

  it("should return empty array for no changes", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");

    const result = await applyChanges([]);

    assert.deepEqual(result, []);
  });

  it("should handle update without movePath (in-place update)", async () => {
    const { applyChanges } = await import("../../source/tools/apply-patch.ts");
    await writeFile(testFile, "v1");

    const changes = [
      {
        type: "update" as const,
        path: testFile,
        newContent: "v2",
        unifiedDiff: "diff",
      },
    ];

    const result = await applyChanges(changes);

    assert.deepEqual(result, [testFile]);
    const content = await readFile(testFile);
    assert.equal(content, "v2");
  });
});
