import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { historyCommand } from "../../source/commands/history-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";
import type { ConfigManager } from "../../source/config.ts";
import { MessageHistory } from "../../source/messages.ts";

describe("historyCommand integration", () => {
  let mockConfig: ConfigManager;

  before(() => {
    // Mock config that provides a temporary directory for testing
    mockConfig = {
      app: {
        ensurePath: async (_path: string) => {
          // Return a temporary directory path for testing
          return "/tmp/test-message-history";
        },
      },
    } as unknown as ConfigManager;
  });

  it("should handle no histories gracefully", async () => {
    const mockTerminal = {
      info: (message: string) => {
        assert.equal(message, "No previous conversations found.");
      },
      error: () => {
        assert.fail("Should not call error when no histories exist");
      },
      setTitle: () => {},
    };

    const mockMessageHistory = {
      restore: () => {
        assert.fail("Should not call restore when no histories exist");
      },
    };

    const commandOptions = {
      messageHistory: mockMessageHistory,
      terminal: mockTerminal,
      config: mockConfig,
      promptManager: {},
      modelManager: {},
      tokenTracker: {},
      tokenCounter: {},
      toolExecutor: undefined,
      promptHistory: [],
      workspace: {},
    } as unknown as CommandOptions;

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
