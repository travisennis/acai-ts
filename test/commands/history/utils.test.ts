import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationHistory } from "../../../source/commands/history/types.ts";
import { generateMarkdown } from "../../../source/commands/history/utils.ts";

function makeHistory(
  messages: ConversationHistory["messages"],
): ConversationHistory {
  return {
    title: "Test Session",
    sessionId: "test-123",
    modelId: "gpt-4",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T01:00:00Z"),
    messages,
    project: "test",
  };
}

describe("generateMarkdown", () => {
  it("renders header with metadata", () => {
    const md = generateMarkdown(makeHistory([]));
    assert.ok(md.includes("# Test Session"));
    assert.ok(md.includes("**Session ID**: test-123"));
    assert.ok(md.includes("**Model**: gpt-4"));
    assert.ok(md.includes("**Total Messages**: 0"));
  });

  it("renders text parts", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ]),
    );
    assert.ok(md.includes("### USER (Message 1)"));
    assert.ok(md.includes("Hello world"));
  });

  it("skips empty text parts", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "assistant",
          content: [{ type: "text", text: "   " }],
        },
      ]),
    );
    assert.ok(!md.includes("   \n"));
  });

  it("renders tool-call parts", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "readFile",
              input: { path: "/tmp/test" },
            },
          ],
        },
      ]),
    );
    assert.ok(md.includes("**Tool Call**: readFile"));
    assert.ok(md.includes("**Call ID**: call-1"));
    assert.ok(md.includes('"/tmp/test"'));
  });

  it("renders tool-result with text output", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "readFile",
              result: { type: "text", text: "file contents here" },
            } as never,
          ],
        },
      ]),
    );
    assert.ok(md.includes("**Tool Result**: readFile"));
  });

  it("renders tool-result with JSON output", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search",
              result: { matches: 5 },
            } as never,
          ],
        },
      ]),
    );
    assert.ok(md.includes("**Tool Result**: search"));
  });

  it("renders tool-error parts", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "tool",
          content: [
            {
              type: "tool-error",
              toolCallId: "call-1",
              toolName: "exec",
              output: "command failed",
            } as never,
          ],
        },
      ]),
    );
    assert.ok(md.includes("**Tool Error**: exec"));
    assert.ok(md.includes("command failed"));
  });

  it("renders string content messages", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "system",
          content: "System prompt here",
        },
      ]),
    );
    assert.ok(md.includes("### SYSTEM (Message 1)"));
    assert.ok(md.includes("System prompt here"));
  });

  it("skips empty string content messages", () => {
    const md = generateMarkdown(
      makeHistory([
        {
          role: "system",
          content: "   ",
        },
      ]),
    );
    assert.ok(!md.includes("   \n"));
  });
});
