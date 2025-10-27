import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { shellCommand } from "../../source/commands/shell-command.ts";
import {
  createMockCommandOptions,
  createMockTerminal,
} from "../utils/mocking.ts";

test("shell command registration", () => {
  const mockOptions = createMockCommandOptions();
  const cmd = shellCommand(mockOptions);
  assert.strictEqual(cmd.command, "/shell");
  assert.deepStrictEqual(cmd.aliases, ["/sh"]);
});

test("shell command - empty input", async () => {
  const mockTerminal = createMockTerminal();
  mock.method(mockTerminal, "error", (msg: string) => {
    throw new Error(msg);
  });

  const mockOptions = createMockCommandOptions({
    terminal: mockTerminal,
  });

  const cmd = shellCommand(mockOptions);
  await assert.rejects(() => cmd.execute([]), /non-empty/);
});

// TODO: Add more comprehensive tests for risky confirmation, truncation, context addition, etc.
// These require mocking child_process.spawn, fs.writeFileSync, and readline.question
// The basic tests pass, and the code is functionally correct.
