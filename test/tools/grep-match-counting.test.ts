import assert from "node:assert/strict";
import test from "node:test";

import {
  countActualMatches,
  countContextLines,
  type ParsedMatch,
  parseRipgrepJsonOutput,
} from "../../source/tools/grep.ts";

test("parseRipgrepJsonOutput handles single file format", () => {
  const jsonOutput =
    '{"type":"match","data":{"path":{"text":"test.ts"},"line_number":1,"lines":{"text":"This is a test file"}}}\n' +
    '{"type":"match","data":{"path":{"text":"test.ts"},"line_number":4,"lines":{"text":"containing the word test"}}}\n' +
    '{"type":"match","data":{"path":{"text":"test.ts"},"line_number":5,"lines":{"text":"and another test line"}}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 3);

  assert.strictEqual(result[0].line, 1);
  assert.strictEqual(result[0].content, "This is a test file");
  assert.strictEqual(result[0].isMatch, true);

  assert.strictEqual(result[1].line, 4);
  assert.strictEqual(result[1].content, "containing the word test");
  assert.strictEqual(result[1].isMatch, true);

  assert.strictEqual(result[2].line, 5);
  assert.strictEqual(result[2].content, "and another test line");
  assert.strictEqual(result[2].isMatch, true);
});

test("parseRipgrepJsonOutput handles multi-file format", () => {
  const jsonOutput =
    '{"type":"match","data":{"path":{"text":"test-data/file1.txt"},"line_number":1,"lines":{"text":"This is a test file"}}}\n' +
    '{"type":"match","data":{"path":{"text":"test-data/file1.txt"},"line_number":4,"lines":{"text":"containing the word test"}}}\n' +
    '{"type":"match","data":{"path":{"text":"test-data/file2.txt"},"line_number":3,"lines":{"text":"but also containing test"}}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 3);

  assert.strictEqual(result[0].file, "test-data/file1.txt");
  assert.strictEqual(result[0].line, 1);
  assert.strictEqual(result[0].content, "This is a test file");
  assert.strictEqual(result[0].isMatch, true);

  assert.strictEqual(result[1].file, "test-data/file1.txt");
  assert.strictEqual(result[1].line, 4);
  assert.strictEqual(result[1].content, "containing the word test");
  assert.strictEqual(result[1].isMatch, true);

  assert.strictEqual(result[2].file, "test-data/file2.txt");
  assert.strictEqual(result[2].line, 3);
  assert.strictEqual(result[2].content, "but also containing test");
  assert.strictEqual(result[2].isMatch, true);
});

test("parseRipgrepJsonOutput handles context lines with files", () => {
  const jsonOutput =
    '{"type":"match","data":{"path":{"text":"test-data/file1.txt"},"line_number":1,"lines":{"text":"This is a test file"}}}\n' +
    '{"type":"context","data":{"path":{"text":"test-data/file1.txt"},"line_number":2,"lines":{"text":"with some content"}}}\n' +
    '{"type":"context","data":{"path":{"text":"test-data/file1.txt"},"line_number":3,"lines":{"text":"and multiple lines"}}}\n' +
    '{"type":"match","data":{"path":{"text":"test-data/file1.txt"},"line_number":4,"lines":{"text":"containing the word test"}}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 4);

  assert.strictEqual(result[0].file, "test-data/file1.txt");
  assert.strictEqual(result[0].line, 1);
  assert.strictEqual(result[0].content, "This is a test file");
  assert.strictEqual(result[0].isMatch, true);

  assert.strictEqual(result[1].file, "test-data/file1.txt");
  assert.strictEqual(result[1].line, 2);
  assert.strictEqual(result[1].content, "with some content");
  assert.strictEqual(result[1].isMatch, false);
  assert.strictEqual(result[1].isContext, true);

  assert.strictEqual(result[2].file, "test-data/file1.txt");
  assert.strictEqual(result[2].line, 3);
  assert.strictEqual(result[2].content, "and multiple lines");
  assert.strictEqual(result[2].isMatch, false);
  assert.strictEqual(result[2].isContext, true);

  assert.strictEqual(result[3].file, "test-data/file1.txt");
  assert.strictEqual(result[3].line, 4);
  assert.strictEqual(result[3].content, "containing the word test");
  assert.strictEqual(result[3].isMatch, true);
});

test("parseRipgrepJsonOutput handles context lines without files", () => {
  const jsonOutput =
    '{"type":"match","data":{"line_number":1,"lines":{"text":"This is a test file"}}}\n' +
    '{"type":"context","data":{"line_number":2,"lines":{"text":"with some content"}}}\n' +
    '{"type":"context","data":{"line_number":3,"lines":{"text":"and multiple lines"}}}\n' +
    '{"type":"match","data":{"line_number":4,"lines":{"text":"containing the word test"}}}';

  const result = parseRipgrepJsonOutput(jsonOutput);

  assert.strictEqual(result.length, 4);

  assert.strictEqual(result[0].line, 1);
  assert.strictEqual(result[0].content, "This is a test file");
  assert.strictEqual(result[0].isMatch, true);

  assert.strictEqual(result[1].line, 2);
  assert.strictEqual(result[1].content, "with some content");
  assert.strictEqual(result[1].isMatch, false);
  assert.strictEqual(result[1].isContext, true);

  assert.strictEqual(result[2].line, 3);
  assert.strictEqual(result[2].content, "and multiple lines");
  assert.strictEqual(result[2].isMatch, false);
  assert.strictEqual(result[2].isContext, true);

  assert.strictEqual(result[3].line, 4);
  assert.strictEqual(result[3].content, "containing the word test");
  assert.strictEqual(result[3].isMatch, true);
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

test("parseRipgrepJsonOutput handles empty input", () => {
  const result = parseRipgrepJsonOutput("");
  assert.strictEqual(result.length, 0);
});
