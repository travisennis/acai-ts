import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { contextCommand } from "../../source/commands/context-command.ts";
import {
  createMockCommandOptions,
  createMockConfig,
  createMockMessageHistory,
  createMockModelManager,
  createMockPromptManager,
  createMockTerminal,
  createMockTokenCounter,
  createMockTokenTracker,
} from "../utils/mocking.ts";

describe("contextCommand", () => {
  let mockTerminal: ReturnType<typeof createMockTerminal>;
  let mockTokenCounter: ReturnType<typeof createMockTokenCounter>;
  let mockModelManager: ReturnType<typeof createMockModelManager>;
  let mockMessageHistory: ReturnType<typeof createMockMessageHistory>;
  let mockConfig: ReturnType<typeof createMockConfig>;
  let mockTokenTracker: ReturnType<typeof createMockTokenTracker>;
  let mockPromptManager: ReturnType<typeof createMockPromptManager>;
  let mockPromptHistory: string[];

  beforeEach(() => {
    mockTerminal = createMockTerminal();
    mockTokenCounter = createMockTokenCounter();
    mockModelManager = createMockModelManager();
    mockMessageHistory = createMockMessageHistory();
    mockConfig = createMockConfig();
    mockTokenTracker = createMockTokenTracker();
    mockPromptManager = createMockPromptManager();
    mockPromptHistory = [];
  });

  it("should create a command with correct properties", () => {
    const options = createMockCommandOptions({
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = contextCommand(options);

    assert.equal(command.command, "/context");
    assert.equal(command.description, "Show context window usage breakdown");
  });

  it("should return subcommands", async () => {
    const options = createMockCommandOptions({
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = contextCommand(options);
    const subCommands = await command.getSubCommands();

    assert.deepEqual(subCommands, ["--details", "--json"]);
  });

  it("should execute without throwing", async () => {
    const options = createMockCommandOptions({
      terminal: mockTerminal,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = contextCommand(options);

    // Should not throw
    await assert.doesNotReject(() => command.execute([]));
  });

  it("should handle json output flag", async () => {
    let displayedJson = "";
    const mockTerminalWithJson = createMockTerminal();
    mock.method(mockTerminalWithJson, "display", (content: string) => {
      displayedJson = content;
    });

    const options = createMockCommandOptions({
      terminal: mockTerminalWithJson,
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      messageHistory: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

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
