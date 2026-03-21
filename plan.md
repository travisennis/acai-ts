# Implementation Plan: Enhanced Edit Tool with Preflight Validation, Fuzzy Matching, and Reverse-Order Multi-Edit

## Overview

Enhance acai's `Edit` tool (`source/tools/edit-file.ts`) with three major features:

1. **Preflight Validation**: Validate ALL edits against the original content before applying ANY changes to disk. This ensures atomicity - either all edits succeed or none are applied.

2. **Fuzzy Matching**: When exact text matching fails, attempt fuzzy matching that normalizes Unicode, smart quotes, dashes, and whitespace. This improves resilience when LLMs use typographically correct characters that don't match source code. **Important**: When fuzzy matching is used, the entire file content is normalized (smart quotes → straight quotes, trailing whitespace stripped, etc.) as a side effect.

3. **Reverse-Order Multi-Edit Application**: Apply edits from highest position to lowest. This prevents position shifting issues where earlier edits change the location of later edits. All edits search the **original** content, not modified content from previous edits.

## Current Implementation Analysis

The current `applyFileEdits` function in `source/tools/edit-file.ts`:

- Reads file content and normalizes line endings to LF internally
- Applies edits sequentially using `applyEditsSequentially`
- Each edit modifies `modifiedContent` in place
- Edit N searches the result of edits 1 through N-1 (chained dependency)
- If any edit fails, an error is thrown - but previous edits in the sequence have already modified the working copy
- File is only written after all edits succeed
- Has partial atomicity (no partial writes) but no preflight (may fail mid-sequence)

**Current flow (sequential):**
```
read file → for each edit: find in modifiedContent → replace → continue
             ↑ edit 3 searches content that includes edits 1-2
```

**New flow (reverse-order):**
```
read file → find ALL edit positions in original content → sort by position (highest first) 
             → apply from end to beginning → each edit operates on independent original location
```

