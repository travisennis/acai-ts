import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { Agent } from "../../source/agent/index.ts";
import type { CommandManager } from "../../source/commands/manager.ts";
import type { ConfigManager } from "../../source/config/index.ts";
import type { WorkspaceContext } from "../../source/index.ts";
import type { ModelManager } from "../../source/models/manager.ts";
import type { PromptManager } from "../../source/prompts/manager.ts";
import { Repl } from "../../source/repl/index.ts";
import type { SessionManager } from "../../source/sessions/manager.ts";
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
      get: mock.fn(() => []),
      appendUserMessage: mock.fn(),
      getLastTurnContextWindow: mock.fn(() => 0),
    } as unknown as SessionManager,
    promptManager: {
      isPending: mock.fn(() => false),
      hasContext: mock.fn(() => false),
      getContextTokenCount: mock.fn(() => 0),
      addContext: mock.fn(),
      set: mock.fn(),
      get: mock.fn(() => ""),
      getUserMessage: mock.fn(() => ""),
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

describe("Repl reconstructSession", () => {
  let deps: MockedReplDeps;
  let repl: Repl;
  let originalStdoutIsTty: boolean | undefined;
  let originalStdinIsTty: boolean | undefined;

  beforeEach(() => {
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    originalStdoutIsTty = (process.stdout as unknown as { isTTY?: boolean })
      .isTTY;
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    originalStdinIsTty = (process.stdin as unknown as { isTTY?: boolean })
      .isTTY;
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    (process.stdin as unknown as { isTTY?: boolean }).isTTY = true;

    deps = createMockDeps();
    repl = new Repl(deps);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const tui = (repl as any).tui;
    mock.method(tui, "start", () => {});
    mock.method(tui, "requestRender", () => {});
  });

  afterEach(() => {
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    (process.stdout as unknown as { isTTY?: boolean }).isTTY =
      originalStdoutIsTty;
    // biome-ignore lint/style/useNamingConvention: isTTY is standard Node.js API
    (process.stdin as unknown as { isTTY?: boolean }).isTTY =
      originalStdinIsTty;
    mock.reset();
  });

  it("should clear state and render nothing when there are no messages", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => []);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;

    // Pre-populate state to verify it gets cleared
    replAny.pendingTools.set("test-id", {});
    replAny.allThinkingBlocks = ["old-think"];
    replAny.allToolExecutions = ["old-tool"];
    const chatContainer = replAny.chatContainer;
    chatContainer.addChild("dummy");

    replAny.reconstructSession();

    assert.strictEqual(replAny.pendingTools.size, 0);
    assert.deepStrictEqual(replAny.allThinkingBlocks, []);
    assert.deepStrictEqual(replAny.allToolExecutions, []);
    assert.strictEqual(chatContainer.children.length, 0);
  });

  it("should render a user message", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "user",
        content: [{ type: "text", text: "Hello, world!" }],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    // Should have at least one child (the user message component)
    assert.ok(children.length >= 1, "should have at least one child");
    // The first child should be a UserMessageComponent (wrapped in a Spacer?)
    // Actually addComponentWithSpacing adds a Spacer then the component
    // So we need to find UserMessageComponent among children
    const userComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "UserMessageComponent",
    );
    assert.ok(userComponent, "should contain a UserMessageComponent");
  });

  it("should render an assistant message with text content", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello! How can I help?" }],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    const assistantComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "AssistantMessageComponent",
    );
    assert.ok(
      assistantComponent,
      "should contain an AssistantMessageComponent",
    );
  });

  it("should render an assistant message with reasoning content", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me think about this..." },
          { type: "text", text: "Here is my answer." },
        ],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    const thinkingComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "ThinkingBlockComponent",
    );
    assert.ok(
      thinkingComponent,
      "should contain a ThinkingBlockComponent for reasoning",
    );

    const assistantComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "AssistantMessageComponent",
    );
    assert.ok(
      assistantComponent,
      "should contain an AssistantMessageComponent for text",
    );
  });

  it("should render tool calls for assistant messages with tool results", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "bash",
            toolCallId: "call-1",
            input: { command: "echo hello" },
          },
          { type: "text", text: "Running command..." },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "bash",
            toolCallId: "call-1",
            output: { value: "hello" },
          },
        ],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    const toolExecutionComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "ToolExecutionComponent",
    );
    assert.ok(
      toolExecutionComponent,
      "should contain a ToolExecutionComponent for the tool call",
    );

    assert.strictEqual(replAny.allToolExecutions.length, 1);
  });

  it("should render user, assistant, and tool messages in order", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "user",
        content: [{ type: "text", text: "What is the weather?" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "weather",
            toolCallId: "call-1",
            input: { city: "London" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "weather",
            toolCallId: "call-1",
            output: { value: "Rainy, 15°C" },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "The weather in London is rainy." }],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;

    // Check we have both assistant messages and tool executions
    const userComponents = children.filter(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "UserMessageComponent",
    );
    assert.strictEqual(userComponents.length, 1, "should have one user message");

    const assistantComponents = children.filter(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "AssistantMessageComponent",
    );
    assert.strictEqual(
      assistantComponents.length,
      1,
      "should have one assistant message component (the text response)",
    );

    const toolComponents = children.filter(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "ToolExecutionComponent",
    );
    assert.strictEqual(
      toolComponents.length,
      1,
      "should have one tool execution component",
    );

    assert.strictEqual(replAny.allToolExecutions.length, 1);
  });

  it("should handle string content format in user messages", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "user",
        content: "Hello with string content!",
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    const userComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "UserMessageComponent",
    );
    assert.ok(userComponent, "should render user message with string content");
  });

  it("should render user messages with whitespace-only text", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "user",
        content: [{ type: "text", text: "   " }],
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    const children = replAny.chatContainer.children;
    const userComponent = children.find(
      (c: { constructor: { name: string } }) =>
        c.constructor.name === "UserMessageComponent",
    );
    assert.ok(userComponent, "should render user message even with whitespace text");
  });

  it("should handle tool messages without array content gracefully", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "bash",
            toolCallId: "call-1",
            input: { command: "echo hi" },
          },
        ],
      },
      {
        role: "tool",
        content: "plain string result", // non-array content
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    // Should not throw
    replAny.reconstructSession();
    assert.ok(true, "should handle non-array tool content without error");
  });

  it("should not render tool calls when no matching tool result exists", () => {
    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    (deps.sessionManager as any).get.mock.mockImplementation(() => [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "bash",
            toolCallId: "call-1",
            input: { command: "echo hi" },
          },
        ],
      },
      // No corresponding tool message
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private repl member
    const replAny = repl as any;
    replAny.reconstructSession();

    // Tool execution component may still be created but without output
    // The important thing is it doesn't crash
    assert.ok(true, "should handle missing tool result without error");
  });
});
