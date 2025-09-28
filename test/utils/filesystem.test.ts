import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearDirectory } from "../../source/utils/filesystem.ts";

describe("filesystem utilities", () => {
  const testDir = path.join(process.cwd(), ".test-temp");

  beforeEach(async () => {
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
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
      const dirWithFiles = path.join(testDir, "with-files");
      await fs.mkdir(dirWithFiles);

      // Create some test files
      await fs.writeFile(path.join(dirWithFiles, "file1.txt"), "content1");
      await fs.writeFile(path.join(dirWithFiles, "file2.txt"), "content2");

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
      const dirWithSubdirs = path.join(testDir, "with-subdirs");
      await fs.mkdir(dirWithSubdirs);

      // Create subdirectories with files
      const subdir1 = path.join(dirWithSubdirs, "subdir1");
      await fs.mkdir(subdir1);
      await fs.writeFile(path.join(subdir1, "file1.txt"), "content1");

      const subdir2 = path.join(dirWithSubdirs, "subdir2");
      await fs.mkdir(subdir2);
      await fs.writeFile(path.join(subdir2, "file2.txt"), "content2");

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
      const filePath = path.join(testDir, "file.txt");
      await fs.writeFile(filePath, "content");

      await assert.rejects(clearDirectory(filePath), /Path is not a directory/);
    });

    it("should handle special characters in file names", async () => {
      const specialDir = path.join(testDir, "special-chars");
      await fs.mkdir(specialDir);

      // Create files with special characters
      await fs.writeFile(
        path.join(specialDir, "file with spaces.txt"),
        "content",
      );
      await fs.writeFile(
        path.join(specialDir, "file-with-dashes.txt"),
        "content",
      );
      await fs.writeFile(
        path.join(specialDir, "file_with_underscores.txt"),
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
