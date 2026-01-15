import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  escapeHtml,
  estimateSessionSize,
  getSessionData,
  renderSessionHtml,
  type SessionData,
} from "../../source/commands/share/html-renderer.ts";

describe("share/html-renderer.ts", () => {
  describe("escapeHtml", () => {
    it("should escape ampersands", () => {
      assert.strictEqual(escapeHtml("foo & bar"), "foo &amp; bar");
    });

    it("should escape less-than signs", () => {
      assert.strictEqual(escapeHtml("<script>"), "&lt;script&gt;");
    });

    it("should escape greater-than signs", () => {
      assert.strictEqual(escapeHtml("a > b"), "a &gt; b");
    });

    it("should escape double quotes", () => {
      assert.strictEqual(escapeHtml('"test"'), "&quot;test&quot;");
    });

    it("should escape single quotes", () => {
      assert.strictEqual(escapeHtml("it's"), "it&#039;s");
    });

    it("should escape multiple special characters", () => {
      const input = '<script>alert("XSS")</script>';
      const expected = "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;";
      assert.strictEqual(escapeHtml(input), expected);
    });

    it("should handle empty string", () => {
      assert.strictEqual(escapeHtml(""), "");
    });

    it("should not modify strings without special characters", () => {
      const input = "Hello, world!";
      assert.strictEqual(escapeHtml(input), input);
    });
  });

  describe("renderSessionHtml", () => {
    const createMockSession = (
      overrides: Partial<SessionData> = {},
    ): SessionData => ({
      sessionId: "test-session-id",
      title: "Test Session",
      modelId: "test-model",
      project: "test-project",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T11:00:00Z"),
      messages: [],
      ...overrides,
    });

    it("should return valid HTML structure", () => {
      const session = createMockSession();
      const html = renderSessionHtml(session);

      assert.ok(html.includes("<!DOCTYPE html>"), "Should have DOCTYPE");
      assert.ok(html.includes("<html"), "Should have html tag");
      assert.ok(html.includes("</html>"), "Should close html tag");
      assert.ok(html.includes("<head>"), "Should have head tag");
      assert.ok(html.includes("<body>"), "Should have body tag");
    });

    it("should include session title in HTML", () => {
      const session = createMockSession({ title: "My Test Title" });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes("Session: My Test Title"),
        "Should include escaped title",
      );
    });

    it("should escape XSS in title", () => {
      const session = createMockSession({
        title: '<script>alert("xss")</script>',
      });
      const html = renderSessionHtml(session);

      assert.ok(
        !html.includes("<script>alert"),
        "Should not contain unescaped script",
      );
      assert.ok(
        html.includes("&lt;script&gt;"),
        "Should have escaped script tag",
      );
    });

    it("should include project metadata", () => {
      const session = createMockSession({ project: "my-project" });
      const html = renderSessionHtml(session);

      assert.ok(html.includes("my-project"), "Should include project name");
    });

    it("should include model metadata", () => {
      const session = createMockSession({ modelId: "gpt-4" });
      const html = renderSessionHtml(session);

      assert.ok(html.includes("gpt-4"), "Should include model ID");
    });

    it("should render user messages with correct styling", () => {
      const session = createMockSession({
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello assistant" }],
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes('class="message user"'),
        "Should have user class",
      );
      assert.ok(
        html.includes("Hello assistant"),
        "Should include message text",
      );
    });

    it("should render assistant messages with correct styling", () => {
      const session = createMockSession({
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "Hello user" }],
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes('class="message assistant"'),
        "Should have assistant class",
      );
      assert.ok(html.includes("Hello user"), "Should include message text");
    });

    it("should render system messages with distinct styling", () => {
      const session = createMockSession({
        messages: [
          {
            role: "system",
            content: "System instruction",
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes('class="message system"'),
        "Should have system class",
      );
      assert.ok(
        html.includes("System instruction"),
        "Should include system message",
      );
    });

    it("should escape user message content", () => {
      const session = createMockSession({
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: '<img src=x onerror="alert(1)">' }],
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        !html.includes("<img src=x onerror"),
        "Should not contain unescaped HTML",
      );
      assert.ok(html.includes("&lt;img"), "Should have escaped img tag");
    });

    it("should render tool calls with tool name", () => {
      const session = createMockSession({
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-123",
                toolName: "readFile",
                input: { path: "/test.txt" },
              },
            ],
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes('class="tool-call"'),
        "Should have tool-call class",
      );
      assert.ok(
        html.includes('class="tool-name"'),
        "Should have tool-name class",
      );
      assert.ok(html.includes("readFile"), "Should display tool name");
    });

    it("should render tool results with tool name", () => {
      const session = createMockSession({
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-123",
                toolName: "readFile",
                output: { type: "text", value: "file contents here" },
              },
            ],
          },
        ],
      });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes('class="tool-result"'),
        "Should have tool-result class",
      );
      assert.ok(html.includes("readFile"), "Should display tool name");
      assert.ok(
        html.includes("file contents here"),
        "Should display result content",
      );
    });

    it("should include embedded CSS", () => {
      const session = createMockSession();
      const html = renderSessionHtml(session);

      assert.ok(html.includes("<style>"), "Should have embedded styles");
      assert.ok(html.includes("--user-accent"), "Should define user accent");
      assert.ok(
        html.includes("--assistant-accent"),
        "Should define assistant accent",
      );
      assert.ok(
        html.includes("--system-accent"),
        "Should define system accent",
      );
      assert.ok(html.includes("--tool-accent"), "Should define tool accent");
    });

    it("should handle untitled session", () => {
      const session = createMockSession({ title: "" });
      const html = renderSessionHtml(session);

      assert.ok(
        html.includes("Untitled Session"),
        "Should show fallback title",
      );
    });
  });

  describe("getSessionData", () => {
    it("should extract session data from session manager", () => {
      const mockSessionManager = {
        get: () => [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: "test" }],
          },
        ],
        getSessionId: () => "session-123",
        getTitle: () => "Test Title",
        getModelId: () => "model-abc",
        getCreatedAt: () => new Date("2024-01-01"),
        getUpdatedAt: () => new Date("2024-01-02"),
      };

      const data = getSessionData(mockSessionManager, "my-project");

      assert.strictEqual(data.sessionId, "session-123");
      assert.strictEqual(data.title, "Test Title");
      assert.strictEqual(data.modelId, "model-abc");
      assert.strictEqual(data.project, "my-project");
      assert.strictEqual(data.messages.length, 1);
    });
  });

  describe("estimateSessionSize", () => {
    it("should return message count", () => {
      const session: SessionData = {
        sessionId: "test",
        title: "Test",
        modelId: "model",
        project: "proj",
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          { role: "user", content: [{ type: "text", text: "msg1" }] },
          { role: "assistant", content: [{ type: "text", text: "msg2" }] },
        ],
      };

      const { messageCount } = estimateSessionSize(session);
      assert.strictEqual(messageCount, 2);
    });

    it("should return content size in bytes", () => {
      const session: SessionData = {
        sessionId: "test",
        title: "Test",
        modelId: "model",
        project: "proj",
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      const { contentSizeBytes } = estimateSessionSize(session);
      assert.ok(contentSizeBytes > 0, "Should have positive size");
    });

    it("should increase size with more messages", () => {
      const smallSession: SessionData = {
        sessionId: "test",
        title: "Test",
        modelId: "model",
        project: "proj",
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      const largeSession: SessionData = {
        ...smallSession,
        messages: Array(100)
          .fill(null)
          .map(() => ({
            role: "user" as const,
            content: [{ type: "text" as const, text: "a".repeat(1000) }],
          })),
      };

      const smallSize = estimateSessionSize(smallSession).contentSizeBytes;
      const largeSize = estimateSessionSize(largeSession).contentSizeBytes;

      assert.ok(
        largeSize > smallSize,
        "Larger session should have larger size",
      );
    });
  });
});
