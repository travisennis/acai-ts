import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePatch } from "../source/tools/apply-patch.ts";

describe("parseUpdateFileChunks - edge cases", () => {
  it("should handle update with no chunks", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
  });

  it("should handle multiple chunks in one update", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ first context
-line1
+line1changed
@@ second context
-line2
+line2changed
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    assert.equal(result.hunks[0].type, "update");
    const chunks = (
      result.hunks[0] as {
        chunks: {
          oldLines: string[];
          newLines: string[];
          changeContext?: string;
        }[];
      }
    ).chunks;
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].changeContext, "first context");
    assert.equal(chunks[1].changeContext, "second context");
    assert.deepEqual(chunks[0].oldLines, ["line1"]);
    assert.deepEqual(chunks[0].newLines, ["line1changed"]);
    assert.deepEqual(chunks[1].oldLines, ["line2"]);
    assert.deepEqual(chunks[1].newLines, ["line2changed"]);
  });

  it("should handle chunk with only removed lines", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
-line1
-line2
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { oldLines: string[]; newLines: string[] }[];
      }
    ).chunks;
    assert.deepEqual(chunks[0].oldLines, ["line1", "line2"]);
    assert.deepEqual(chunks[0].newLines, []);
  });

  it("should handle chunk with only added lines", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
+line1
+line2
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { oldLines: string[]; newLines: string[] }[];
      }
    ).chunks;
    assert.deepEqual(chunks[0].oldLines, []);
    assert.deepEqual(chunks[0].newLines, ["line1", "line2"]);
  });

  it("should handle chunk with only unchanged lines", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
 unchanged
 still unchanged
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { oldLines: string[]; newLines: string[] }[];
      }
    ).chunks;
    assert.deepEqual(chunks[0].oldLines, ["unchanged", "still unchanged"]);
    assert.deepEqual(chunks[0].newLines, ["unchanged", "still unchanged"]);
  });

  it("should handle mixed unchanged, removed, and added lines", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
 keep
-remove
+add
 keep too
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { oldLines: string[]; newLines: string[] }[];
      }
    ).chunks;
    assert.deepEqual(chunks[0].oldLines, ["keep", "remove", "keep too"]);
    assert.deepEqual(chunks[0].newLines, ["keep", "add", "keep too"]);
  });

  it("should handle end of file marker with trailing content after it", () => {
    // Content after *** End of File should be treated as belonging to next section
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@
-old
+new
*** End of File
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (result.hunks[0] as { chunks: { isEndOfFile?: boolean }[] })
      .chunks;
    assert.equal(chunks[0].isEndOfFile, true);
  });

  it("should skip lines that don't start with @@ or ***", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ context
-old
+new
junk line that should be ignored
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { oldLines: string[]; newLines: string[] }[];
      }
    ).chunks;
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].oldLines, ["old"]);
    assert.deepEqual(chunks[0].newLines, ["new"]);
  });

  it("should handle update with move followed by chunks", () => {
    const patchText = `*** Begin Patch
*** Update File: old/path.ts
*** Move to: new/path.ts
@@ context
-old line
+new line
*** End Patch`;

    const result = parsePatch(patchText);
    assert.equal(result.hunks.length, 1);
    const update = result.hunks[0] as {
      type: "update";
      path: string;
      movePath?: string;
      chunks: unknown[];
    };
    assert.equal(update.movePath, "new/path.ts");
    assert.equal(update.chunks.length, 1);
  });

  it("should handle adjacent chunks without gap", () => {
    const patchText = `*** Begin Patch
*** Update File: file.ts
@@ one
 a
@@ two
 b
*** End Patch`;

    const result = parsePatch(patchText);
    const chunks = (
      result.hunks[0] as {
        chunks: { changeContext?: string; oldLines: string[] }[];
      }
    ).chunks;
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].changeContext, "one");
    assert.equal(chunks[1].changeContext, "two");
  });
});
