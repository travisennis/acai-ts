import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { Agent } from "../../source/agent/index.ts";
import type { CommandManager } from "../../source/commands/manager.ts";
import type { ConfigManager } from "../../source/config/index.ts";
import type { WorkspaceContext } from "../../source/index.ts";
import type { ModelManager } from "../../source/models/manager.ts";
import type { PromptManager } from "../../source/prompts/manager.ts";
import type { SessionManager } from "../../source/sessions/manager.ts";
import { Repl } from "../../source/repl/index.ts";
import type { TokenCounter } from "../../source/tokens/counter.ts";
import type { TokenTracker } from "../../source/tokens/tracker.ts";

interface MockedReplDeps {
  agent: Agent;
  sessionManager: SessionManager;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  commands: CommandManager;
  configManager: ConfigManager;
  tokenCounter: TokenCounter;
  promptHistory: string[];
  workspace: WorkspaceContext;
}

function createMockDeps(): MockedReplDeps {
  return {
    agent: {} as Agent,
    sessionManager: {
      appendUserMessage: mock.fn(),
      getLastTurnContextWindow: mock.fn(() => 0),
    } as unknown as SessionManager,
    promptManager: {
      isPending: mock.fn(() => false),
      hasContext: mock.fn(() => false),
      getContextTokenCount: mock.fn(() => 0),
      addContext: mock.fn(),
      set: mock.fn(),
      get: mock.fn(() => "test prompt"),
      getUserMessage: mock.fn(() => "test user message"),
    } as unknown as PromptManager,
    modelManager: {
      getModelMetadata: mock.fn(() => ({
        contextWindow: 128000,
        maxTokens: 4096,
      })),
    } as unknown as ModelManager,
    tokenTracker: {
      getTotalTokens: mock.fn(() => 0),
      getInputTokens: mock.fn(() => 0),
      getOutputTokens: mock.fn(() => 0),
    } as unknown as TokenTracker,
    commands: {
      handle: mock.fn(),
      getCompletions: mock.fn(() => []),
    } as unknown as CommandManager,
    configManager: {
      getConfig: mock.fn(() => ({
        skills: { path: "" },
      })),
    } as unknown as ConfigManager,
    tokenCounter: {
      count: mock.fn(() => 0),
    } as unknown as TokenCounter,
    promptHistory: [],
    workspace: {
      primaryDir: "/test",
      allowedDirs: [],
    } as unknown as WorkspaceContext,
  };
}

describe("Repl", () => {
  let deps: MockedReplDeps;
  let repl: Repl;
  let originalStdoutIsTTY: boolean | undefined;
  let originalStdinIsTTY: boolean | undefined;

  beforeEach(() => {
    // Temporarily fake TTY for ProcessTerminal
    originalStdoutIsTTY = (process.stdout as any).isTTY;
    originalStdinIsTTY = (process.stdin as any).isTTY;
    (process.stdout as any).isTTY = true;
    (process.stdin as any).isTTY = true;

    deps = createMockDeps();
    repl = new Repl(deps);

    // Stub the TUI's start method since we don't need a real terminal
    const tui = (repl as any).tui;
    mock.method(tui, "start", () => {});
    mock.method(tui, "requestRender", () => {});
  });

  afterEach(() => {
    (process.stdout as any).isTTY = originalStdoutIsTTY;
    (process.stdin as any).isTTY = originalStdinIsTTY;
    mock.reset();
  });

  describe("onSubmit handler", () => {
    it("should do nothing when text is empty whitespace", async () => {
      await repl.init();

      const editor = (repl as any).editor;
      await editor.onSubmit("   ");

      assert.strictEqual((deps.commands.handle as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    });

    it("should handle commands and return early", async () => {
      const handleMock = deps.commands.handle as unknown as ReturnType<typeof mock.fn>;
      handleMock.mock.mockImplementation(() => ({
        continue: true,
      }));

      await repl.init();

      const editor = (repl as any).editor;
      await editor.onSubmit("/help");

      assert.strictEqual(handleMock.mock.callCount(), 1);
      assert.strictEqual(editor.getText(), "");
    });

    it("should process prompt when no command is matched", async () => {
      const handleMock = deps.commands.handle as unknown as ReturnType<typeof mock.fn>;
      handleMock.mock.mockImplementation(() => ({
        continue: false,
      }));

      await repl.init();

      const editor = (repl as any).editor;
      await editor.onSubmit("hello world");

      assert.strictEqual(handleMock.mock.callCount(), 1);
      assert.strictEqual(
        (deps.promptManager.set as unknown as ReturnType<typeof mock.fn>).mock.callCount(),
        1,
      );
      assert.strictEqual(
        (deps.sessionManager.appendUserMessage as unknown as ReturnType<typeof mock.fn>).mock.callCount(),
        1,
      );
    });

    it("should push prompt history when promptManager is pending", async () => {
      const handleMock = deps.commands.handle as unknown as ReturnType<typeof mock.fn>;
      handleMock.mock.mockImplementation(() => ({
        continue: false,
      }));
      (deps.promptManager.isPending as unknown as ReturnType<typeof mock.fn>).mock.mockImplementation(
        () => true,
      );

      await repl.init();

      const editor = (repl as any).editor;
      await editor.onSubmit("follow up");

      assert.strictEqual(handleMock.mock.callCount(), 1);
      assert.strictEqual(deps.promptHistory.length, 1);
      assert.strictEqual(deps.promptHistory[0], "test prompt");
    });

    it("should call onInputCallback when set", async () => {
      const handleMock = deps.commands.handle as unknown as ReturnType<typeof mock.fn>;
      handleMock.mock.mockImplementation(() => ({
        continue: false,
      }));

      let callbackText = "";
      (repl as any).onInputCallback = (text: string) => {
        callbackText = text;
      };

      await repl.init();

      const editor = (repl as any).editor;
      await editor.onSubmit("trigger callback");

      assert.strictEqual(callbackText, "test prompt");
    });
  });
});
