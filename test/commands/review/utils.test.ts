import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFileDiffForDisplay,
  parseGitDiffFiles,
} from "../../../source/commands/review/utils.ts";

describe("parseGitDiffFiles", () => {
  it("returns empty array for empty input", () => {
    assert.deepEqual(parseGitDiffFiles(""), []);
  });

  it("parses a single file diff", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "@@ -1,3 +1,5 @@",
      " unchanged",
      "+added line",
      "-removed line",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.equal(result.length, 1);
    assert.equal(result[0].fileName, "foo.ts");
    assert.equal(result[0].stats, "Additions: 5, Deletions: 3");
    assert.ok(result[0].diff.includes("+added line"));
    assert.ok(result[0].diff.includes("-removed line"));
    assert.ok(result[0].diff.includes(" unchanged"));
  });

  it("parses multiple file diffs", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1,2 +1,3 @@",
      "+new line",
      "diff --git a/b.ts b/b.ts",
      "@@ -1,4 +1,4 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.equal(result.length, 2);
    assert.equal(result[0].fileName, "a.ts");
    assert.equal(result[1].fileName, "b.ts");
  });

  it("handles new file diffs (deletions counted as 0)", () => {
    const diff = [
      "diff --git a//dev/null b/new.ts",
      "new file mode 100644",
      "@@ -0,3 +1,5 @@",
      "+line1",
      "+line2",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.equal(result.length, 1);
    assert.equal(result[0].stats, "Additions: 5, Deletions: 0");
  });

  it("includes index, old mode, new mode, deleted file, new file lines in diff", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc123..def456 100644",
      "old mode 100644",
      "new mode 100755",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.ok(result[0].diff.includes("index abc123"));
    assert.ok(result[0].diff.includes("old mode 100644"));
    assert.ok(result[0].diff.includes("new mode 100755"));
  });

  it("handles @@ line without standard format", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "@@ some non-standard hunk header @@",
      "+added",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.equal(result[0].stats, "Additions: 1, Deletions: 0");
  });

  it("excludes +++ and --- lines from diff content", () => {
    const diff = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = parseGitDiffFiles(diff);
    assert.ok(!result[0].diff.includes("--- a/foo.ts"));
    assert.ok(!result[0].diff.includes("+++ b/foo.ts"));
  });
});

describe("formatFileDiffForDisplay", () => {
  it("wraps output in markdown code block with filename header", () => {
    const result = formatFileDiffForDisplay("foo.ts", "+added\n");
    assert.ok(result.startsWith("### foo.ts"));
    assert.ok(result.includes("```diff"));
    assert.ok(result.endsWith("```"));
  });

  it("formats addition lines", () => {
    const result = formatFileDiffForDisplay("f.ts", "+added line\n");
    assert.ok(result.includes("+added line"));
  });

  it("formats deletion lines", () => {
    const result = formatFileDiffForDisplay("f.ts", "-removed line\n");
    assert.ok(result.includes("-removed line"));
  });

  it("formats context lines", () => {
    const result = formatFileDiffForDisplay("f.ts", " context line\n");
    assert.ok(result.includes(" context line"));
  });

  it("preserves @@ hunk headers", () => {
    const result = formatFileDiffForDisplay("f.ts", "@@ -1,3 +1,5 @@\n");
    assert.ok(result.includes("@@ -1,3 +1,5 @@"));
  });

  it("preserves metadata lines", () => {
    const diff = [
      "index abc..def",
      "old mode 100644",
      "new mode 100755",
      "deleted file mode 100644",
      "new file mode 100644",
    ].join("\n");
    const result = formatFileDiffForDisplay("f.ts", diff);
    assert.ok(result.includes("index abc..def"));
    assert.ok(result.includes("old mode 100644"));
    assert.ok(result.includes("new mode 100755"));
    assert.ok(result.includes("deleted file mode 100644"));
    assert.ok(result.includes("new file mode 100644"));
  });

  it("skips empty lines", () => {
    const result = formatFileDiffForDisplay("f.ts", "+a\n\n+b\n");
    const lines = result.split("\n");
    const diffLines = lines.slice(
      lines.indexOf("```diff") + 1,
      lines.indexOf("```", lines.indexOf("```diff") + 1),
    );
    assert.ok(!diffLines.some((l) => l.trim() === ""));
  });

  it("does not include +++ or --- lines as additions/deletions", () => {
    const diff = "+++header\n---header\n+real add\n-real del\n";
    const result = formatFileDiffForDisplay("f.ts", diff);
    assert.ok(result.includes("+real add"));
    assert.ok(result.includes("-real del"));
  });
});
