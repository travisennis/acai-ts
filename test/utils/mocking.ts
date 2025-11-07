import path from "node:path";
import { mock } from "node:test";
import type { ModelMessage } from "ai";
import type { CommandOptions } from "../../source/commands/types.ts";
import type { ConfigManager } from "../../source/config.ts";
import type { MessageHistory } from "../../source/messages.ts";
import type { ModelManager } from "../../source/models/manager.ts";
import type { PromptManager } from "../../source/prompts/manager.ts";
import type { Terminal } from "../../source/terminal/index.ts";
import type { TokenCounter } from "../../source/tokens/counter.ts";
import type { TokenTracker } from "../../source/tokens/tracker.ts";

/**
 * Creates a standardized mock terminal for testing
 */
export function createMockTerminal(): Terminal {
  const mockTerminal = {
    config: {
      theme: "dark" as const,
      useColors: true,
      showProgressIndicators: true,
      codeHighlighting: true,
    },
    terminalWidth: 80,
    terminalHeight: 24,
    isInteractive: true,
    header: mock.fn(),
    table: mock.fn(),
    lineBreak: mock.fn(),
    displayProgressBar: mock.fn(),
    display: mock.fn(),
    info: mock.fn(),
    success: mock.fn(),
    error: mock.fn(),
    warn: mock.fn(),
    writeln: mock.fn(),
    write: mock.fn(),
    clear: mock.fn(),
    startProgress: mock.fn(),
    stopProgress: mock.fn(),
    emphasize: mock.fn(),
    alert: mock.fn(),
    hr: mock.fn(),
    link: mock.fn((text: string, url: string) => `[${text}](${url})`),
    box: mock.fn(),
    setTitle: mock.fn(),
    getLogo: mock.fn(() => ""),
    displayWelcome: mock.fn(),
    detectCapabilities: mock.fn(),
  };

  return mockTerminal as unknown as Terminal;
}

/**
 * Creates a mock token counter with configurable behavior
 */
export function createMockTokenCounter(
  countImplementation: (text: string) => number = (text) => text.length,
): TokenCounter {
  return {
    count: mock.fn(countImplementation),
    free: mock.fn(),
  } as unknown as TokenCounter;
}

/**
 * Creates a mock model manager with configurable metadata
 */
export function createMockModelManager(
  metadata: { contextWindow?: number; supportsToolCalling?: boolean } = {},
): ModelManager {
  const defaultMetadata = {
    contextWindow: 200000,
    supportsToolCalling: true,
    ...metadata,
  };

  const getModelMock = mock.fn();
  const getModelMetadataMock = mock.fn(() => defaultMetadata);

  const mockManager = {
    getModel: getModelMock,
    getModelMetadata: getModelMetadataMock,
  } as unknown as ModelManager;

  // Add mock property for easier access in tests
  // biome-ignore lint/suspicious/noExplicitAny: for testing, fix later
  (mockManager as any).mock = {
    getModel: getModelMock,
    getModelMetadata: getModelMetadataMock,
  };

  return mockManager;
}

/**
 * Creates a mock message history with configurable messages
 */
export function createMockMessageHistory(
  messages: ModelMessage[] = [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
  ],
): MessageHistory {
  return {
    get: mock.fn(() => messages),
    isEmpty: mock.fn(() => messages.length === 0),
    save: mock.fn(() => Promise.resolve()),
    clear: mock.fn(),
    appendUserMessage: mock.fn(),
    appendAssistantMessage: mock.fn(),
    appendToolMessages: mock.fn(),
    appendResponseMessages: mock.fn(),
    getFirstUserMessage: mock.fn(),
    getLastUserMessage: mock.fn(),
    getLastMessage: mock.fn(),
    restore: mock.fn(),
  } as unknown as MessageHistory;
}

/**
 * Creates a mock config object
 */
export function createMockConfig(): ConfigManager {
  return {
    project: {
      getPath: mock.fn(() => ".acai"),
      ensurePath: mock.fn(async (subdir?: string) =>
        subdir ? path.join(".acai", subdir) : ".acai",
      ),
      ensurePathSync: mock.fn((subdir?: string) =>
        subdir ? path.join(".acai", subdir) : ".acai",
      ),
    },
    app: {
      getPath: mock.fn(() => ".acai"),
      ensurePath: mock.fn(async (subdir?: string) =>
        subdir ? path.join(".acai", subdir) : ".acai",
      ),
      ensurePathSync: mock.fn((subdir?: string) =>
        subdir ? path.join(".acai", subdir) : ".acai",
      ),
    },
  } as unknown as ConfigManager;
}

/**
 * Creates a mock token tracker
 */
export function createMockTokenTracker(): TokenTracker {
  return {
    getUsageBreakdown: mock.fn(() => ({})),
  } as unknown as TokenTracker;
}

/**
 * Creates a mock prompt manager
 */
export function createMockPromptManager(): PromptManager {
  return {} as unknown as PromptManager;
}

/**
 * Creates a complete mock command options object
 */
export function createMockCommandOptions(
  overrides: Partial<CommandOptions> = {},
): CommandOptions {
  const defaults = {
    terminal: createMockTerminal(),
    tokenCounter: createMockTokenCounter(),
    modelManager: createMockModelManager(),
    messageHistory: createMockMessageHistory(),
    tokenTracker: createMockTokenTracker(),
    config: createMockConfig(),
    promptManager: createMockPromptManager(),
    toolExecutor: undefined,
    promptHistory: [],
    workspace: {
      primaryDir: process.cwd(),
      allowedDirs: [process.cwd()],
    },
  };

  return {
    ...defaults,
    ...overrides,
  } as CommandOptions;
}

/**
 * Resets all mocks in the provided object
 */
export function resetMocks(mockObject: Record<string, unknown>): void {
  Object.values(mockObject).forEach((value) => {
    if (value && typeof value === "object" && "mock" in value) {
      (value as { mock: { reset: () => void } }).mock.reset();
    }
  });
}

/**
 * Creates a mock execSync function for testing
 */
export function createMockExecSync(
  implementation: (command: string) => Buffer = () => Buffer.from(""),
): typeof import("node:child_process").execSync {
  return mock.fn(
    implementation,
  ) as unknown as typeof import("node:child_process").execSync;
}
