import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { historyCommand } from "../../source/commands/history-command.ts";
import { SessionManager } from "../../source/sessions/manager.ts";
import {
  createMockCommandOptions,
  createMockConfig,
  createMockContainer,
  createMockEditor,
  createMockMessageHistory,
  createMockTui,
} from "../utils/mocking.ts";

describe("historyCommand integration", () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  before(() => {
    // Mock config that provides a temporary directory for testing
    mockConfig = createMockConfig();
    mock.method(mockConfig.app, "ensurePath", async (_path: string) => {
      // Return a temporary directory path for testing
      return "/tmp/test-message-history";
    });
  });

  it("should handle no histories gracefully", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const mockMessageHistory = createMockMessageHistory();

    const commandOptions = createMockCommandOptions({
      sessionManager: mockMessageHistory,
      config: mockConfig,
    });

    const command = historyCommand(commandOptions);

    // Mock MessageHistory.load to return empty array
    const originalLoad = SessionManager.load;
    SessionManager.load = async () => [];

    try {
      const result = await command.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });
      assert.equal(result, "continue");
      // Should have called requestRender
      assert.equal(mockTui.requestRender.mock.calls.length, 1);
      // Should have called setText to clear editor
      assert.equal(mockEditor.setText.mock.calls.length, 1);
    } finally {
      // Restore original method
      SessionManager.load = originalLoad;
    }
  });
});
