import { basename } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, renderSessionHtml, getSessionData, estimateSessionSize } from "../source/commands/share/html-renderer.ts";

describe("escapeHtml", () => {
  it("should escape HTML special characters", () => {
    assert.equal(escapeHtml("<div>&\"'"), "&lt;div&gt;&amp;&quot;&#039;");
  });

  it("should return plain text unchanged", () => {
    assert.equal(escapeHtml("hello world"), "hello world");
  });
});

describe("renderSessionHtml", () => {
  it("should render a session with system and user messages", () => {
    const session = {
      sessionId: "abc123",
      title: "Test Session",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "system" as const,
          content: "You are a helpful assistant",
        },
        {
          role: "user" as const,
          content: "Hello, how are you?",
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("Test Session"));
    assert.ok(html.includes("gpt-4"));
    assert.ok(html.includes("test-project"));
    assert.ok(html.includes("You are a helpful assistant"));
    assert.ok(html.includes("Hello, how are you?"));
    assert.ok(html.includes('<div class="message system">'));
    assert.ok(html.includes('<div class="message user">'));
    assert.ok(html.includes("Jan 15, 2024"));
  });

  it("should render a session with assistant and tool messages", () => {
    const session = {
      sessionId: "abc123",
      title: "Tool Session",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "assistant" as const,
          content: "Let me help you with that.",
        },
        {
          role: "assistant" as const,
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "call_1",
              toolName: "read_file",
              input: { path: "/test.txt" },
            },
            {
              type: "tool-call" as const,
              toolCallId: "call_2",
              toolName: "search",
              input: { query: "hello" },
            },
          ],
        },
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "read_file",
              output: { type: "text" as const, value: "file contents" },
            },
            {
              type: "tool-result" as const,
              toolCallId: "call_2",
              toolName: "search",
              output: {
                type: "json" as const,
                value: { results: ["a", "b"] },
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Let me help you with that."));
    assert.ok(html.includes("read_file"));
    assert.ok(html.includes("search"));
    assert.ok(html.includes("file contents"));
    assert.ok(html.includes("results"));
    assert.ok(html.includes('<div class="tool-call">'));
    assert.ok(html.includes('<div class="tool-result">'));
  });

  it("should render assistant message with mixed text and tool-call parts", () => {
    const session = {
      sessionId: "abc123",
      title: "Mixed Session",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "assistant" as const,
          content: [
            { type: "text" as const, text: "I will search now." },
            {
              type: "tool-call" as const,
              toolCallId: "call_1",
              toolName: "search",
              input: { query: "test" },
            },
            { type: "text" as const, text: "Search completed." },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("I will search now."));
    assert.ok(html.includes("Search completed."));
    assert.ok(html.includes("search"));
    assert.ok(html.includes("test"));
  });

  it("should render user message with array content", () => {
    const session = {
      sessionId: "abc123",
      title: "User Array",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Part one" },
            { type: "text" as const, text: "Part two" },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Part one"));
    assert.ok(html.includes("Part two"));
  });

  it("should render system message with array content", () => {
    const session = {
      sessionId: "abc123",
      title: "System Array",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "system" as const,
          content: [
            { type: "text" as const, text: "Instruction one" },
            { type: "text" as const, text: "Instruction two" },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Instruction one"));
    assert.ok(html.includes("Instruction two"));
  });

  it("should handle empty assistant text parts (trimmed)", () => {
    const session = {
      sessionId: "abc123",
      title: "Empty Text",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "assistant" as const,
          content: [
            { type: "text" as const, text: "   " },
            { type: "text" as const, text: "Valid text" },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    // Verify the whitespace-only text part was not rendered as a content div
    const contentDivs = html.match(/<div class="content">([\s\S]*?)<\/div>/g) || [];
    const hasWhitespaceOnly = contentDivs.some((div) => div.trim() === '<div class="content"></div>' || div.includes('>   <'));
    assert.ok(!hasWhitespaceOnly);
    assert.ok(html.includes("Valid text"));
  });

  it("should handle edge case with special characters in content", () => {
    const session = {
      sessionId: "abc123",
      title: "Special Chars",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "user" as const,
          content: '<script>alert("xss")</script>',
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>"));
  });

  it("should handle tool result with execution-denied output", () => {
    const session = {
      sessionId: "abc123",
      title: "Denied Tool",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "risky_tool",
              output: {
                type: "execution-denied" as const,
                reason: "Not allowed",
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Tool execution denied"));
    assert.ok(html.includes("Not allowed"));
  });

  it("should handle tool result with error-text output", () => {
    const session = {
      sessionId: "abc123",
      title: "Error Tool",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "failing_tool",
              output: {
                type: "error-text" as const,
                value: "Something went wrong",
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Error"));
    assert.ok(html.includes("Something went wrong"));
  });

  it("should handle tool result with error-json output", () => {
    const session = {
      sessionId: "abc123",
      title: "Error JSON Tool",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "failing_tool",
              output: {
                type: "error-json" as const,
                value: { code: 500, message: "internal" },
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Error"));
    assert.ok(html.includes("500"));
  });

  it("should handle tool result with content output", () => {
    const session = {
      sessionId: "abc123",
      title: "Content Tool",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "content_tool",
              output: {
                type: "content" as const,
                value: [
                  { type: "text" as const, text: "Output line 1" },
                  { type: "text" as const, text: "Output line 2" },
                ],
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Output line 1"));
    assert.ok(html.includes("Output line 2"));
  });

  it("should truncate tool result content over 5000 chars", () => {
    const longText = "x".repeat(6000);

    const session = {
      sessionId: "abc123",
      title: "Long Tool",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "big_tool",
              output: {
                type: "text" as const,
                value: longText,
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("[truncated]"));
    assert.ok(!html.includes(longText));
    assert.ok(html.includes(longText.slice(0, 5000)));
  });

  it("should handle unknown message role gracefully", () => {
    const session = {
      sessionId: "abc123",
      title: "Unknown Role",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "unknown_role" as any,
          content: "some content",
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(!html.includes("unknown_role"));
    assert.ok(!html.includes("some content"));
  });

  it("should default title to Untitled Session when empty", () => {
    const session = {
      sessionId: "abc123",
      title: "",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Untitled Session"));
  });

  it("should handle execution-denied without reason", () => {
    const session = {
      sessionId: "abc123",
      title: "Denied No Reason",
      modelId: "gpt-4",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: "call_1",
              toolName: "risky_tool",
              output: {
                type: "execution-denied" as const,
              },
            },
          ],
        },
      ],
    };

    const html = renderSessionHtml(session);

    assert.ok(html.includes("Tool execution denied"));
  });
});

describe("getSessionData", () => {
  it("should extract session data from session manager", () => {
    const now = new Date();
    const sessionManager = {
      get: () => [{ role: "user" as const, content: "test" }],
      getSessionId: () => "session-123",
      getTitle: () => "My Session",
      getModelId: () => "claude-3",
      getCreatedAt: () => now,
      getUpdatedAt: () => now,
    };

    const data = getSessionData(sessionManager, "my-project");

    assert.equal(data.sessionId, "session-123");
    assert.equal(data.title, "My Session");
    assert.equal(data.modelId, "claude-3");
    assert.equal(data.project, "my-project");
    assert.equal(data.createdAt, now);
    assert.equal(data.updatedAt, now);
    assert.equal(data.messages.length, 1);
  });

  it("should use cwd basename when project not provided", () => {
    const sessionManager = {
      get: () => [],
      getSessionId: () => "session-123",
      getTitle: () => "My Session",
      getModelId: () => "claude-3",
      getCreatedAt: () => new Date(),
      getUpdatedAt: () => new Date(),
    };

    const data = getSessionData(sessionManager);

    const expected = basename(process.cwd());
    assert.equal(data.project, expected);
  });
});

describe("estimateSessionSize", () => {
  it("should estimate session size correctly", () => {
    const session = {
      sessionId: "abc123",
      title: "Test",
      modelId: "gpt-4",
      project: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    };

    const result = estimateSessionSize(session);

    assert.equal(result.messageCount, 0);
    assert.ok(result.contentSizeBytes > 0);
  });

  it("should count messages", () => {
    const session = {
      sessionId: "abc123",
      title: "Test",
      modelId: "gpt-4",
      project: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        { role: "user" as const, content: "hello" },
        { role: "assistant" as const, content: "hi" },
      ],
    };

    const result = estimateSessionSize(session);

    assert.equal(result.messageCount, 2);
  });
});
