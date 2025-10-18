import assert from "node:assert/strict";
import test from "node:test";

import {
  countActualMatches,
  countContextLines,
  extractMatches,
  type ParsedMatch,
  parseRipgrepOutput,
} from "../../source/tools/grep.ts";

test("parseRipgrepOutput handles single file format", () => {
  const input = `1:This is a test file
4:containing the word test
5:and another test line`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 3);

  assert.deepStrictEqual(result[0], {
    line: 1,
    content: "This is a test file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    line: 4,
    content: "containing the word test",
    isMatch: true,
  });

  assert.deepStrictEqual(result[2], {
    line: 5,
    content: "and another test line",
    isMatch: true,
  });
});

test("parseRipgrepOutput handles multi-file format", () => {
  const input = `test-data/file1.txt:1:This is a test file
test-data/file1.txt:4:containing the word test
test-data/file2.txt:3:but also containing test`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 3);

  assert.deepStrictEqual(result[0], {
    file: "test-data/file1.txt",
    line: 1,
    content: "This is a test file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    file: "test-data/file1.txt",
    line: 4,
    content: "containing the word test",
    isMatch: true,
  });

  assert.deepStrictEqual(result[2], {
    file: "test-data/file2.txt",
    line: 3,
    content: "but also containing test",
    isMatch: true,
  });
});

test("parseRipgrepOutput handles context lines with files", () => {
  const input = `test-data/file1.txt:1:This is a test file
test-data/file1.txt-2-with some content
test-data/file1.txt-3-and multiple lines
test-data/file1.txt:4:containing the word test`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 4);

  assert.deepStrictEqual(result[0], {
    file: "test-data/file1.txt",
    line: 1,
    content: "This is a test file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    file: "test-data/file1.txt",
    line: 2,
    content: "with some content",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[2], {
    file: "test-data/file1.txt",
    line: 3,
    content: "and multiple lines",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[3], {
    file: "test-data/file1.txt",
    line: 4,
    content: "containing the word test",
    isMatch: true,
  });
});

test("parseRipgrepOutput handles context lines without files", () => {
  const input = `1:This is a test file
2-with some content
3-and multiple lines
4:containing the word test`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 4);

  assert.deepStrictEqual(result[0], {
    line: 1,
    content: "This is a test file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    line: 2,
    content: "with some content",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[2], {
    line: 3,
    content: "and multiple lines",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[3], {
    line: 4,
    content: "containing the word test",
    isMatch: true,
  });
});

test("parseRipgrepOutput handles separator lines", () => {
  const input = `file1.txt:1:match in file1
file1.txt-2-context in file1
--
file2.txt:1:match in file2
file2.txt-2-context in file2`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 4);
  // Separator line should be skipped
  assert.strictEqual(
    result.find((match) => match.content === "--"),
    undefined,
  );
});

test("parseRipgrepOutput handles empty lines", () => {
  const input = `file1.txt:1:match in file1

file1.txt:2:another match`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 2);
  // Empty line should be skipped
});

test("parseRipgrepOutput handles 'No matches found.'", () => {
  const result = parseRipgrepOutput("No matches found.");
  assert.strictEqual(result.length, 0);
});

test("countActualMatches counts only match lines", () => {
  const parsed: ParsedMatch[] = [
    { file: "file1.txt", line: 1, content: "match 1", isMatch: true },
    {
      file: "file1.txt",
      line: 2,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "file1.txt", line: 3, content: "match 2", isMatch: true },
    {
      file: "file1.txt",
      line: 4,
      content: "context",
      isMatch: false,
      isContext: true,
    },
  ];

  const count = countActualMatches(parsed);
  assert.strictEqual(count, 2);
});

test("countContextLines counts only context lines", () => {
  const parsed: ParsedMatch[] = [
    { file: "file1.txt", line: 1, content: "match 1", isMatch: true },
    {
      file: "file1.txt",
      line: 2,
      content: "context",
      isMatch: false,
      isContext: true,
    },
    { file: "file1.txt", line: 3, content: "match 2", isMatch: true },
    {
      file: "file1.txt",
      line: 4,
      content: "context",
      isMatch: false,
      isContext: true,
    },
  ];

  const count = countContextLines(parsed);
  assert.strictEqual(count, 2);
});

test("extractMatches maintains backwards compatibility", () => {
  // Single file format
  const singleFileInput = `1:This is a test file
4:containing the word test`;

  const singleFileResult = extractMatches(singleFileInput);
  assert.deepStrictEqual(singleFileResult, [
    "1:This is a test file",
    "4:containing the word test",
  ]);

  // Multi-file format
  const multiFileInput = `file1.txt:1:match in file1
file2.txt:2:match in file2`;

  const multiFileResult = extractMatches(multiFileInput);
  assert.deepStrictEqual(multiFileResult, [
    "file1.txt:1:match in file1",
    "file2.txt:2:match in file2",
  ]);

  // With context lines - should only return matches
  const contextInput = `file1.txt:1:match in file1
file1.txt-2-context line
file1.txt:3:another match`;

  const contextResult = extractMatches(contextInput);
  assert.deepStrictEqual(contextResult, [
    "file1.txt:1:match in file1",
    "file1.txt:3:another match",
  ]);

  // No matches
  const noMatchesResult = extractMatches("No matches found.");
  assert.deepStrictEqual(noMatchesResult, []);
});

test("parseRipgrepOutput handles mixed formats", () => {
  const input = `file1.txt:1:match with file
2:match without file
file1.txt-3-context with file
4-context without file
--
file2.txt:1:another match`;

  const result = parseRipgrepOutput(input);

  assert.strictEqual(result.length, 5);

  assert.deepStrictEqual(result[0], {
    file: "file1.txt",
    line: 1,
    content: "match with file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[1], {
    line: 2,
    content: "match without file",
    isMatch: true,
  });

  assert.deepStrictEqual(result[2], {
    file: "file1.txt",
    line: 3,
    content: "context with file",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[3], {
    line: 4,
    content: "context without file",
    isMatch: false,
    isContext: true,
  });

  assert.deepStrictEqual(result[4], {
    file: "file2.txt",
    line: 1,
    content: "another match",
    isMatch: true,
  });
});
