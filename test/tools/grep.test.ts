import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrepArgs,
  countBrackets,
  likelyUnbalancedRegex,
  matchesToLegacyFormat,
  type ParsedMatch,
  truncateMatches,
} from "../../source/tools/grep.ts";

test("countBrackets counts balanced parens, brackets, braces", () => {
  const result = countBrackets("(a)[b]{c}");
  assert.equal(result.openParen, 1);
  assert.equal(result.closeParen, 1);
  assert.equal(result.openBracket, 1);
  assert.equal(result.closeBracket, 1);
  assert.equal(result.openBrace, 1);
  assert.equal(result.closeBrace, 1);
});

test("countBrackets detects unbalanced parentheses", () => {
  const result = countBrackets("terminal.table(");
  assert.equal(result.openParen, 1);
  assert.equal(result.closeParen, 0);
});

test("countBrackets detects unbalanced brackets", () => {
  const result = countBrackets("array[");
  assert.equal(result.openBracket, 1);
  assert.equal(result.closeBracket, 0);
});

test("countBrackets detects unbalanced braces", () => {
  const result = countBrackets("const obj = {");
  assert.equal(result.openBrace, 1);
  assert.equal(result.closeBrace, 0);
});

test("countBrackets ignores escaped characters", () => {
  // backslash-escaped parens/brackets/braces should not be counted
  const result = countBrackets("\\[ \\] \\( \\) \\{ \\}");
  assert.equal(result.openParen, 0);
  assert.equal(result.closeParen, 0);
  assert.equal(result.openBracket, 0);
  assert.equal(result.closeBracket, 0);
  assert.equal(result.openBrace, 0);
  assert.equal(result.closeBrace, 0);
});

test("countBrackets ignores brackets inside character classes", () => {
  // braces inside character class are ignored, but closeBrace after ] is counted
  const result = countBrackets("[a{]");
  assert.equal(result.openBracket, 1);
  assert.equal(result.closeBracket, 1);
  assert.equal(result.openBrace, 0);
  assert.equal(result.closeBrace, 0);
});

test("countBrackets handles empty string", () => {
  const result = countBrackets("");
  assert.equal(result.openParen, 0);
  assert.equal(result.closeParen, 0);
  assert.equal(result.openBracket, 0);
  assert.equal(result.closeBracket, 0);
  assert.equal(result.openBrace, 0);
  assert.equal(result.closeBrace, 0);
});

test("countBrackets handles nested brackets", () => {
  const result = countBrackets("((a)[b]{c})");
  assert.equal(result.openParen, 2);
  assert.equal(result.closeParen, 2);
  assert.equal(result.openBracket, 1);
  assert.equal(result.closeBracket, 1);
  assert.equal(result.openBrace, 1);
  assert.equal(result.closeBrace, 1);
});

test("buildGrepArgs uses -F when literal=true", () => {
  const args = buildGrepArgs("terminal.table(", "/repo", { literal: true });
  assert.ok(args.includes("-F"));
});

test("buildGrepArgs does not use -F when literal=false", () => {
  const args = buildGrepArgs("\\w+", "/repo", { literal: false });
  assert.ok(!args.includes("-F"));
});