**Why reverse-order is better:**
- No position shifting - edit 5 doesn't affect where edit 4 is located
- All edits search original content (simpler mental model)
- Detects overlapping edits (can't have two edits touching the same text)
- Chained edits (A→B, B→C) are not supported - but this is fine because you should just do A→C directly

## Goals

1. Add preflight validation that checks all edits can succeed before modifying the file
2. Add fuzzy matching as a fallback when exact matching fails (normalizes file content as side effect)
3. Apply multi-edits in reverse position order to avoid position shifting
4. Detect and reject overlapping edit regions
5. Maintain backward compatibility - existing behavior unchanged unless fuzzy match needed
6. Provide clear feedback about fuzzy matching usage
7. Keep the implementation simple and maintainable

## Implementation Details

### Step 1: Add Types and Fuzzy Matching Utilities

Add these to `source/tools/edit-file.ts` after the existing utility functions:

```typescript
/**
 * Normalize text for fuzzy matching by:
 * - Unicode NFKC normalization (canonical compatibility decomposition)
 * - Converting smart quotes to straight quotes
 * - Unifying various dash characters to hyphen
 * - Normalizing whitespace characters to regular space
 * - Removing trailing whitespace from each line
 */
function normalizeForFuzzyMatch(text: string): string {
  return text
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // curly single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // curly double quotes → "
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")  // dashes → -
    .replace(/[\u00A0\u2002-\u200A\u202F\x205F\u3000]/g, " ");      // spaces → space
}

interface FuzzyMatchResult {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
}

/**
 * Find text in content, trying exact match first, then fuzzy match.
 * When fuzzy match is used, positions are in the normalized content.
 * IMPORTANT: When fuzzy matching is needed, the caller must work entirely
 * in normalized space to avoid position mapping issues.
 */
function fuzzyFindText(
  content: string,
  searchText: string,
): FuzzyMatchResult {
  // Try exact match first
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: searchText.length,
      usedFuzzyMatch: false,
    };
  }

  // Fall back to fuzzy matching
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzySearch = normalizeForFuzzyMatch(searchText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzySearch);

  if (fuzzyIndex === -1) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false };
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzySearch.length,
    usedFuzzyMatch: true,
  };
}

/**
 * Count how many times searchText appears in content (exact or fuzzy).
 * Used to ensure uniqueness.
 */
function countMatches(
  content: string,
  searchText: string,
): number {
  // Count exact matches first
  const exactEscaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactRegex = new RegExp(exactEscaped, "g");
  const exactMatches = content.match(exactRegex);
  const exactCount = exactMatches ? exactMatches.length : 0;

  if (exactCount > 0) {
    return exactCount;
  }

  // Count fuzzy matches
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzySearch = normalizeForFuzzyMatch(searchText);
  const fuzzyEscaped = fuzzySearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fuzzyRegex = new RegExp(fuzzyEscaped, "g");
  const fuzzyMatches = fuzzyContent.match(fuzzyRegex);
  return fuzzyMatches ? fuzzyMatches.length : 0;
}
```

### Step 2: Add Preflight Validation with Reverse-Order Logic

Replace the existing approach with this preflight function. **Key insight**: When fuzzy matching is needed, we normalize the entire content and work in normalized space. This avoids position mapping issues.

```typescript
interface MatchedEdit extends FileEdit {
  index: number;        // Position in content (normalized if fuzzy matching)
  matchLength: number;  // Length of matched text
  editIndex: number;    // Original index in edits array
}

interface PreflightResult {
  success: boolean;
  matchedEdits: MatchedEdit[];
  errorMessage?: string;
  usedFuzzyMatch: boolean;
  baseContent: string;  // Content to apply edits to (normalized if fuzzy)
}

/**
 * Preflight validation: Find all edit positions, validate uniqueness and no overlaps.
 * If any edit requires fuzzy matching, normalize the entire content and work in
 * normalized space. This avoids position mapping issues.
 */
function preflightEdits(
  edits: FileEdit[],
  content: string,
): PreflightResult {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeLineEndings(edit.oldText),
    newText: normalizeLineEndings(edit.newText),
  }));

  // Check if any edit requires fuzzy matching
  const needsFuzzyMatching = normalizedEdits.some(
    (edit) => content.indexOf(edit.oldText) === -1,
  );

  // Use normalized content if fuzzy matching is needed
  const baseContent = needsFuzzyMatching
    ? normalizeForFuzzyMatch(content)
    : content;

  const matchedEdits: MatchedEdit[] = [];

  // First pass: Find all match positions
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];

    // Check uniqueness
    const matchCount = countMatches(baseContent, edit.oldText);

    if (matchCount === 0) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edit ${i + 1}: Could not find the exact text. ` +
          "The oldText must match exactly including all whitespace and newlines.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    if (matchCount > 1) {
      const fuzzyContext = needsFuzzyMatching ? " (including fuzzy matches)" : "";
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edit ${i + 1}: oldText matches ${matchCount} locations${fuzzyContext} but should match only 1. ` +
          "Please provide a more specific oldText that includes more surrounding context.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    // Find the match position
    const matchResult = fuzzyFindText(baseContent, edit.oldText);

    if (!matchResult.found) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage: `Edit ${i + 1}: Could not find the text (unexpected error).`,
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    matchedEdits.push({
      ...edit,
      index: matchResult.index,
      matchLength: matchResult.matchLength,
      editIndex: i,
    });
  }

  // Sort by position (ascending) for overlap detection
  matchedEdits.sort((a, b) => a.index - b.index);

  // Check for overlapping edits
  for (let i = 0; i < matchedEdits.length - 1; i++) {
    const current = matchedEdits[i];
    const next = matchedEdits[i + 1];

    // Check if current edit overlaps with next edit
    if (current.index + current.matchLength > next.index) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edits ${current.editIndex + 1} and ${next.editIndex + 1} overlap in the file. ` +
          "Each edit must target a distinct region. Please combine overlapping edits into a single edit.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }
  }

  return {
    success: true,
    matchedEdits,
    usedFuzzyMatch: needsFuzzyMatching,
    baseContent,
  };
}
```

### Step 3: Add Reverse-Order Edit Application

```typescript
/**
 * Apply edits in reverse position order (highest index first).
 * This prevents position shifting - earlier edits don't affect later ones.
 * All positions are relative to baseContent (normalized if fuzzy matching).
 */
