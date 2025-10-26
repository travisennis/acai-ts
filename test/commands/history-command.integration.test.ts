import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { historyCommand } from "../../source/commands/history-command.ts";
import { MessageHistory } from "../../source/messages.ts";
import {
  createMockCommandOptions,
  createMockConfig,
  createMockMessageHistory,
  createMockTerminal,
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
    const mockTerminal = createMockTerminal();
    mock.method(mockTerminal, "info", (message: string) => {
      assert.equal(message, "No previous conversations found.");
    });
    mock.method(mockTerminal, "error", () => {
      assert.fail("Should not call error when no histories exist");
    });

    const mockMessageHistory = createMockMessageHistory();

    const commandOptions = createMockCommandOptions({
      messageHistory: mockMessageHistory,
      terminal: mockTerminal,
      config: mockConfig,
    });

    const command = historyCommand(commandOptions);

    // Mock MessageHistory.load to return empty array
    const originalLoad = MessageHistory.load;
    MessageHistory.load = async () => [];

    try {
      const result = await command.execute([]);
      assert.equal(result, "continue");
    } finally {
      // Restore original method
      MessageHistory.load = originalLoad;
    }
  });
});
