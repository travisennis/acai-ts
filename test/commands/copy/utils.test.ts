import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMessage } from "ai";
import { extractLastAssistantText } from "../../../source/commands/copy/utils.ts";

describe("extractLastAssistantText", () => {
  it("returns null for empty messages", () => {
    assert.equal(extractLastAssistantText([]), null);
  });

  it("returns null when no assistant messages exist", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    assert.equal(extractLastAssistantText(messages), null);
  });

  it("returns text from the last assistant message", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "first response" }],
      },
      { role: "user", content: [{ type: "text", text: "follow up" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "second response" }],
      },
    ];
    assert.equal(extractLastAssistantText(messages), "second response");
  });

  it("returns the last non-empty text part from content", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "first part" },
          { type: "text", text: "second part" },
        ],
      },
    ];
    assert.equal(extractLastAssistantText(messages), "second part");
  });

  it("skips whitespace-only text parts", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "real content" },
          { type: "text", text: "   " },
        ],
      },
    ];
    assert.equal(extractLastAssistantText(messages), "real content");
  });

  it("skips non-text content parts", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "the text" },
          { type: "tool-call", toolCallId: "1", toolName: "t", input: {} },
        ],
      },
    ];
    assert.equal(extractLastAssistantText(messages), "the text");
  });

  it("returns null when assistant message has only whitespace text", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "  \n  " }],
      },
    ];
    assert.equal(extractLastAssistantText(messages), null);
  });

  it("skips assistant messages without array content and finds earlier one", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "valid" }],
      },
      {
        role: "assistant",
        content: "string content",
      } as unknown as ModelMessage,
    ];
    assert.equal(extractLastAssistantText(messages), "valid");
  });
});