function applyEditsReverseOrder(
  content: string,
  matchedEdits: MatchedEdit[],
): string {
  let result = content;

  // Process in reverse order (highest index first)
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i];
    const before = result.slice(0, edit.index);
    const after = result.slice(edit.index + edit.matchLength);
    result = before + edit.newText + after;
  }

  return result;
}
```

### Step 4: Update Main applyFileEdits Function

Replace the existing `applyFileEdits` function:

```typescript
export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }

  await validateFileReadable(filePath);

  const rawContent = await readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  const { bom: originalBom, text: bomStrippedContent } = stripBom(rawContent);
  const originalLineEnding = detectLineEnding(bomStrippedContent);
  const content = normalizeLineEndings(bomStrippedContent);

  validateEdits(edits);

  // PREFLIGHT: Find all positions, validate no overlaps
  const preflight = preflightEdits(edits, content);

  if (!preflight.success) {
    throw new Error(`Edit validation failed: ${preflight.errorMessage}`);
  }

  // All edits validated - apply in reverse order
  // Note: baseContent is normalized if fuzzy matching was needed
  const modifiedContent = applyEditsReverseOrder(preflight.baseContent, preflight.matchedEdits);

  // Verify something actually changed
  if (modifiedContent === preflight.baseContent) {
    throw new Error("No changes were made - all edits resulted in identical content");
  }

  const finalContentWithLineEndings = restoreLineEndings(
    modifiedContent,
    originalLineEnding,
  );
  const finalContent = originalBom + finalContentWithLineEndings;

  // Use baseContent for diff (normalized if fuzzy matching)
  const diff = createUnifiedDiff(preflight.baseContent, modifiedContent, filePath);
  const formattedDiff = formatDiff(diff, filePath);

  // Add fuzzy match indicator if applicable
  const result = preflight.usedFuzzyMatch
    ? `${formattedDiff}\n\n(Note: Used fuzzy matching - file content has been normalized)`
    : formattedDiff;

  if (!dryRun) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    await writeFile(filePath, finalContent, {
      encoding: "utf-8",
      signal: abortSignal,
    });
  }

  return result;
}
```

**Important**: When fuzzy matching is used, the file content is normalized (smart quotes → straight quotes, trailing whitespace stripped, etc.). This is a side effect of the fuzzy matching approach and is acceptable for source code files.

### Step 6: Remove or Deprecate Old Functions

The following functions are replaced by the new approach and can be removed:

- `applyEditsSequentially` - replaced by `applyEditsReverseOrder`
- `applyNormalizedEdit` - logic merged into `preflightEdits`
- `countMatches` (old version) - replaced by new `countMatches` with fuzzy support

Keep these existing functions (they're still needed):
- `validateEdits` - still validates edit structure
- `applyLiteralEdit` - can keep as utility, though not used in new flow

### Step 7: Comprehensive Test Suite

Replace the contents of `test/tools/edit-file.test.ts` with this comprehensive test suite:

```typescript
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { applyFileEdits } from "../../source/tools/edit-file.ts";
import { createTestFixtures } from "../utils/test-fixtures.ts";

