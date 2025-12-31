import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearDirectory } from "../../source/utils/filesystem/operations.ts";
import { createTestFixtures } from "../utils/test-fixtures.ts";

describe("filesystem utilities", () => {
  let fixtures: Awaited<ReturnType<typeof createTestFixtures>>;
  let testDir: string;

  beforeEach(async () => {
    fixtures = await createTestFixtures("filesystem");
    testDir = await fixtures.createDir("test-root");
  });

  afterEach(async () => {
    await fixtures.cleanup();
  });

  describe("clearDirectory", () => {
    it("should clear an empty directory", async () => {
      const emptyDir = path.join(testDir, "empty");
      await fs.mkdir(emptyDir);

      await clearDirectory(emptyDir);

      // Directory might be empty or might not exist anymore
      try {
        const entries = await fs.readdir(emptyDir);
        assert.equal(entries.length, 0);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    });

    it("should clear a directory with files", async () => {
      const dirWithFiles = await fixtures.createDir("with-files");

      // Create some test files
      await fixtures.writeFile("with-files/file1.txt", "content1");
      await fixtures.writeFile("with-files/file2.txt", "content2");

      await clearDirectory(dirWithFiles);

      // Directory might be empty or might not exist anymore
      try {
        const entries = await fs.readdir(dirWithFiles);
        assert.equal(entries.length, 0);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    });

    it("should clear a directory with subdirectories", async () => {
      const dirWithSubdirs = await fixtures.createDir("with-subdirs");

      // Create subdirectories with files
      await fixtures.createDir("with-subdirs/subdir1");
      await fixtures.writeFile("with-subdirs/subdir1/file1.txt", "content1");

      await fixtures.createDir("with-subdirs/subdir2");
      await fixtures.writeFile("with-subdirs/subdir2/file2.txt", "content2");

      await clearDirectory(dirWithSubdirs);

      // Directory might be empty or might not exist anymore
      try {
        const entries = await fs.readdir(dirWithSubdirs);
        assert.equal(entries.length, 0);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    });

    it("should handle non-existent directory gracefully", async () => {
      const nonExistentDir = path.join(testDir, "non-existent");

      await assert.doesNotReject(clearDirectory(nonExistentDir));
    });

    it("should throw error for non-directory paths", async () => {
      const filePath = await fixtures.createFile("file.txt", "content");

      await assert.rejects(clearDirectory(filePath), /Path is not a directory/);
    });

    it("should handle special characters in file names", async () => {
      const specialDir = await fixtures.createDir("special-chars");

      // Create files with special characters
      await fixtures.writeFile("special-chars/file with spaces.txt", "content");
      await fixtures.writeFile("special-chars/file-with-dashes.txt", "content");
      await fixtures.writeFile(
        "special-chars/file_with_underscores.txt",
        "content",
      );

      await clearDirectory(specialDir);

      // Directory might be empty or might not exist anymore
      try {
        const entries = await fs.readdir(specialDir);
        assert.equal(entries.length, 0);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    });
  });
});
