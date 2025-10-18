import assert from "node:assert/strict";
import test from "node:test";

import {
  countActualMatches,
  countContextLines,
  parseRipgrepOutput,
} from "../../source/tools/grep.ts";

test("enhanced parsing handles complex real-world scenarios", () => {
  // Test with mixed file formats and context lines
  const complexOutput = `file1.ts:10:export function testFunction()
file1.ts-11-  // This is a test function
file1.ts-12-  console.log("test")
file1.ts:13:  return "test result"
--
file2.js:5:const testVar = "value"
file2.js-6-// test comment
file2.js:7:testFunction(testVar)`;

  const result = parseRipgrepOutput(complexOutput);

  assert.strictEqual(result.length, 7);

  // Verify match lines
  const matches = result.filter((m) => m.isMatch && !m.isContext);
  assert.strictEqual(matches.length, 4);

  // Verify context lines
  const context = result.filter((m) => m.isContext);
  assert.strictEqual(context.length, 3);

  // Verify separator line was skipped
  assert.strictEqual(
    result.find((m) => m.content === "--"),
    undefined,
  );
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

test("parseRipgrepOutput handles edge cases gracefully", () => {
  // Test with empty content
  const emptyResult = parseRipgrepOutput("");
  assert.strictEqual(emptyResult.length, 0);

  // Test with only separator lines
  const separatorsOnly = parseRipgrepOutput("--\n--\n--");
  assert.strictEqual(separatorsOnly.length, 0);

  // Test with only empty lines
  const emptyLinesOnly = parseRipgrepOutput("\n\n\n");
  assert.strictEqual(emptyLinesOnly.length, 0);
});

test("parseRipgrepOutput handles single file with context correctly", () => {
  const input = `1:match line 1
2-context line 1
3-context line 2
4:match line 2`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 4);

  assert.deepStrictEqual(result[0], {
    line: 1,
    content: "match line 1",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    line: 2,
    content: "context line 1",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[2], {
    line: 3,
    content: "context line 2",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[3], {
    line: 4,
    content: "match line 2",
    isMatch: true,
  });
});
