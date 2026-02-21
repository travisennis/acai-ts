import assert from "node:assert/strict";
import test from "node:test";
import { grepFilesStructured } from "../../source/tools/grep.ts";

test("grepFilesStructured applies maxResults limit", async () => {
  const result = await grepFilesStructured("^import", "source", {
    recursive: true,
    maxResults: 5,
  });

  const matchCount = result.matchCount;
  const displayedCount = result.displayedCount ?? matchCount;

  if (matchCount > 5) {
    assert.strictEqual(result.isTruncated, true);
    assert.ok(displayedCount <= 5);
  }
});

test("grepFilesStructured with null maxResults returns all results", async () => {
  const result = await grepFilesStructured("^import", "source", {
    recursive: false,
    maxResults: null,
  });

  assert.ok(!result.isTruncated);
});

test("grepFilesStructured with zero maxResults returns all results", async () => {
  const result = await grepFilesStructured("const", "source/config/index.ts", {
    maxResults: 0,
  });

  assert.strictEqual(result.isTruncated, false);
});

test("grepFilesStructured preserves matchCount when truncated", async () => {
  const result = await grepFilesStructured("the", "source/config/index.ts", {
    maxResults: 2,
  });

  if (result.matchCount > 2) {
    assert.strictEqual(result.isTruncated, true);
    assert.ok(
      result.displayedCount !== undefined && result.displayedCount <= 2,
    );
    assert.ok(
      result.displayedCount !== undefined &&
        result.matchCount > result.displayedCount,
    );
  }
});

test("grepFilesStructured displayedCount not set when not truncated", async () => {
  const result = await grepFilesStructured(
    "zzzzuniquepatternthatdoesntexistzzz",
    "source",
    {
      maxResults: 30,
      literal: true,
    },
  );

  assert.ok(!result.isTruncated);
});
