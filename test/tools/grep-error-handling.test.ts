import assert from "node:assert/strict";
import test from "node:test";

import { buildGrepCommand, grepFiles } from "../../source/tools/grep.ts";

test("grepFiles handles exit code 1 (no matches) gracefully", () => {
  // Use a pattern that definitely won't match anything
  const result = grepFiles("nonexistentpattern12345xyzabc", "/tmp", {
    literal: true,
  });
  assert.strictEqual(result, "No matches found.");
});

test("grepFiles handles problematic patterns with fixed-string mode", () => {
  // This pattern would cause regex parse error without fixed-string mode
  const result = grepFiles("loadDynamicTools({", ".", { literal: true });
  // Should either find matches or return "No matches found." without throwing
  assert.ok(result === "No matches found." || result.includes(":"));
});

test("buildGrepCommand properly escapes patterns", () => {
  const cmd = buildGrepCommand("test pattern", ".", { literal: true });
  assert.ok(cmd.includes('"test pattern"'));
});

test("buildGrepCommand handles glob patterns correctly", () => {
  const cmd = buildGrepCommand("test", ".", { filePattern: "*.ts" });
  assert.ok(cmd.includes('--glob="*.ts"'));
});

test("buildGrepCommand handles context lines", () => {
  const cmd = buildGrepCommand("test", ".", { contextLines: 3 });
  assert.ok(cmd.includes("--context=3"));
});

test("buildGrepCommand handles ignore case", () => {
  const cmd = buildGrepCommand("test", ".", { ignoreCase: true });
  assert.ok(cmd.includes("--ignore-case"));
});

test("buildGrepCommand handles search ignored files", () => {
  const cmd = buildGrepCommand("test", ".", { searchIgnored: true });
  assert.ok(cmd.includes("--no-ignore"));
});

test("buildGrepCommand handles non-recursive search", () => {
  const cmd = buildGrepCommand("test", ".", { recursive: false });
  assert.ok(cmd.includes("--max-depth=0"));
});

test("buildGrepCommand quotes path with spaces", () => {
  const cmd = buildGrepCommand("test", "./dir with spaces", { literal: true });
  assert.ok(cmd.includes('"./dir with spaces"'));
});
