import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { applyAdvancedFileEdits } from "../source/tools/advanced-edit-file.ts";

describe("AdvancedEditFile", () => {
  const testDir = "./test-temp";

  before(async () => {
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should perform exact text replacement", async () => {
    const testFile = join(testDir, "exact-test.txt");
    const originalContent = "Hello world!\nThis is a test.\nHello again!";

    await writeFile(testFile, originalContent, "utf-8");

    await applyAdvancedFileEdits(
      testFile,
      "exact",
      [
        {
          type: "replace",
          pattern: "Hello",
          replacement: "Hi",
        },
      ],
      undefined,
      undefined,
      false,
    );

    const modifiedContent = await readFile(testFile, "utf-8");
    assert.equal(modifiedContent, "Hi world!\nThis is a test.\nHi again!");
  });

  it("should perform regex replacement", async () => {
    const testFile = join(testDir, "regex-test.txt");
    const originalContent = "Hello world!\nThis is a test.\nHello again!";

    await writeFile(testFile, originalContent, "utf-8");

    await applyAdvancedFileEdits(
      testFile,
      "regex",
      [
        {
          type: "replace",
          pattern: "Hello",
          replacement: "Hi",
          flags: "g",
        },
      ],
      undefined,
      undefined,
      false,
    );

    const modifiedContent = await readFile(testFile, "utf-8");
    assert.equal(modifiedContent, "Hi world!\nThis is a test.\nHi again!");
  });

  it("should insert text before pattern", async () => {
    const testFile = join(testDir, "insert-before-test.txt");
    const originalContent = "Line 1\nLine 2\nLine 3";

    await writeFile(testFile, originalContent, "utf-8");

    await applyAdvancedFileEdits(
      testFile,
      "exact",
      [
        {
          type: "insert-before",
          pattern: "Line 2",
          replacement: "Inserted line",
        },
      ],
      undefined,
      undefined,
      false,
    );

    const modifiedContent = await readFile(testFile, "utf-8");
    assert.equal(modifiedContent, "Line 1\nInserted line\nLine 2\nLine 3");
  });

  it("should insert text after pattern", async () => {
    const testFile = join(testDir, "insert-after-test.txt");
    const originalContent = "Line 1\nLine 2\nLine 3";

    await writeFile(testFile, originalContent, "utf-8");

    await applyAdvancedFileEdits(
      testFile,
      "exact",
      [
        {
          type: "insert-after",
          pattern: "Line 2",
          replacement: "Inserted line",
        },
      ],
      undefined,
      undefined,
      false,
    );

    const modifiedContent = await readFile(testFile, "utf-8");
    assert.equal(modifiedContent, "Line 1\nLine 2\nInserted line\nLine 3");
  });

  it("should delete lines matching pattern", async () => {
    const testFile = join(testDir, "delete-test.txt");
    const originalContent = "Keep this\nDelete this\nKeep this too";

    await writeFile(testFile, originalContent, "utf-8");

    await applyAdvancedFileEdits(
      testFile,
      "exact",
      [
        {
          type: "delete",
          pattern: "Delete this",
        },
      ],
      undefined,
      undefined,
      false,
    );

    const modifiedContent = await readFile(testFile, "utf-8");
    assert.equal(modifiedContent, "Keep this\nKeep this too");
  });
});
