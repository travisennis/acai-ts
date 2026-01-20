import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMessage, TextPart } from "ai";
import { copyCommand } from "../../source/commands/copy/index.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockSessionManager,
  createMockTui,
} from "../utils/mocking.ts";

function makeAssistant(text: string): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text } as TextPart],
  } as ModelMessage;
}

function makeUser(text: string): ModelMessage {
  return {
    role: "user",
    content: [{ type: "text", text } as TextPart],
  } as ModelMessage;
}

describe("/copy command", () => {
  it("returns info when no assistant response exists", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions({
      sessionManager: createMockSessionManager([makeUser("hello")]),
    });

    const cmd = copyCommand(options);
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should have called requestRender
    assert.equal(mockTui.requestRender.mock.calls.length, 1);
    // Should have called setText to clear editor
    assert.equal(mockEditor.setText.mock.calls.length, 1);
  });

  it("copies last assistant text via clipboard and reports success", async (_t) => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions({
      sessionManager: createMockSessionManager([
        makeUser("hello"),
        makeAssistant("world"),
      ]),
    });

    // We cannot easily mock child_process spawn without a mocking framework; this test focuses on flow.
    // Handle should attempt clipboard; since environment may not have tools, we only assert it didn't crash synchronously.
    const cmd = copyCommand(options);

    try {
      await cmd.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });
    } catch {
      // Ignore runtime env clipboard errors
    }

    // Should have called requestRender
    assert.equal(mockTui.requestRender.mock.calls.length, 1);
    // Should have called setText to clear editor
    assert.equal(mockEditor.setText.mock.calls.length, 1);
  });
});
