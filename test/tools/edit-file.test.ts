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
            { oldText: "alpha", newText: "A" }, // position 0
            { oldText: "beta", newText: "B" }, // position 6
            { oldText: "gamma", newText: "C" }, // position 11
            { oldText: "delta", newText: "D" }, // position 17
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
      const testContent = "foo bar foo baz"; // "foo" appears twice
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
                { oldText: "nonexistent", newText: "XX" }, // Will fail
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
              { oldText: "xyz", newText: "XYZ" }, // Edit 2 fails
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

    it("should allow adjacent non-overlapping edits", async () => {
      const fixtures = await createTestFixtures("edit-file-adjacent");
      const testContent = "foobar";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // "foo" and "bar" are adjacent (end of one = start of next) but not overlapping
        await applyFileEdits(
          tempFile,
          [
            { oldText: "foo", newText: "FOO" },
            { oldText: "bar", newText: "BAR" },
          ],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "FOOBAR");
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
        // Search uses curly/smart quotes (U+2018 and U+2019)
        const result = await applyFileEdits(
          tempFile,
          [
            {
              // Use curly single quotes in oldText: U+2018 (') and U+2019 (')
              oldText: "console.log(\u2018hello world\u2019)",
              newText: "console.log('hi there')",
            },
          ],
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
        // Use curly double quotes (U+201C and U+201D) in search
        await applyFileEdits(
          tempFile,
          [
            {
              oldText: 'const msg = "hello"',
              newText: 'const msg = "goodbye"',
            },
          ],
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
        await applyFileEdits(
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
      const testContent = "'hello' and 'hello'"; // Two identical patterns
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

    it("should normalize various dash types", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      // File has en-dash (U+2013)
      const testContent = "price: $10\u201320";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // Search with regular hyphen
        await applyFileEdits(
          tempFile,
          [{ oldText: "price: $10-20", newText: "price: $10-25" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "price: $10-25");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should normalize non-breaking spaces", async () => {
      const fixtures = await createTestFixtures("edit-file-fuzzy");
      // File has non-breaking space (U+00A0)
      const testContent = "hello\u00A0world";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // Search with regular space
        await applyFileEdits(
          tempFile,
          [{ oldText: "hello world", newText: "hi there" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "hi there");
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

    it("should preserve both BOM and CRLF", async () => {
      const fixtures = await createTestFixtures("edit-file");
      // File with UTF-8 BOM and CRLF
      const testContent = "\uFEFFHello\r\nworld!\r\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "world", newText: "universe" }],
          false, // apply changes
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "\uFEFFHello\r\nuniverse!\r\n");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should handle CRLF-only files without standalone LF", async () => {
      const fixtures = await createTestFixtures("edit-file");
      // File with only CRLF, no standalone LF
      const testContent = "line1\r\nline2\r\nline3";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "line2", newText: "modified" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "line1\r\nmodified\r\nline3");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should match oldText with LF when file has CRLF", async () => {
      const fixtures = await createTestFixtures("edit-file");
      // File with CRLF, but oldText specified with LF
      const testContent = "Hello\r\nworld!\r\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // oldText uses LF but file uses CRLF - should still match
        await applyFileEdits(
          tempFile,
          [{ oldText: "Hello\nworld", newText: "Hi\nuniverse" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hi\r\nuniverse!\r\n");
      } finally {
        await fixtures.cleanup();
      }
    });
  });

  describe("preflight validation", () => {
    it("should validate all edits before applying any", async () => {
      const fixtures = await createTestFixtures("edit-file-preflight");
      const testContent = "abc def ghi";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // First edit succeeds, second fails, third would succeed
        // But file should remain unchanged because preflight catches the failure
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [
                { oldText: "abc", newText: "ABC" },
                { oldText: "nonexistent", newText: "XXX" },
                { oldText: "ghi", newText: "GHI" },
              ],
              false,
            ),
          {
            name: "Error",
          },
        );

        // File should be unchanged
        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, testContent);
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should detect overlapping edits in preflight", async () => {
      const fixtures = await createTestFixtures("edit-file-preflight");
      const testContent = "hello world";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        // These edits overlap on "lo wo"
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [
                { oldText: "hello wo", newText: "hi" },
                { oldText: "lo world", newText: "there" },
              ],
              false,
            ),
          {
            name: "Error",
            message: /overlap/,
          },
        );

        // File should be unchanged
        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, testContent);
      } finally {
        await fixtures.cleanup();
      }
    });
  });

  describe("edge cases", () => {
    it("should handle overlapping matches correctly (single edit)", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "aaa";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "aa", newText: "b" }],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        // Should replace "aa" with "b", leaving "a" from the third character
        assert.strictEqual(finalContent, "ba");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should throw error when all edits result in no change", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await assert.rejects(
          () =>
            applyFileEdits(
              tempFile,
              [{ oldText: "world", newText: "world" }],
              false,
            ),
          {
            name: "Error",
            message: /No changes were made/,
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should handle multi-line edits", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "function hello() {\n  console.log('hi');\n}";
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [
            {
              oldText: "function hello() {\n  console.log('hi');\n}",
              newText: "function goodbye() {\n  console.log('bye');\n}",
            },
          ],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(
          finalContent,
          "function goodbye() {\n  console.log('bye');\n}",
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should apply multiple multi-line edits correctly", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent =
        "function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}";
      const tempFile = await fixtures.createFile("test.js", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [
            {
              oldText: "function a() {\n  return 1;\n}",
              newText: "function a() {\n  return 10;\n}",
            },
            {
              oldText: "function b() {\n  return 2;\n}",
              newText: "function b() {\n  return 20;\n}",
            },
          ],
          false,
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(
          finalContent,
          "function a() {\n  return 10;\n}\n\nfunction b() {\n  return 20;\n}",
        );
      } finally {
        await fixtures.cleanup();
      }
    });
  });
});
