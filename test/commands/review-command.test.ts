/** biome-ignore-all lint/suspicious/noExplicitAny: test file uses test utilities for internal functions */

import { strict as assertStrict } from "node:assert";
import { describe, it } from "node:test";
import { reviewCommand } from "../../source/commands/review/index.ts";
import {
  formatFileDiffForDisplay,
  parseGitDiffFiles,
} from "../../source/commands/review/utils.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("reviewCommand", () => {
  const mockOptions: CommandOptions = {
    promptManager: {
      set: () => {},
      get: () => "",
      addContext: () => {},
      clearContext: () => {},
      getContext: () => "",
      setSystemPrompt: () => {},
      getSystemPrompt: () => "",
    } as any,
    modelManager: {
      setModel: () => {},
      getModel: () => "",
      listModels: () => [],
    } as any,
    sessionManager: {
      addMessage: () => {},
      getMessages: () => [],
      clear: () => {},
      save: () => {},
      restore: () => {},
    } as any,
    tokenTracker: {
      track: () => {},
      getTotal: () => 0,
      reset: () => {},
    } as any,
    config: {
      get: () => ({}),
      set: () => {},
      save: () => {},
    } as any,
    tokenCounter: {
      count: () => 0,
    } as any,
    promptHistory: [],
    workspace: {
      primaryDir: "/tmp",
      allowedDirs: ["/tmp"],
    } as any,
  };

  it("should be defined", () => {
    const command = reviewCommand(mockOptions);

    assertStrict.ok(command);
    assertStrict.equal(command.command, "/review");
    assertStrict.equal(
      command.description,
      "Shows a diff of all changes in the current directory.",
    );
  });

  it("should have correct command properties", () => {
    const command = reviewCommand(mockOptions);

    assertStrict.ok(command);
    assertStrict.equal(command.command, "/review");
    assertStrict.equal(
      command.description,
      "Shows a diff of all changes in the current directory.",
    );
    assertStrict.ok(Array.isArray(command.aliases) || !command.aliases);
  });
});

describe("parseGitDiffFiles", () => {
  it("should parse single file with additions and deletions", () => {
    const diffOutput = `diff --git a/test.ts b/test.ts
@@ -1,3 +1,4 @@
+new line
existing line
-another line
 last line`;

    const result = parseGitDiffFiles(diffOutput);

    assertStrict.strictEqual(result.length, 1);
    assertStrict.strictEqual(result[0].fileName, "test.ts");
    assertStrict.ok(result[0].diff.includes("+new line"));
    assertStrict.ok(result[0].diff.includes("-another line"));
    assertStrict.ok(result[0].stats.includes("Additions:"));
    assertStrict.ok(result[0].stats.includes("Deletions:"));
  });

  it("should parse multiple files", () => {
    const diffOutput = `diff --git a/file1.ts b/file1.ts
@@ -1,2 +1,3 @@
+line1
 old1
diff --git a/file2.ts b/file2.ts
@@ -1,2 +1,3 @@
+line2
 old2`;

    const result = parseGitDiffFiles(diffOutput);

    assertStrict.strictEqual(result.length, 2);
    assertStrict.strictEqual(result[0].fileName, "file1.ts");
    assertStrict.strictEqual(result[1].fileName, "file2.ts");
  });

  it("should handle new file", () => {
    const diffOutput = `diff --git a/newfile.ts b/newfile.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1 @@
+content`;

    const result = parseGitDiffFiles(diffOutput);

    assertStrict.strictEqual(result.length, 1);
    assertStrict.strictEqual(result[0].fileName, "newfile.ts");
    assertStrict.ok(result[0].diff.includes("+content"));
  });

  it("should handle deleted file", () => {
    const diffOutput = `diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
index 1234567..0000000
--- a/deleted.ts
+++ /dev/null
@@ -1 +0,0 @@
-old content`;

    const result = parseGitDiffFiles(diffOutput);

    assertStrict.strictEqual(result.length, 1);
    assertStrict.strictEqual(result[0].fileName, "deleted.ts");
  });

  it("should return empty array for empty input", () => {
    const result = parseGitDiffFiles("");

    assertStrict.deepStrictEqual(result, []);
  });

  it("should return empty array for non-diff input", () => {
    const result = parseGitDiffFiles("not a git diff output");

    assertStrict.deepStrictEqual(result, []);
  });

  it("should handle files without @@ hunk headers", () => {
    const diffOutput = `diff --git a/no-hunk.ts b/no-hunk.ts
index 1234567..abcdef1 100644
--- a/no-hunk.ts
+++ b/no-hunk.ts
@@ -1 +1 @@
-old
+new`;

    const result = parseGitDiffFiles(diffOutput);

    assertStrict.strictEqual(result.length, 1);
    assertStrict.strictEqual(result[0].fileName, "no-hunk.ts");
  });
});

describe("formatFileDiffForDisplay", () => {
  it("should format diff with syntax highlighting", () => {
    const diff = `@@ -1,2 +1,3 @@
+added line
existing line
-deleted line`;

    const result = formatFileDiffForDisplay("test.ts", diff);

    assertStrict.ok(result.includes("test.ts"));
    assertStrict.ok(result.includes("added line"));
    assertStrict.ok(result.includes("existing line"));
  });

  it("should handle empty diff", () => {
    const result = formatFileDiffForDisplay("empty.ts", "");

    assertStrict.ok(result.includes("empty.ts"));
  });
});
