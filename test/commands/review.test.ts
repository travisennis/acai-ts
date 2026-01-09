import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFileDiffForDisplay,
  parseGitDiffFiles,
} from "../../source/commands/review/utils.ts";

describe("parseGitDiffFiles", () => {
  it("should parse empty string", () => {
    const result = parseGitDiffFiles("");
    assert.strictEqual(result.length, 0);
  });

  it("should parse single file diff", () => {
    const diff = `diff --git a/test.ts b/test.ts
@@ -1,3 +1,3 @@
-const old = "old";
+const new = "new";
`;

    const result = parseGitDiffFiles(diff);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.fileName, "test.ts");
    assert.ok(result[0]?.diff.includes("+const new"));
  });

  it("should parse multiple file diffs", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
@@ -1,2 +1,2 @@
-old line
+new line
diff --git a/file2.ts b/file2.ts
@@ -1,1 +1,1 @@
-a
+b
`;

    const result = parseGitDiffFiles(diff);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]?.fileName, "file1.ts");
    assert.strictEqual(result[1]?.fileName, "file2.ts");
  });

  it("should handle new file", () => {
    const diff = `diff --git a/newfile.ts b/newfile.ts
@@ -0,0 +1,1 @@
+new content
`;

    const result = parseGitDiffFiles(diff);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.fileName, "newfile.ts");
  });

  it("should track additions and deletions", () => {
    const diff = `diff --git a/test.ts b/test.ts
@@ -1,1 +1,1 @@
-old line
+new line
`;

    const result = parseGitDiffFiles(diff);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0]?.stats.includes("Additions: 1"));
    assert.ok(result[0]?.stats.includes("Deletions: 1"));
  });
});

describe("formatFileDiffForDisplay", () => {
  it("should format filename header", () => {
    const result = formatFileDiffForDisplay("test.ts", "");
    assert.ok(result.includes("### test.ts"));
  });

  it("should prefix additions with +", () => {
    const result = formatFileDiffForDisplay("test.ts", "+line1\n+line2");
    assert.ok(result.includes("+line1"));
    assert.ok(result.includes("+line2"));
  });

  it("should prefix deletions with -", () => {
    const result = formatFileDiffForDisplay("test.ts", "-line1\n-line2");
    assert.ok(result.includes("-line1"));
    assert.ok(result.includes("-line2"));
  });

  it("should preserve context lines", () => {
    const result = formatFileDiffForDisplay("test.ts", " context line");
    assert.ok(result.includes(" context line"));
  });

  it("should handle @@ range markers", () => {
    const result = formatFileDiffForDisplay("test.ts", "@@ -1,2 +1,3 @@");
    assert.ok(result.includes("@@ -1,2 +1,3 @@"));
  });
});
