/** biome-ignore-all lint/suspicious/noExplicitAny: test file */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ModelMessage } from "ai";
import { contextCommand } from "../../source/commands/context-command.ts";

describe("contextCommand", () => {
  let mockTerminal: any;
  let mockTokenCounter: any;
  let mockModelManager: any;
  let mockMessageHistory: any;
  let mockConfig: any;
  let mockTokenTracker: any;
  let mockToolExecutor: any;
  let mockPromptManager: any;
  let mockPromptHistory: string[];

  beforeEach(() => {
    mockTerminal = {
      header: () => {},
      table: () => {},
      lineBreak: () => {},
      displayProgressBar: () => {},
      display: () => {},
    };

    mockTokenCounter = {
      count: (text: string) => text.length,
    };

    mockModelManager = {
      getModelMetadata: () => ({
        contextWindow: 200000,
        supportsToolCalling: true,
      }),
    };

    mockMessageHistory = {
      get: () =>
        [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
        ] as ModelMessage[],
    };

    mockConfig = {
      project: {
        getPath: () => ".acai",
      },
    };

    mockTokenTracker = {
      getUsageBreakdown: () => ({}),
    };

    mockPromptManager = {};
    mockToolExecutor = undefined;
    mockPromptHistory = [];
  });

  it("should create a command with correct properties", () => {
    const options = {
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      toolExecutor: mockToolExecutor,
      promptHistory: mockPromptHistory,
      workspace: {
        primaryDir: process.cwd(),
        allowedDirs: [process.cwd()],
      },
    };

    const command = contextCommand(options);

    assert.equal(command.command, "/context");
    assert.equal(command.description, "Show context window usage breakdown");
  });

  it("should return subcommands", async () => {
    const options = {
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      toolExecutor: mockToolExecutor,
      promptHistory: mockPromptHistory,
      workspace: {
        primaryDir: process.cwd(),
        allowedDirs: [process.cwd()],
      },
    };

    const command = contextCommand(options);
    const subCommands = await command.getSubCommands();

    assert.deepEqual(subCommands, ["--details", "--json"]);
  });

  it("should execute without throwing", async () => {
    const options = {
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      toolExecutor: mockToolExecutor,
      promptHistory: mockPromptHistory,
      workspace: {
        primaryDir: process.cwd(),
        allowedDirs: [process.cwd()],
      },
    };

    const command = contextCommand(options);

    // Should not throw
    await assert.doesNotReject(() => command.execute([]));
  });

  it("should handle json output flag", async () => {
    let displayedJson = "";
    const mockTerminalWithJson = {
      ...mockTerminal,
      display: (content: string) => {
        displayedJson = content;
      },
    };

    const options = {
      terminal: mockTerminalWithJson,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      toolExecutor: mockToolExecutor,
      promptHistory: mockPromptHistory,
      workspace: {
        primaryDir: process.cwd(),
        allowedDirs: [process.cwd()],
      },
    };

    const command = contextCommand(options);

    await command.execute(["--json"]);

    // Should display JSON output
    assert(displayedJson.includes('"systemPrompt"'));
    assert(displayedJson.includes('"tools"'));
    assert(displayedJson.includes('"messages"'));
    assert(displayedJson.includes('"totalUsed"'));
    assert(displayedJson.includes('"window"'));
    assert(displayedJson.includes('"free"'));
  });
});
