/** biome-ignore-all lint/suspicious/noExplicitAny: using mocks */
import path from "node:path";
import { mock } from "node:test";
import type { ModelMessage } from "ai";
import type { CommandOptions } from "../../source/commands/types.ts";
import type { ConfigManager } from "../../source/config.ts";
import type { ModelManager } from "../../source/models/manager.ts";
import type { PromptManager } from "../../source/prompts/manager.ts";
import type { SessionManager } from "../../source/sessions/manager.ts";
import type { TokenCounter } from "../../source/tokens/counter.ts";
import type { TokenTracker } from "../../source/tokens/tracker.ts";
import type { Container, Editor, TUI } from "../../source/tui/index.ts";

export type NoInfer<T> = [T][T extends any ? 0 : never];

/**
 * Adapted from type-fest's PartialDeep
 */
export type PartialDeep<T> = T extends (...args: any[]) => any
  ? PartialDeepObject<T> | undefined
  : T extends object
    ? T extends ReadonlyArray<infer ItemType> // Test for arrays/tuples, per https://github.com/microsoft/TypeScript/issues/35156
      ? ItemType[] extends T // Test for arrays (non-tuples) specifically
        ? readonly ItemType[] extends T // Differentiate readonly and mutable arrays
          ? ReadonlyArray<PartialDeep<ItemType | undefined>>
          : Array<PartialDeep<ItemType | undefined>>
        : PartialDeepObject<T> // Tuples behave properly
      : PartialDeepObject<T>
    : T;

export type PartialDeepObject<ObjectType extends object> = {
  [KeyType in keyof ObjectType]?: PartialDeep<ObjectType[KeyType]>;
};

/**
 * Lets you pass a deep partial to a slot expecting a type.
 *
 * @returns whatever you pass in
 */
export const fromPartial = <T>(mock: PartialDeep<NoInfer<T>>): T => {
  return mock as T;
};

/**
 * Lets you pass anything to a mock function, while also retaining
 * autocomplete for when you _do_ want to pass the exact thing.
 *
 * @returns whatever you pass in, typed as `any`
 */
export const fromAny = <T>(mock: T | NoInfer<T>): any => {
  // T => {
  return mock;
};

/**
 * Forces you to pass the exact type of the thing the slot requires
 *
 * @returns whatever you pass in
 */
export const fromExact = <T>(mock: T): T => {
  return mock;
};

/**
 * Creates a mock TUI component for testing
 */
export function createMockTui(): TUI & {
  showModal: ReturnType<typeof mock.fn>;
  hideModal: ReturnType<typeof mock.fn>;
  isModalActive: ReturnType<typeof mock.fn>;
  requestRender: ReturnType<typeof mock.fn>;
  setFocus: ReturnType<typeof mock.fn>;
  addChild: ReturnType<typeof mock.fn>;
  removeChild: ReturnType<typeof mock.fn>;
  clear: ReturnType<typeof mock.fn>;
  render: ReturnType<typeof mock.fn>;
} {
  const mockTui = {
    showModal: mock.fn(),
    hideModal: mock.fn(),
    isModalActive: mock.fn(() => false),
    requestRender: mock.fn(),
    setFocus: mock.fn(),
    addChild: mock.fn(),
    removeChild: mock.fn(),
    clear: mock.fn(),
    render: mock.fn(() => []),
  };

  return mockTui as unknown as TUI & typeof mockTui;
}

/**
 * Creates a mock container for testing
 */
export function createMockContainer(): Container & {
  addChild: ReturnType<typeof mock.fn>;
  removeChild: ReturnType<typeof mock.fn>;
  clear: ReturnType<typeof mock.fn>;
  render: ReturnType<typeof mock.fn>;
} {
  const mockContainer = {
    addChild: mock.fn(),
    removeChild: mock.fn(),
    clear: mock.fn(),
    render: mock.fn(() => []),
  };

  return mockContainer as unknown as Container & typeof mockContainer;
}

/**
 * Creates a mock editor for testing
 */
export function createMockEditor(): Editor & {
  setText: ReturnType<typeof mock.fn>;
  getValue: ReturnType<typeof mock.fn>;
  addChild: ReturnType<typeof mock.fn>;
  removeChild: ReturnType<typeof mock.fn>;
  clear: ReturnType<typeof mock.fn>;
  render: ReturnType<typeof mock.fn>;
} {
  const mockEditor = {
    setText: mock.fn(),
    getValue: mock.fn(() => ""),
    addChild: mock.fn(),
    removeChild: mock.fn(),
    clear: mock.fn(),
    render: mock.fn(() => []),
  };

  return mockEditor as unknown as Editor & typeof mockEditor;
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
): SessionManager {
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
    getSessionId: mock.fn(() => "test-session-id"),
    getModelId: mock.fn(() => "test-model-id"),
    getTitle: mock.fn(() => "Test Title"),
    getCreatedAt: mock.fn(() => new Date("2025-12-16T10:30:00Z")),
    getUpdatedAt: mock.fn(() => new Date("2025-12-16T10:45:00Z")),
  } as unknown as SessionManager;
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
    getConfig: mock.fn(async () => ({
      tools: {
        maxTokens: 30000,
      },
      notify: true,
      readOnlyFiles: [],
    })),
    readProjectLearnedRulesFile: mock.fn(async () => ""),
    readCachedLearnedRulesFile: mock.fn(async () => ""),
  } as unknown as ConfigManager;
}

/**
 * Creates a mock token tracker
 */
export function createMockTokenTracker(): TokenTracker {
  return {
    getUsageBreakdown: mock.fn(() => ({})),
    getTotalUsage: mock.fn(() => ({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    })),
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
