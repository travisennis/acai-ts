import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEST_TEMP_BASE = path.join(os.tmpdir(), "acai-test");

export interface TestFixture {
  path: string;
  cleanup: () => Promise<void>;
}

export interface TestFixtures {
  /**
   * Create a new temp directory for this test file
   */
  createDir: (name: string) => Promise<string>;
  /**
   * Create a file in the temp directory
   */
  createFile: (name: string, content: string) => Promise<string>;
  /**
   * Create a subdirectory in the temp directory
   */
  createSubDir: (name: string) => Promise<string>;
  /**
   * Write to a file in the temp directory
   */
  writeFile: (relativePath: string, content: string) => Promise<void>;
  /**
   * Read a file in the temp directory
   */
  readFile: (relativePath: string) => Promise<string>;
  /**
   * Cleanup all files created for this test suite
   */
  cleanup: () => Promise<void>;
}

function getTestTempDir(testName: string): string {
  const testId = `${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(TEST_TEMP_BASE, testName, testId);
}

/**
 * Create a new test fixtures instance for a specific test file
 * @param testName - Unique identifier for the test file (e.g., "edit-file", "ls", "filesystem")
 */
export async function createTestFixtures(
  testName: string,
): Promise<TestFixtures> {
  const baseDir = getTestTempDir(testName);
  await fs.mkdir(baseDir, { recursive: true });

  const createdPaths: string[] = [];

  const cleanup = async () => {
    for (const createdPath of createdPaths) {
      try {
        await fs.rm(createdPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  const createDir = async (name: string): Promise<string> => {
    const dirPath = path.join(baseDir, name);
    await fs.mkdir(dirPath, { recursive: true });
    createdPaths.push(dirPath);
    return dirPath;
  };

  const createSubDir = createDir;

  const createFile = async (name: string, content: string): Promise<string> => {
    const filePath = path.join(baseDir, name);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    createdPaths.push(filePath);
    return filePath;
  };

  const writeFile = async (
    relativePath: string,
    content: string,
  ): Promise<void> => {
    const filePath = path.join(baseDir, relativePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    createdPaths.push(filePath);
  };

  const readFile = async (relativePath: string): Promise<string> => {
    const filePath = path.join(baseDir, relativePath);
    return fs.readFile(filePath, "utf-8");
  };

  return {
    createDir,
    createFile,
    createSubDir,
    writeFile,
    readFile,
    cleanup,
  };
}

/**
 * Create a test fixture for a single file operation
 * Returns the file path and a cleanup function
 */
export async function createTempFile(
  testName: string,
  fileName: string,
  content: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(TEST_TEMP_BASE, testName, testId);
  const filePath = path.join(dir, fileName);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");

  const cleanup = async () => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { path: filePath, cleanup };
}

/**
 * Create a test fixture for a directory
 */
export async function createTempDir(
  testName: string,
  dirName: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(TEST_TEMP_BASE, testName, testId, dirName);

  await fs.mkdir(dir, { recursive: true });

  const cleanup = async () => {
    try {
      await fs.rm(path.join(TEST_TEMP_BASE, testName, testId), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { path: dir, cleanup };
}

/**
 * Get the base temp directory for a test name (for tests that need to share state)
 */
export function getTestTempBase(testName: string): string {
  const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(TEST_TEMP_BASE, testName, testId);
}
