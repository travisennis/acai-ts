import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { sessionCommand } from "../../source/commands/session-command.ts";
import {
  createMockCommandOptions,
  createMockConfig,
  createMockContainer,
  createMockEditor,
  createMockMessageHistory,
  createMockModelManager,
  createMockPromptManager,
  createMockTokenCounter,
  createMockTokenTracker,
  createMockTui,
} from "../utils/mocking.ts";

describe("sessionCommand", () => {
  let mockTui: ReturnType<typeof createMockTui>;
  let mockContainer: ReturnType<typeof createMockContainer>;
  let mockEditor: ReturnType<typeof createMockEditor>;
  let mockTokenCounter: ReturnType<typeof createMockTokenCounter>;
  let mockModelManager: ReturnType<typeof createMockModelManager>;
  let mockMessageHistory: ReturnType<typeof createMockMessageHistory>;
  let mockConfig: ReturnType<typeof createMockConfig>;
  let mockTokenTracker: ReturnType<typeof createMockTokenTracker>;
  let mockPromptManager: ReturnType<typeof createMockPromptManager>;
  let mockPromptHistory: string[];

  beforeEach(() => {
    mockTui = createMockTui();
    mockContainer = createMockContainer();
    mockEditor = createMockEditor();
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
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      sessionManager: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = sessionCommand(options);

    assert.equal(command.command, "/session");
    assert.equal(
      command.description,
      "Show comprehensive session information including usage, context, and costs",
    );
  });

  it("should return empty subcommands", async () => {
    const options = createMockCommandOptions({
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      sessionManager: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = sessionCommand(options);
    const subCommands = await command.getSubCommands();

    assert.deepEqual(subCommands, []);
  });

  it("should handle without throwing", async () => {
    const options = createMockCommandOptions({
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      sessionManager: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = sessionCommand(options);

    // Should not throw
    await assert.doesNotReject(() =>
      command.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      }),
    );
  });

  it("should call showModal", async () => {
    const options = createMockCommandOptions({
      tokenCounter: mockTokenCounter,
      modelManager: mockModelManager,
      sessionManager: mockMessageHistory,
      tokenTracker: mockTokenTracker,
      config: mockConfig,
      promptManager: mockPromptManager,
      promptHistory: mockPromptHistory,
    });

    const command = sessionCommand(options);

    await command.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should have called showModal
    assert.equal(mockTui.showModal.mock.calls.length, 1);
  });
});
