import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeReplacements,
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

  describe("computeReplacements", () => {
    it("should find and replace a simple pattern", () => {
      const lines = ["line1", "line2", "line3"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["line2"],
          newLines: ["modified"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], [1, 1, ["modified"]]);
    });

    it("should handle multiple chunks", () => {
      const lines = ["line1", "line2", "line3", "line4"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["line1"],
          newLines: ["modified1"],
        },
        {
          oldLines: ["line3"],
          newLines: ["modified3"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], [0, 1, ["modified1"]]);
      assert.deepEqual(result[1], [2, 1, ["modified3"]]);
    });

    it("should advance line index after context", () => {
      const lines = ["a", "b", "c", "d", "e"];
      const chunks: UpdateFileChunk[] = [
        {
          changeContext: "a",
          oldLines: ["b"],
          newLines: ["x"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      // After context "a" at index 0, lineIndex moves to 1, so pattern "b" is at index 1
      assert.deepEqual(result[0], [1, 1, ["x"]]);
    });

    it("should handle insertion (empty oldLines) at end of file", () => {
      const lines = ["line1", "line2"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: [],
          newLines: ["inserted"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], [2, 0, ["inserted"]]);
    });

    it("should insert before trailing empty line if present", () => {
      const lines = ["line1", "line2", ""];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: [],
          newLines: ["inserted"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      // Insert before the trailing empty line at index 2
      assert.deepEqual(result[0], [2, 0, ["inserted"]]);
    });

    it("should trim trailing empty line from pattern if not found", () => {
      const lines = ["line1", "line2"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["line1", "line2", ""],
          newLines: ["modified1", "modified2", ""],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      // After trimming the trailing empty lines, pattern is ["line1", "line2"]
      assert.deepEqual(result[0], [0, 2, ["modified1", "modified2"]]);
    });

    it("should throw when context line not found", () => {
      const lines = ["line1", "line2"];
      const chunks: UpdateFileChunk[] = [
        {
          changeContext: "nonexistent",
          oldLines: ["line2"],
          newLines: ["modified"],
        },
      ];

      assert.throws(
        () => computeReplacements(lines, "test.txt", chunks),
        /Failed to find context/,
      );
    });

    it("should throw when pattern not found", () => {
      const lines = ["line1", "line2"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["nonexistent"],
          newLines: ["modified"],
        },
      ];

      assert.throws(
        () => computeReplacements(lines, "test.txt", chunks),
        /Failed to find expected lines/,
      );
    });

    it("should handle empty chunks array", () => {
      const result = computeReplacements(["line1"], "test.txt", []);
      assert.deepEqual(result, []);
    });

    it("should sort replacements by start index when chunks are in order", () => {
      const lines = ["a", "b", "c"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["a"],
          newLines: ["y"],
        },
        {
          oldLines: ["c"],
          newLines: ["x"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], [0, 1, ["y"]]);
      assert.deepEqual(result[1], [2, 1, ["x"]]);
    });

    it("should handle chunk with only context and keep unchanged lines", () => {
      const lines = ["a", "b", "c", "d"];
      const chunks: UpdateFileChunk[] = [
        {
          oldLines: ["b", "c"],
          newLines: ["b", "c"],
        },
      ];

      const result = computeReplacements(lines, "test.txt", chunks);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], [1, 2, ["b", "c"]]);
    });
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

  it("should parse an add file patch with a colon in the path", () => {
    const patchText = `*** Begin Patch
*** Add File: C:/Users/test/file.txt
+Hello World
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "add");
    assert.equal(result.hunks[0].path, "C:/Users/test/file.txt");
  });

  it("should parse a delete file patch with a colon in the path", () => {
    const patchText = `*** Begin Patch
*** Delete File: D:/data/old.txt
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "delete");
    assert.equal(result.hunks[0].path, "D:/data/old.txt");
  });

  it("should parse an update file patch with a colon in the path", () => {
    const patchText = `*** Begin Patch
*** Update File: C:/project/src/index.ts
@@ context
-old
+new
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
    assert.equal(result.hunks[0].path, "C:/project/src/index.ts");
  });

  it("should parse a move operation with a colon in the path", () => {
    const patchText = `*** Begin Patch
*** Update File: old/path.ts
*** Move to: D:/project/new/path.ts
@@ context
-old
+new
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
    assert.equal(
      (result.hunks[0] as { movePath?: string }).movePath,
      "D:/project/new/path.ts",
    );
  });
});