test("buildGrepArgs auto-detects unbalanced pattern and uses -F when literal omitted", () => {
  const args = buildGrepArgs("terminal.table(", "/repo", { literal: null });
  assert.ok(args.includes("-F"));
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

test("likelyUnbalancedRegex returns true for simple alphanumeric strings", () => {
  // Simple words should default to literal mode
  assert.ok(likelyUnbalancedRegex("Grep"));
  assert.ok(likelyUnbalancedRegex("hello world"));
  assert.ok(likelyUnbalancedRegex("test123"));
  assert.ok(likelyUnbalancedRegex("async"));
  assert.ok(likelyUnbalancedRegex("function"));
  assert.ok(likelyUnbalancedRegex("const"));
  assert.ok(likelyUnbalancedRegex("import"));
  assert.ok(likelyUnbalancedRegex("export"));
  assert.ok(likelyUnbalancedRegex("type"));
});

test("likelyUnbalancedRegex returns false for patterns with regex metacharacters", () => {
  // Patterns with regex metacharacters should use regex mode
  assert.ok(!likelyUnbalancedRegex("a.b"));
  assert.ok(!likelyUnbalancedRegex("a*b"));
  assert.ok(!likelyUnbalancedRegex("a+b"));
  assert.ok(!likelyUnbalancedRegex("a?b"));
  assert.ok(!likelyUnbalancedRegex("a|b"));
  assert.ok(!likelyUnbalancedRegex("^start"));
  assert.ok(!likelyUnbalancedRegex("end$"));
  assert.ok(!likelyUnbalancedRegex("\\d+"));
});

test("buildGrepArgs uses -F for simple alphanumeric patterns", () => {
  const args = buildGrepArgs("Grep", "/repo", { literal: null });
  assert.ok(args.includes("-F"), "Expected -F flag for simple string");
});

test("buildGrepArgs does not use -F for patterns with regex metacharacters", () => {
  const args = buildGrepArgs("a.b", "/repo", { literal: null });
  assert.ok(!args.includes("-F"), "Expected no -F flag for regex pattern");
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

test("likelyUnbalancedRegex detects invalid characters inside braces", () => {
  // Letters are invalid inside braces (only digits and commas allowed)
  assert.ok(likelyUnbalancedRegex("a{b}c"));
  assert.ok(likelyUnbalancedRegex("a{abc}c"));
  assert.ok(likelyUnbalancedRegex("a{1b}c"));
});

test("likelyUnbalancedRegex returns false for valid brace content with digits", () => {
  assert.ok(!likelyUnbalancedRegex("a{1}c"));
  assert.ok(!likelyUnbalancedRegex("a{123}c"));
  assert.ok(!likelyUnbalancedRegex("a{1,5}c"));
});

test("likelyUnbalancedRegex detects empty braces with preceding atom", () => {
  assert.ok(likelyUnbalancedRegex("a{}b"));
  assert.ok(likelyUnbalancedRegex("x{}y"));
});

test("likelyUnbalancedRegex handles empty braces at start", () => {
  assert.ok(!likelyUnbalancedRegex("{}b"));
});

test("matchesToLegacyFormat converts match with file using colon separator", () => {
  const matches: ParsedMatch[] = [
    { file: "src/app.ts", line: 42, content: "const x = 1;", isMatch: true },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "src/app.ts:42:const x = 1;");
});

test("matchesToLegacyFormat converts match without file", () => {
  const matches: ParsedMatch[] = [
    { line: 10, content: "import foo", isMatch: true },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "10:import foo");
});

test("matchesToLegacyFormat converts context line with file using dash separator", () => {
  const matches: ParsedMatch[] = [
    {
      file: "src/app.ts",
      line: 43,
      content: "  return x;",
      isMatch: false,
      isContext: true,
    },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "src/app.ts-43-  return x;");
});

test("matchesToLegacyFormat converts context line without file", () => {
  const matches: ParsedMatch[] = [
    {
      line: 11,
      content: "  // comment",
      isMatch: false,
      isContext: true,
    },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "11-  // comment");
});

test("matchesToLegacyFormat joins multiple entries with newlines", () => {
  const matches: ParsedMatch[] = [
    { file: "a.ts", line: 1, content: "line1", isMatch: true },
    { file: "a.ts", line: 2, content: "line2", isMatch: true },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "a.ts:1:line1\na.ts:2:line2");
});

test("matchesToLegacyFormat returns empty string for empty array", () => {
  const result = matchesToLegacyFormat([]);
  assert.equal(result, "");
});

test("matchesToLegacyFormat prefers lineNumber over line when both present", () => {
  const matches: ParsedMatch[] = [
    {
      file: "src/app.ts",
      line: 1,
      lineNumber: 42,
      content: "const x = 1;",
      isMatch: true,
    },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "src/app.ts:42:const x = 1;");
});

test("matchesToLegacyFormat prefers file over absolutePath when both present", () => {
  const matches: ParsedMatch[] = [
    {
      file: "src/app.ts",
      absolutePath: "/abs/path/src/app.ts",
      line: 42,
      content: "const x = 1;",
      isMatch: true,
    },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "src/app.ts:42:const x = 1;");
});

test("matchesToLegacyFormat falls back to absolutePath when file is absent", () => {
  const matches: ParsedMatch[] = [
    {
      absolutePath: "/abs/path/src/app.ts",
      line: 42,
      content: "const x = 1;",
      isMatch: true,
    },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "/abs/path/src/app.ts:42:const x = 1;");
});

test("matchesToLegacyFormat handles mixed match and context lines", () => {
  const matches: ParsedMatch[] = [
    { file: "a.ts", line: 1, content: "match1", isMatch: true },
    {
      file: "a.ts",
      line: 2,
      content: "ctx1",
      isMatch: false,
      isContext: true,
    },
    { file: "a.ts", line: 3, content: "match2", isMatch: true },
  ];
  const result = matchesToLegacyFormat(matches);
  assert.equal(result, "a.ts:1:match1\na.ts-2-ctx1\na.ts:3:match2");
});
