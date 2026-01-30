import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrepCommand,
  likelyUnbalancedRegex,
  type ParsedMatch,
  truncateMatches,
} from "../../source/tools/grep.ts";

test("buildGrepCommand uses -F when literal=true", () => {
  const cmd = buildGrepCommand("terminal.table(", "/repo", { literal: true });
  assert.ok(cmd.includes(" -F"));
});

test("buildGrepCommand does not use -F when literal=false", () => {
  const cmd = buildGrepCommand("\\w+", "/repo", { literal: false });
  assert.ok(!cmd.includes(" -F"));
});

test("buildGrepCommand auto-detects unbalanced pattern and uses -F when literal omitted", () => {
  const cmd = buildGrepCommand("terminal.table(", "/repo", { literal: null });
  assert.ok(cmd.includes(" -F"));
});

test("likelyUnbalancedRegex detects unbalanced parentheses", () => {
  assert.ok(likelyUnbalancedRegex("terminal.table("));
  assert.ok(likelyUnbalancedRegex("spawnChildProcess({"));
  assert.ok(likelyUnbalancedRegex("function test("));
  assert.ok(!likelyUnbalancedRegex("function test()"));
});

test("likelyUnbalancedRegex detects unbalanced brackets", () => {
  assert.ok(likelyUnbalancedRegex("array["));
  assert.ok(!likelyUnbalancedRegex("array[0]"));
});

test("likelyUnbalancedRegex detects unbalanced braces", () => {
  assert.ok(likelyUnbalancedRegex("const obj = {"));
  assert.ok(!likelyUnbalancedRegex("const obj = {}"));
});

test("likelyUnbalancedRegex detects invalid repetition operators", () => {
  assert.ok(likelyUnbalancedRegex("a{"));
  assert.ok(likelyUnbalancedRegex("a{1"));
  assert.ok(likelyUnbalancedRegex("a{1,"));
  assert.ok(likelyUnbalancedRegex("a{}"));
  assert.ok(!likelyUnbalancedRegex("a{1}"));
  assert.ok(!likelyUnbalancedRegex("a{1,5}"));
});

test("likelyUnbalancedRegex does not treat { inside character classes as repetition", () => {
  assert.ok(!likelyUnbalancedRegex("[a{]"));
  assert.ok(!likelyUnbalancedRegex("[\\}]"));
});

test("likelyUnbalancedRegex handles character classes correctly", () => {
  assert.ok(!likelyUnbalancedRegex("[a-z]"));
  assert.ok(!likelyUnbalancedRegex("[\\w+]"));
  assert.ok(likelyUnbalancedRegex("[a-z"));
});

test("likelyUnbalancedRegex handles escape sequences", () => {
  assert.ok(!likelyUnbalancedRegex("\\["));
  assert.ok(!likelyUnbalancedRegex("\\]"));
  assert.ok(!likelyUnbalancedRegex("\\("));
  assert.ok(!likelyUnbalancedRegex("\\)"));
  assert.ok(!likelyUnbalancedRegex("\\{"));
  assert.ok(!likelyUnbalancedRegex("\\}"));
});

test("truncateMatches with null maxResults returns all results", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    { file: "f1.ts", line: 2, content: "match 2", isMatch: true },
    { file: "f1.ts", line: 3, content: "match 3", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, null);

  assert.strictEqual(isTruncated, false);
  assert.strictEqual(truncated.length, 3);
});

test("truncateMatches with zero maxResults returns all results", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    { file: "f1.ts", line: 2, content: "match 2", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, 0);

  assert.strictEqual(isTruncated, false);
  assert.strictEqual(truncated.length, 2);
});

test("truncateMatches respects maxResults limit", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    { file: "f1.ts", line: 2, content: "match 2", isMatch: true },
    { file: "f1.ts", line: 3, content: "match 3", isMatch: true },
    { file: "f2.ts", line: 1, content: "match 4", isMatch: true },
    { file: "f2.ts", line: 2, content: "match 5", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, 3);

  assert.strictEqual(isTruncated, true);
  assert.strictEqual(truncated.length, 3);
  assert.strictEqual(truncated[0].content, "match 1");
  assert.strictEqual(truncated[1].content, "match 2");
  assert.strictEqual(truncated[2].content, "match 3");
});

test("truncateMatches with limit higher than results count returns all", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    { file: "f1.ts", line: 2, content: "match 2", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, 10);

  assert.strictEqual(isTruncated, false);
  assert.strictEqual(truncated.length, 2);
});

test("truncateMatches counts only actual matches for limit", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    {
      file: "f1.ts",
      line: 2,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "f1.ts", line: 3, content: "match 2", isMatch: true },
    {
      file: "f1.ts",
      line: 4,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "f1.ts", line: 5, content: "match 3", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, 2);

  assert.strictEqual(isTruncated, true);
  const actualMatches = truncated.filter((m) => m.isMatch && !m.isContext);
  assert.strictEqual(actualMatches.length, 2);
});

test("truncateMatches with limit of 1", () => {
  const matches: ParsedMatch[] = [
    { file: "f1.ts", line: 1, content: "match 1", isMatch: true },
    { file: "f1.ts", line: 2, content: "match 2", isMatch: true },
  ];

  const { truncated, isTruncated } = truncateMatches(matches, 1);

  assert.strictEqual(isTruncated, true);
  assert.strictEqual(truncated.length, 1);
  assert.strictEqual(truncated[0].content, "match 1");
});