describe("editFile tool", () => {
  describe("basic single edit", () => {
    it("should apply single edit successfully", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world! This is a test.";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: "world", newText: "universe" }],
          true, // dry run
        );

        assert(result.includes("Hello universe! This is a test."));
        assert(result.includes("@@")); // Should contain diff markers
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should throw error when oldText not found", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [{ oldText: "nonexistent", newText: "replacement" }],
              true,
            ),
          {
            name: "Error",
            message: /Could not find the exact text/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should handle empty oldText validation", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [{ oldText: "", newText: "replacement" }],
              true,
            ),
          {
            name: "Error",
            message: /oldText must be at least one character/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });
  });

  describe("reverse-order multi-edit", () => {
    it("should apply multiple edits in reverse position order", async () => {
      const fixtures = await createTestFixtures("edit-file-multi");
      const testContent = "alpha beta gamma delta";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // Edits are NOT sequential - all search original content
        await applyFileEdits(
          tempFile,
          [
            { oldText: "alpha", newText: "A" },    // position 0
            { oldText: "beta", newText: "B" },     // position 6
            { oldText: "gamma", newText: "C" },    // position 11
            { oldText: "delta", newText: "D" },    // position 17
          ],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "A B C D");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should detect overlapping edits", async () => {
      const fixtures = await createTestFixtures("edit-file-multi");
      const testContent = "hello world test";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // "hello world" and "world test" overlap on "world"
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [
                { oldText: "hello world", newText: "hi" },
                { oldText: "world test", newText: "there" },
              ],
              true,
            ),
          {
            name: "Error",
            message: /overlap/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should reject multiple matches for same oldText", async () => {
      const fixtures = await createTestFixtures("edit-file-multi");
      const testContent = "foo bar foo baz";  // "foo" appears twice
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [{ oldText: "foo", newText: "qux" }],
              true,
            ),
          {
            name: "Error",
            message: /matches \d+ locations/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should not modify file if any edit fails preflight", async () => {
      const fixtures = await createTestFixtures("edit-file-multi");
      const testContent = "line1 line2 line3";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [
                { oldText: "line1", newText: "L1" },
                { oldText: "nonexistent", newText: "XX" },  // Will fail
                { oldText: "line3", newText: "L3" },
              ],
              false,
            ),
          {
            name: "Error",
            message: /Edit 2/,
          },
        );

        // Verify file was NOT modified
        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, testContent);
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should report edit number in error messages", async () => {
      const fixtures = await createTestFixtures("edit-file-multi");
      const testContent = "abc def ghi";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        let errorMessage = "";
        try {
          await applyFileEdits(
            tempFile,
            [
              { oldText: "abc", newText: "ABC" },
              { oldText: "xyz", newText: "XYZ" },  // Edit 2 fails
            ],
            false,
          );
        } catch (error) {
          errorMessage = (error as Error).message;
        }

        assert(errorMessage.includes("Edit 2"));
      } finally {
        await fixtures.cleanup();
      }
    });
  });

  describe("fuzzy matching", () => {
    it("should match smart single quotes", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      // File contains straight quotes
      const testContent = "console.log('hello world');";
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        // Search uses curly/smart quotes
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: "console.log('hello world')", newText: "console.log('hi there')" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "console.log('hi there');");
        assert(result.includes("fuzzy matching"));
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should match smart double quotes", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      const testContent = 'const msg = "hello";';
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        // Use curly double quotes in search
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: 'const msg = "hello"', newText: 'const msg = "goodbye"' }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, 'const msg = "goodbye";');
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should match with different dash types", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      const testContent = "function foo() { return 1 - 2; }";
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        // Use em-dash (U+2014) in search
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: "return 1 — 2", newText: "return 2 - 1" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "function foo() { return 2 - 1; }");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should match with trailing whitespace differences", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      const testContent = "line1  \nline2\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // Search without trailing whitespace - this triggers fuzzy matching
        // Note: fuzzy matching normalizes the file, so trailing whitespace is stripped
        await applyFileEdits(
          tempFile,
          [{ oldText: "line1\nline2", newText: "first\nsecond" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        // File content is normalized when fuzzy matching is used
        assert.strictEqual(finalContent, "first\nsecond\n");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should reject fuzzy match if multiple locations would match", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      const testContent = "'hello' and 'hello'";  // Two identical patterns
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [{ oldText: "'hello'", newText: "'hi'" }],
              true,
            ),
          {
            name: "Error",
            message: /matches \d+ locations/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should not use fuzzy match when exact match exists", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      const testContent = "console.log('test');";
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: "console.log('test')", newText: "console.log('done')" }],
          false,
        );

        // Should not report fuzzy matching when exact match works
        assert(!result.includes("fuzzy matching"));
      } finally {
        await fixtures.cleanup();
      }
    });
  });

  describe("line ending preservation", () => {
    it("should preserve CRLF line endings", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello\r\nworld!\r\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "world", newText: "universe" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hello\r\nuniverse!\r\n");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should preserve LF line endings", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello\nworld!\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "world", newText: "universe" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hello\nuniverse!\n");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should preserve UTF-8 BOM", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "\uFEFFHello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "Hello", newText: "Hi" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "\uFEFFHi world!");
      } finally {
        await fixtures.cleanup();
      }
    });
  });
});
```

## Edge Cases and Handling

| Edge Case | Handling |
|-----------|----------|
| **Chained edits (A→B, B→C)** | Not supported by design. Reverse-order searches original content. Use A→C directly. |
| **Fuzzy matches multiple locations** | Rejected with error requiring more context |
| **Overlapping edit regions** | Detected in preflight, rejected with clear error |
| **Adjacent edits (end of one = start of next)** | Allowed (not overlapping). E.g., "foo" and "bar" in "foobar" |
| **Empty fuzzy match** | Falls through to "not found" error |
| **Performance on large files** | Fuzzy normalization is O(n) but only runs when exact match fails |
| **Unicode combining characters** | NFKC normalization handles most canonical equivalences |
| **All edits result in no change** | Detected and rejected (would overwrite file with identical content) |
| **Fuzzy matching side effects** | When fuzzy matching is used, the entire file is normalized (smart quotes → straight quotes, trailing whitespace stripped, etc.). This is acceptable for source code. |

## Backward Compatibility Note

**Behavior change:** Multi-edit behavior changes from sequential to reverse-order.

- **Before:** Edit N could depend on result of edits 1 through N-1 (chained)
- **After:** All edits search original content, applied reverse-position order

**Mitigation:** Chained multi-edits are rare in practice. Users should combine dependent changes into single edits or make separate tool calls.

**Fuzzy matching side effect:** When fuzzy matching is triggered, the entire file content is normalized:
- Smart quotes (curly quotes) → straight quotes
- Various dash types → hyphen
- Trailing whitespace on lines → stripped
- Unicode variations → NFKC normalized

This is acceptable for source code files and matches the reference implementation's behavior.

**Non-breaking aspects:**
- Single edits work identically
- Exact matches work identically (no normalization)
- File output format unchanged
- Error messages improved but recognizable
- Line ending and BOM handling preserved

## Testing Checklist

- [ ] All existing single-edit tests pass
- [ ] Multi-edit tests verify reverse-order behavior
- [ ] Overlapping edits are rejected
- [ ] Smart quotes matched via fuzzy
- [ ] Various dash types normalized
- [ ] Trailing whitespace differences handled
- [ ] Multiple fuzzy match locations rejected
- [ ] Exact match prioritized over fuzzy
- [ ] Preflight prevents partial modifications
- [ ] Failed edit number reported
- [ ] CRLF line endings preserved
- [ ] UTF-8 BOM preserved
- [ ] Code passes lint and format checks

## Files to Modify

| File | Changes |
|------|---------|
| `source/tools/edit-file.ts` | Replace edit application logic with reverse-order preflight approach |
| `test/tools/edit-file.test.ts` | Update tests for reverse-order semantics, add fuzzy matching tests |

## Implementation Order

1. Add fuzzy matching utilities (`normalizeForFuzzyMatch`, `fuzzyFindText`, `countMatches`)
2. Add preflight validation function (`preflightEdits`) with types (`MatchedEdit`, `PreflightResult`)
3. Add reverse-order application function (`applyEditsReverseOrder`)
4. Update `applyFileEdits` main function
5. Remove deprecated functions (`applyEditsSequentially`, `applyNormalizedEdit`)
6. Update test suite
7. Run full test suite and fix regressions
8. Run lint and format checks

## Success Criteria

1. ✅ Preflight catches all failures before file modification
2. ✅ Edits applied reverse-position order (highest index first)
3. ✅ Overlapping edits detected and rejected
4. ✅ Fuzzy matching handles smart quotes, dashes, whitespace
5. ✅ When fuzzy matching is used, file content is normalized (acceptable side effect)
6. ✅ All new tests pass
7. ✅ No regressions in single-edit behavior
8. ✅ Clear error messages with edit numbers
9. ✅ Code passes lint and format checks
