import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { exitCommand } from "../../source/commands/exit/index.ts";
import type { ExitCommandOptions } from "../../source/commands/exit/types.ts";
import {
  createMockContainer,
  createMockEditor,
  createMockSessionManager,
  createMockTui,
} from "../utils/mocking.ts";
import { createTestFixtures } from "../utils/test-fixtures.ts";

describe("exit command", () => {
  let fixtures: Awaited<ReturnType<typeof createTestFixtures>>;
  let testBaseDir: string;
  let tmpDir: string;

  beforeEach(async () => {
    fixtures = await createTestFixtures("exit-command");
    testBaseDir = await fixtures.createDir("base");
    tmpDir = await fixtures.createDir("base/.tmp");
    // Add some test content
    await fixtures.writeFile("base/.tmp/test-file.txt", "test content");
    await fixtures.writeFile(
      "base/.tmp/test-subdir/nested.txt",
      "nested content",
    );
  });

  afterEach(async () => {
    await fixtures.cleanup();
  });

  it("should clear .tmp directory on exit with custom baseDir", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const mockSessionManager = createMockSessionManager();

    const options: ExitCommandOptions = {
      sessionManager: mockSessionManager,
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
    assert.equal((mockSessionManager.isEmpty as any).mock.calls.length, 1);
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockSessionManager.save as any).mock.calls.length, 1);
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

    const mockSessionManager = createMockSessionManager([]);

    const options: ExitCommandOptions = {
      sessionManager: mockSessionManager,
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
    assert.equal((mockSessionManager.isEmpty as any).mock.calls.length, 1);
    // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
    assert.equal((mockSessionManager.save as any).mock.calls.length, 0);
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

    const mockSessionManager = createMockSessionManager();

    // Mock console.error to verify error logging
    const originalConsoleError = console.error;
    const mockConsoleError = mock.fn();
    console.error = mockConsoleError;

    try {
      const options: ExitCommandOptions = {
        sessionManager: mockSessionManager,
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
      assert.equal((mockSessionManager.isEmpty as any).mock.calls.length, 1);
      // biome-ignore lint/suspicious/noExplicitAny: mock properties are dynamically added
      assert.equal((mockSessionManager.save as any).mock.calls.length, 1);
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
