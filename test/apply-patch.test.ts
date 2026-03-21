import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePatch,
  type UpdateFileChunk,
} from "../source/tools/apply-patch.ts";

describe("parsePatch", () => {
  it("should parse a simple add file patch", () => {
    const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
+Second line
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "add");
    assert.equal(result.hunks[0].path, "test.txt");
    assert.equal(result.hunks[0].contents, "Hello World\nSecond line");
  });

  it("should parse a delete file patch", () => {
    const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "delete");
    assert.equal(result.hunks[0].path, "old.txt");
  });

  it("should parse an update file patch with context", () => {
    const patchText = `*** Begin Patch
*** Update File: src/index.ts
@@ function oldName()
-function oldName() {
+function newName() {
   return 42;
 }
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
    assert.equal(result.hunks[0].path, "src/index.ts");

    const chunks = (result.hunks[0] as { chunks: UpdateFileChunk[] }).chunks;
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].changeContext, "function oldName()");
    // Unchanged lines are included in both oldLines and newLines
    assert.deepEqual(chunks[0].oldLines, [
      "function oldName() {",
      "  return 42;",
      "}",
    ]);
    assert.deepEqual(chunks[0].newLines, [
      "function newName() {",
      "  return 42;",
      "}",
    ]);
  });

  it("should parse an update file with move operation", () => {
    const patchText = `*** Begin Patch
*** Update File: old/path.ts
*** Move to: new/path.ts
@@ context
-old line
+new line
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
    assert.equal(result.hunks[0].path, "old/path.ts");
    assert.equal(
      (result.hunks[0] as { movePath?: string }).movePath,
      "new/path.ts",
    );
  });

  it("should parse multiple operations in one patch", () => {
    const patchText = `*** Begin Patch
*** Add File: new.txt
+New content
*** Update File: existing.txt
@@ context
-old
+new
*** Delete File: remove.txt
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 3);
    assert.equal(result.hunks[0].type, "add");
    assert.equal(result.hunks[1].type, "update");
    assert.equal(result.hunks[2].type, "delete");
  });

  it("should throw error for missing Begin marker", () => {
    const patchText = `*** Update File: test.txt
+content
*** End Patch`;

    assert.throws(() => parsePatch(patchText), /missing Begin\/End markers/);
  });

  it("should throw error for missing End marker", () => {
    const patchText = `*** Begin Patch
*** Update File: test.txt
+content`;

    assert.throws(() => parsePatch(patchText), /missing Begin\/End markers/);
  });

  it("should parse unchanged lines in update chunks", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
 unchanged
-removed
+added
 more unchanged
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (result.hunks[0] as { chunks: UpdateFileChunk[] }).chunks;
    assert.deepEqual(chunks[0].oldLines, [
      "unchanged",
      "removed",
      "more unchanged",
    ]);
    assert.deepEqual(chunks[0].newLines, [
      "unchanged",
      "added",
      "more unchanged",
    ]);
  });

  it("should handle empty context", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@
-old
+new
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (result.hunks[0] as { chunks: UpdateFileChunk[] }).chunks;
    assert.equal(chunks[0].changeContext, undefined);
  });

  it("should handle end of file marker", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@
-old
+new
*** End of File
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (result.hunks[0] as { chunks: UpdateFileChunk[] }).chunks;
    assert.equal(chunks[0].isEndOfFile, true);
  });
});
