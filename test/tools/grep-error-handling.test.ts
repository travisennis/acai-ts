import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildGrepArgs, grepFilesStructured } from "../../source/tools/grep.ts";

test("grepFilesStructured handles exit code 1 (no matches) gracefully", async () => {
  // Use a unique temp directory to avoid matching test file contents
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "acai-grep-test-"));
  try {
    // Use a pattern that definitely won't match anything
    const result = await grepFilesStructured(
      "nonexistentpattern12345xyzabc",
      tmpDir,
      {
        literal: true,
      },
    );
    assert.strictEqual(result.rawOutput, "No matches found.");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("grepFilesStructured handles problematic patterns with fixed-string mode", async () => {
  // This pattern would cause regex parse error without fixed-string mode
  const result = await grepFilesStructured("spawnChildProcess({", ".", {
    literal: true,
  });
  // Should either find matches or return "No matches found." without throwing
  assert.ok(
    result.rawOutput === "No matches found." || result.rawOutput.includes(":"),
  );
});

test("buildGrepArgs passes patterns directly (no shell escaping needed)", () => {
  const args = buildGrepArgs("test pattern", ".", { literal: true });
  // When using args array, pattern is passed directly without shell escaping
  assert.strictEqual(args[args.length - 2], "test pattern");
});

test("buildGrepArgs handles glob patterns correctly", () => {
  const args = buildGrepArgs("test", ".", { filePattern: "*.ts" });
  assert.ok(args.includes("--glob=*.ts"));
});

test("buildGrepArgs handles context lines", () => {
  const args = buildGrepArgs("test", ".", { contextLines: 3 });
  assert.ok(args.includes("--context=3"));
});

test("buildGrepArgs handles ignore case", () => {
  const args = buildGrepArgs("test", ".", { ignoreCase: true });
  assert.ok(args.includes("--ignore-case"));
});

test("buildGrepArgs handles search ignored files", () => {
  const args = buildGrepArgs("test", ".", { searchIgnored: true });
  assert.ok(args.includes("--no-ignore"));
});

test("buildGrepArgs handles non-recursive search", () => {
  const args = buildGrepArgs("test", ".", { recursive: false });
  assert.ok(args.includes("--max-depth=0"));
});

test("buildGrepArgs passes path with spaces directly (no shell escaping needed)", () => {
  const args = buildGrepArgs("test", "./dir with spaces", { literal: true });
  // When using args array, path is passed directly without shell escaping
  assert.strictEqual(args[args.length - 1], "./dir with spaces");
});
