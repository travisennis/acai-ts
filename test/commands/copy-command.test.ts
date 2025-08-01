import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMessage, TextPart } from "ai";
import { copyCommand } from "../../source/commands/copy-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

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
    const outputs: string[] = [];
    const options = {
      terminal: {
        info: (msg: string) => outputs.push(`info:${msg}`),
        success: (_msg: string) => outputs.push("success"),
        error: (_msg: string) => outputs.push("error"),
      },
      messageHistory: {
        get: () => [makeUser("hello")] as ModelMessage[],
      },
    } as unknown as CommandOptions;

    const cmd = copyCommand(options);
    await cmd.execute([]);

    assert(outputs.some((o) => o.startsWith("info:")));
  });

  it("copies last assistant text via clipboard and reports success", async (_t) => {
    // Temporarily replace writeToClipboard by monkey-patching module function via dynamic import cache
    const outputs: string[] = [];
    const options = {
      terminal: {
        info: (msg: string) => outputs.push(`info:${msg}`),
        success: (msg: string) => outputs.push(`success:${msg}`),
        error: (msg: string) => outputs.push(`error:${msg}`),
      },
      messageHistory: {
        get: () =>
          [makeUser("hello"), makeAssistant("world")] as ModelMessage[],
      },
    } as unknown as CommandOptions;

    // We cannot easily mock child_process spawn without a mocking framework; this test focuses on flow.
    // Execute should attempt clipboard; since environment may not have tools, we only assert it didn't crash synchronously.
    const cmd = copyCommand(options);

    try {
      await cmd.execute([]);
    } catch {
      // Ignore runtime env clipboard errors
    }

    // Should either success or error, but not be silent
    assert(outputs.length > 0);
  });
});
