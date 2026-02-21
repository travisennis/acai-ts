import assert from "node:assert/strict";
import test from "node:test";

import {
  countActualMatches,
  countContextLines,
  parseRipgrepJsonOutput,
} from "../../source/tools/grep.ts";

test("JSON parsing handles ripgrep JSON output correctly", () => {
  // Simulated ripgrep JSON output (using direct strings to avoid lint warnings)
  const jsonOutput =
    '{"type":"match","data":{"path":{"text":"file1.ts"},"line_number":10,"lines":{"text":"export function testFunction()\\n"},"submatches":[{"start":0,"end":7,"text":"export"}]}}\n' +
    '{"type":"context","data":{"path":{"text":"file1.ts"},"line_number":11,"lines":{"text":"  // This is a test function\\n"}}}\n' +
    '{"type":"match","data":{"path":{"text":"file1.ts"},"line_number":13,"lines":{"text":"  return \\"test result\\"\\n"}}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 3);

  // Verify match lines
  const matches = result.filter((m) => m.isMatch && !m.isContext);
  assert.strictEqual(matches.length, 2);

  // Verify context lines
  const context = result.filter((m) => m.isContext);
  assert.strictEqual(context.length, 1);

  // Verify file path
  assert.strictEqual(result[0].file, "file1.ts");
  assert.strictEqual(result[0].lineNumber, 10);
});

test("countActualMatches correctly excludes context lines", () => {
  const parsed: import("../../source/tools/grep.ts").ParsedMatch[] = [
    { file: "file1.ts", line: 1, content: "match 1", isMatch: true },
    {
      file: "file1.ts",
      line: 2,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "file1.ts", line: 3, content: "match 2", isMatch: true },
    {
      file: "file1.ts",
      line: 4,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "file2.ts", line: 1, content: "match 3", isMatch: true },
  ];

  const count = countActualMatches(parsed);
  assert.strictEqual(count, 3);
});

test("countContextLines correctly counts only context lines", () => {
  const parsed: import("../../source/tools/grep.ts").ParsedMatch[] = [
    { file: "file1.ts", line: 1, content: "match 1", isMatch: true },
    {
      file: "file1.ts",
      line: 2,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "file1.ts", line: 3, content: "match 2", isMatch: true },
    {
      file: "file1.ts",
      line: 4,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    {
      file: "file1.ts",
      line: 5,
      content: "context",
      isMatch: false,
      isContext: true,
    },
  ];

  const count = countContextLines(parsed);
  assert.strictEqual(count, 3);
});

test("parseRipgrepJsonOutput handles edge cases gracefully", () => {
  // Test with empty content
  const emptyResult = parseRipgrepJsonOutput("");
  assert.strictEqual(emptyResult.length, 0);

  // Test with only whitespace
  const whitespaceOnly = parseRipgrepJsonOutput("   \n   \n   ");
  assert.strictEqual(whitespaceOnly.length, 0);

  // Test with invalid JSON lines
  const invalidJson = parseRipgrepJsonOutput("not json\nalso not json");
  assert.strictEqual(invalidJson.length, 0);
});

test("parseRipgrepJsonOutput extracts submatch information", () => {
  const jsonOutput =
    '{"type":"match","data":{"path":{"text":"test.ts"},"line_number":5,"lines":{"text":"const foo = \'bar\'\\n"},"submatches":[{"start":6,"end":9,"text":"foo"},{"start":13,"end":16,"text":"bar"}]}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].isMatch, true);
  assert.deepStrictEqual(result[0].submatches, [
    { start: 6, end: 9, text: "foo" },
    { start: 13, end: 16, text: "bar" },
  ]);
});
