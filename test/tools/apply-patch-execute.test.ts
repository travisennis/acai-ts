import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

describe("createApplyPatchTool - execute", () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), "acai-apply-patch-exec-"),
    );
    testFile = path.join(tmpDir, "test.txt");
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filePath, content, "utf-8");
  }

  it("should add a new file via execute", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const newFile = path.join(tmpDir, "newfile.txt");
    const patchText = [
      "*** Begin Patch",
      `*** Add File: ${newFile}`,
      "+hello world",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-1", abortSignal: undefined },
    );

    assert.ok(result.includes("1 file(s) changed"));
    // The file path in the result may resolve through /private/var on macOS
    const content = await fsp.readFile(newFile, "utf-8");
    assert.equal(content, "hello world");
  });

  it("should delete an existing file via execute", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    await writeFile(testFile, "to be deleted");
    const patchText = [
      "*** Begin Patch",
      `*** Delete File: ${testFile}`,
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-2", abortSignal: undefined },
    );

    assert.ok(result.includes("1 file(s) changed"));
    assert.equal(fs.existsSync(testFile), false);
  });

  it("should update an existing file via execute", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    await writeFile(testFile, "line1\nline2\nline3");
    const patchText = [
      "*** Begin Patch",
      `*** Update File: ${testFile}`,
      "@@ line1",
      "-line2",
      "+line2 modified",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-3", abortSignal: undefined },
    );

    assert.ok(result.includes("1 file(s) changed"));
    const content = await fsp.readFile(testFile, "utf-8");
    assert.ok(content.includes("line2 modified"));
  });

  it("should move a file on update with movePath", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    await writeFile(testFile, "line1\noriginal content\nline3");
    const movedFile = path.join(tmpDir, "moved.txt");
    const patchText = [
      "*** Begin Patch",
      `*** Update File: ${testFile}`,
      `*** Move to: ${movedFile}`,
      "@@ line1",
      "-original content",
      "+moved content",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-4", abortSignal: undefined },
    );

    assert.ok(result.includes("1 file(s) changed"));
    assert.equal(fs.existsSync(testFile), false);
    const content = await fsp.readFile(movedFile, "utf-8");
    assert.ok(content.includes("moved content"));
  });

  it("should return no changes message for empty patch", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const patchText = ["*** Begin Patch", "*** End Patch"].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-5", abortSignal: undefined },
    );

    assert.equal(result, "No changes found in patch.");
  });

  it("should throw when aborted before execution", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const controller = new AbortController();
    controller.abort();

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    await assert.rejects(
      () =>
        tool.execute(
          { patchText: "*** Begin Patch\n*** End Patch" },
          { toolCallId: "test-6", abortSignal: controller.signal },
        ),
      /Apply patch aborted/,
    );
  });

  it("should handle multiple file changes", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const file1 = path.join(tmpDir, "file1.txt");
    const file2 = path.join(tmpDir, "file2.txt");

    const patchText = [
      "*** Begin Patch",
      `*** Add File: ${file1}`,
      "+content of file 1",
      `*** Add File: ${file2}`,
      "+content of file 2",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-7", abortSignal: undefined },
    );

    assert.ok(result.includes("2 file(s) changed"));
    assert.equal(await fsp.readFile(file1, "utf-8"), "content of file 1");
    assert.equal(await fsp.readFile(file2, "utf-8"), "content of file 2");
  });

  it("should reject patch with path outside allowed directories", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const outsidePath = "/tmp/acai-outside-test-file.txt";
    const patchText = [
      "*** Begin Patch",
      `*** Add File: ${outsidePath}`,
      "+content",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    await assert.rejects(() =>
      tool.execute(
        { patchText },
        { toolCallId: "test-8", abortSignal: undefined },
      ),
    );
  });

  it("should include diff output in result for updates", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    await writeFile(testFile, "line A\nline B\nline C");

    const patchText = [
      "*** Begin Patch",
      `*** Update File: ${testFile}`,
      "@@ line A",
      "-line B",
      "+line B modified",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-9", abortSignal: undefined },
    );

    // Should mention the updated file and include diff info
    assert.ok(result.includes("1 file(s) changed"));
    assert.ok(
      result.includes(`${testFile}`) || result.includes("Update File:"),
    );
  });

  it("should handle relative paths correctly", async () => {
    const { createApplyPatchTool } = await import(
      "../../source/tools/apply-patch.ts"
    );
    const relFile = "relative-file.txt";
    const patchText = [
      "*** Begin Patch",
      `*** Add File: ${relFile}`,
      "+relative content",
      "*** End Patch",
    ].join("\n");

    const tool = await createApplyPatchTool({
      workspace: {
        primaryDir: tmpDir,
        allowedDirs: [tmpDir],
      },
    });

    const result = await tool.execute(
      { patchText },
      { toolCallId: "test-10", abortSignal: undefined },
    );

    assert.ok(result.includes("1 file(s) changed"));
    const fullPath = path.join(tmpDir, relFile);
    const content = await fsp.readFile(fullPath, "utf-8");
    assert.equal(content, "relative content");
  });
});
