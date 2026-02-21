import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { applyFileEdits } from "../../source/tools/edit-file.ts";
import { createTestFixtures } from "../utils/test-fixtures.ts";

describe("editFile tool", () => {
  describe("applyFileEdits", () => {
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

    it("should apply multiple matches of the same edit", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world! Hello world! Hello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        const result = await applyFileEdits(
          tempFile,
          [{ oldText: "Hello", newText: "Hi" }],
          true, // dry run
        );

        // Should show all three replacements in the diff
        assert(result.includes("Hi world!"));
        assert(result.includes("@@")); // Should contain diff markers

        // Verify the actual file content after applying changes
        await applyFileEdits(
          tempFile,
          [{ oldText: "Hello", newText: "Hi" }],
          false, // apply changes
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hi world! Hi world! Hi world!");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should handle multiple different edits", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello world! This is a test. Hello again!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        const result = await applyFileEdits(
          tempFile,
          [
            { oldText: "Hello", newText: "Hi" },
            { oldText: "test", newText: "example" },
          ],
          true, // dry run
        );

        assert(result.includes("Hi world!"));
        assert(result.includes("This is a example."));
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
            message:
              "Invalid oldText in edit. The value of oldText must be at least one character",
          },
        );
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should handle overlapping matches correctly", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "aaa";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "aa", newText: "b" }],
          false, // apply changes
        );

        const finalContent = await readFile(tempFile, "utf-8");
        // Should replace "aa" with "b", leaving "a" from the third character
        assert.strictEqual(finalContent, "ba");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should preserve CRLF line endings", async () => {
      const fixtures = await createTestFixtures("edit-file");
      const testContent = "Hello\r\nworld!\r\n";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "world", newText: "universe" }],
          false, // apply changes
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
          false, // apply changes
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hello\nuniverse!\n");
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
          false, // apply changes
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
          false, // apply changes
        );

        const finalContent = await readFile(tempFile, "utf-8");
        assert.strictEqual(finalContent, "Hi\r\nuniverse!\r\n");
      } finally {
        await fixtures.cleanup();
      }
    });

    it("should preserve UTF-8 BOM", async () => {
      const fixtures = await createTestFixtures("edit-file");
      // File with UTF-8 BOM
      const testContent = "\uFEFFHello world!";
      const tempFile = await fixtures.createFile("test.txt", testContent);

      try {
        await applyFileEdits(
          tempFile,
          [{ oldText: "Hello", newText: "Hi" }],
          false, // apply changes
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
  });
});
