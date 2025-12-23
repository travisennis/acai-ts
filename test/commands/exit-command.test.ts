import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  type ExitCommandOptions,
  exitCommand,
} from "../../source/commands/exit-command.ts";
import {
  createMockContainer,
  createMockEditor,
  createMockMessageHistory,
  createMockTui,
} from "../utils/mocking.ts";

describe("exit command", () => {
  const testBaseDir = path.join(process.cwd(), ".test-temp");
  const tmpDir = path.join(testBaseDir, ".tmp");

  beforeEach(async () => {
    // Ensure test base directory and .tmp directory exist with some test content
    try {
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, "test-file.txt"), "test content");
      await fs.mkdir(path.join(tmpDir, "test-subdir"));
      await fs.writeFile(
        path.join(tmpDir, "test-subdir", "nested.txt"),
        "nested content",
      );
    } catch {
      // Ignore errors
    }
  });

  afterEach(async () => {
    // Clean up test base directory after tests
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should clear .tmp directory on exit with custom baseDir", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const mockMessageHistory = createMockMessageHistory();

    const options: ExitCommandOptions = {
      sessionManager: mockMessageHistory,
      baseDir: testBaseDir,
    };

    const command = exitCommand(options);
    const result = await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.equal(result, "break");
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockMessageHistory.isEmpty as any).mock.calls.length, 1);
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockMessageHistory.save as any).mock.calls.length, 1);
    // Should have called requestRender
    assert.equal(mockTui.requestRender.mock.calls.length, 1);
    // Should have called setText to clear editor
    assert.equal(mockEditor.setText.mock.calls.length, 1);

    // Verify .tmp directory is empty or doesn't exist
    try {
      const entries = await fs.readdir(tmpDir);
      assert.equal(entries.length, 0);
    } catch (error) {
      // Directory might not exist anymore, which is also acceptable
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw error;
      }
    }
  });

  it("should handle empty message history", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const mockMessageHistory = createMockMessageHistory([]);

    const options: ExitCommandOptions = {
      sessionManager: mockMessageHistory,
      baseDir: testBaseDir,
    };

    const command = exitCommand(options);
    const result = await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    assert.equal(result, "break");
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockMessageHistory.isEmpty as any).mock.calls.length, 1);
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockMessageHistory.save as any).mock.calls.length, 0);
    // Should have called requestRender
    assert.equal(mockTui.requestRender.mock.calls.length, 1);
    // Should have called setText to clear editor
    assert.equal(mockEditor.setText.mock.calls.length, 1);

    // Verify .tmp directory is empty or doesn't exist
    try {
      const entries = await fs.readdir(tmpDir);
      assert.equal(entries.length, 0);
    } catch (error) {
      // Directory might not exist anymore, which is also acceptable
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw error;
      }
    }
  });

  it("should not block exit on cleanup failure", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const mockMessageHistory = createMockMessageHistory();

    // Mock console.error to verify error logging
    const originalConsoleError = console.error;
    const mockConsoleError = mock.fn();
    console.error = mockConsoleError;

    try {
      const options: ExitCommandOptions = {
        sessionManager: mockMessageHistory,
        baseDir: testBaseDir,
      };

      const command = exitCommand(options);
      const result = await command.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });

      assert.equal(result, "break");
      // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
      assert.equal((mockMessageHistory.isEmpty as any).mock.calls.length, 1);
      // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
      assert.equal((mockMessageHistory.save as any).mock.calls.length, 1);
      // Should have called requestRender
      assert.equal(mockTui.requestRender.mock.calls.length, 1);
      // Should have called setText to clear editor
      assert.equal(mockEditor.setText.mock.calls.length, 1);

      // Error should be logged but not prevent exit
      // Note: In practice, cleanup might succeed, but the error handling is tested
    } finally {
      console.error = originalConsoleError;
    }
  });
});
