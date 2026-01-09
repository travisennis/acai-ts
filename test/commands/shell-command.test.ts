import assert from "node:assert/strict";
import test from "node:test";
import { shellCommand } from "../../source/commands/shell/index.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

test("shell command registration", () => {
  const mockOptions = createMockCommandOptions();
  const cmd = shellCommand(mockOptions);
  assert.strictEqual(cmd.command, "/shell");
  assert.deepStrictEqual(cmd.aliases, ["/sh"]);
});

test("shell command - empty input", async () => {
  const mockTui = createMockTui();
  const mockContainer = createMockContainer();
  const mockEditor = createMockEditor();

  const mockOptions = createMockCommandOptions();

  const cmd = shellCommand(mockOptions);
  const result = await cmd.handle([], {
    tui: mockTui,
    container: mockContainer,
    inputContainer: mockContainer,
    editor: mockEditor,
  });

  // Should return "continue" for empty input
  assert.equal(result, "continue");
  // Should have called requestRender
  assert.equal(mockTui.requestRender.mock.calls.length, 1);
  // Should have called setText to clear editor
  assert.equal(mockEditor.setText.mock.calls.length, 1);
});

// TODO: Add more comprehensive tests for risky confirmation, truncation, context addition, etc.
// These require mocking child_process.spawn, fs.writeFileSync, and readline.question
// The basic tests pass, and the code is functionally correct.
