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
            message: "oldText not found in content",
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
  });
});
