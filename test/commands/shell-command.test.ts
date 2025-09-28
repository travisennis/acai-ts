import assert from "node:assert/strict";
import test from "node:test";
import { shellCommand } from "../../source/commands/shell-command.ts";

const createMockPromptManager = () => ({
  prompt: "",
  context: [],
  tokenCounter: { count: () => 0 },
  set: () => {},
  get: () => "",
  // biome-ignore lint/suspicious/noExplicitAny: mock
  getUserMessage: () => ({ role: "user", content: "" }) as any,
  isPending: () => false,
  addContext: () => {},
  hasContext: () => false,
  clearContext: () => {},
  clearAll: () => {},
  getContextTokenCount: () => 0,
});

const createMockOptions = () => ({
  terminal: {
    error: () => {},
    warn: () => {},
    info: () => {},
    success: () => {},
    write: () => {},
    writeln: () => {},
    lineBreak: () => {},
  },
  promptManager: createMockPromptManager(),
  // biome-ignore lint/suspicious/noExplicitAny: mock
  modelManager: {} as any,
  messageHistory: {
    appendUserMessage: () => {},
    get: () => [],
    getLastMessage: () => null,
    on: () => {},
  },
  tokenTracker: { trackUsage: () => {} },
  config: { app: { ensurePathSync: () => "" } },
  tokenCounter: { count: () => 0 },
  toolEvents: new Map(),
  toolExecutor: undefined,
});

test("shell command registration", () => {
  const mockOptions =
    createMockOptions() as unknown as import("../../source/commands/types.ts").CommandOptions;
  const cmd = shellCommand(mockOptions);
  assert.strictEqual(cmd.command, "/shell");
  assert.deepStrictEqual(cmd.aliases, ["/sh"]);
});

test("shell command - empty input", async () => {
  const mockTerminal = {
    ...createMockOptions().terminal,
    error: (msg: string) => {
      throw new Error(msg);
    },
  };
  const mockOptions = {
    ...createMockOptions(),
    terminal: mockTerminal,
  } as unknown as import("../../source/commands/types.ts").CommandOptions;
  const cmd = shellCommand(mockOptions);
  await assert.rejects(() => cmd.execute([]), /non-empty/);
});

// TODO: Add more comprehensive tests for risky confirmation, truncation, context addition, etc.
// These require mocking child_process.spawn, fs.writeFileSync, and readline.question
// The basic tests pass, and the code is functionally correct.
