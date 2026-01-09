import { strict as assert } from "node:assert";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { chdir } from "node:process";
import { describe, it } from "node:test";
import type { ModelMessage } from "ai";
import {
  exportConversation,
  generateMarkdown,
} from "../../source/commands/history/utils.ts";
import { createTempDir } from "../utils/test-fixtures.ts";

describe("history-command", () => {
  describe("exportConversation", () => {
    it("should export conversation to markdown file with sanitized filename", async () => {
      const { path: tempDir, cleanup } = await createTempDir(
        "history-command",
        "export-test",
      );

      const originalCwd = process.cwd();

      try {
        // Change to temp directory so export writes there
        chdir(tempDir);

        const conversation = {
          title: "Test Conversation: Features & Ideas!",
          createdAt: new Date("2024-01-15T10:30:00Z"),
          updatedAt: new Date("2024-01-15T11:45:00Z"),
          messages: [
            {
              role: "user",
              content: "Hello, I need help with my code",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I'd be happy to help! What do you need?",
                },
              ],
            },
          ] as ModelMessage[],
          sessionId: "test-session-123",
          modelId: "claude-sonnet-4",
          project: "/Users/test/project",
        };

        const filename = await exportConversation(conversation);

        // Verify filename is sanitized
        assert.ok(
          filename.endsWith(".md"),
          "Filename should have .md extension",
        );
        assert.ok(
          !filename.includes(":"),
          "Filename should not contain colons from timestamp",
        );
        assert.ok(
          !filename.includes("!"),
          "Filename should not contain special characters from title",
        );
        assert.ok(
          filename.startsWith("test-conversation-features-ideas"),
          "Filename should start with sanitized title",
        );

        // Verify file was created
        const content = await readFile(path.join(tempDir, filename), "utf-8");

        // Verify markdown content structure
        assert.ok(content.includes("# Test Conversation: Features & Ideas!"));
        assert.ok(content.includes("Session ID"));
        assert.ok(content.includes("Model"));
        assert.ok(content.includes("test-session-123"));
        assert.ok(content.includes("claude-sonnet-4"));
        assert.ok(content.includes("USER (Message 1)"));
        assert.ok(content.includes("ASSISTANT (Message 2)"));

        // Clean up the generated file
        await rm(path.join(tempDir, filename));
      } finally {
        chdir(originalCwd);
        await cleanup();
      }
    });

    it("should handle conversation with tool calls in export", async () => {
      const { path: tempDir, cleanup } = await createTempDir(
        "history-command",
        "tool-call-test",
      );

      const originalCwd = process.cwd();

      try {
        chdir(tempDir);

        const conversation = {
          title: "Tool Test Conversation",
          createdAt: new Date("2024-02-20T14:00:00Z"),
          updatedAt: new Date("2024-02-20T14:30:00Z"),
          messages: [
            {
              role: "user",
              content: "Find all TypeScript files",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolName: "grep",
                  toolCallId: "call-123",
                  input: { pattern: "**/*.ts" },
                },
                {
                  type: "tool-result",
                  toolName: "grep",
                  toolCallId: "call-123",
                  output: { type: "text", text: "src/app.ts\nsrc/utils.ts" },
                },
              ],
            },
          ] as ModelMessage[],
          sessionId: "tool-session",
          modelId: "claude-sonnet-4",
          project: "/test/project",
        };

        const filename = await exportConversation(conversation);
        const content = await readFile(path.join(tempDir, filename), "utf-8");

        // Verify tool call and result are documented in markdown
        assert.ok(content.includes("Tool Call"));
        assert.ok(content.includes("Tool Result"));
        assert.ok(content.includes("grep"));
        assert.ok(content.includes("src/app.ts"));

        // Clean up the generated file
        await rm(path.join(tempDir, filename));
      } finally {
        chdir(originalCwd);
        await cleanup();
      }
    });

    it("should handle conversation with tool errors in export", async () => {
      const { path: tempDir, cleanup } = await createTempDir(
        "history-command",
        "tool-error-test",
      );

      const originalCwd = process.cwd();

      try {
        chdir(tempDir);

        const conversation = {
          title: "Error Test Conversation",
          createdAt: new Date("2024-03-10T09:00:00Z"),
          updatedAt: new Date("2024-03-10T09:15:00Z"),
          messages: [
            {
              role: "user",
              content: "Try to read a file that doesn't exist",
            },
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolName: "readFile",
                  toolCallId: "call-error-1",
                  input: { path: "/nonexistent/file.txt" },
                },
                {
                  type: "tool-error",
                  toolName: "readFile",
                  toolCallId: "call-error-1",
                  output: "File not found: /nonexistent/file.txt",
                },
              ],
            },
          ] as ModelMessage[],
          sessionId: "error-session",
          modelId: "claude-sonnet-4",
          project: "/test/project",
        };

        const filename = await exportConversation(conversation);
        const content = await readFile(path.join(tempDir, filename), "utf-8");

        // Verify tool error is documented
        assert.ok(content.includes("Tool Error"));
        assert.ok(content.includes("File not found"));

        // Clean up the generated file
        await rm(path.join(tempDir, filename));
      } finally {
        chdir(originalCwd);
        await cleanup();
      }
    });
  });

  describe("generateMarkdown", () => {
    it("should generate valid markdown structure for conversation", () => {
      const conversation = {
        title: "Test Title",
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T12:30:00Z"),
        messages: [
          {
            role: "user",
            content: "Test message",
          },
          {
            role: "assistant",
            content: [
              { type: "text", text: "Response with **bold** and code" },
            ],
          },
        ] as ModelMessage[],
        sessionId: "abc-123",
        modelId: "test-model",
        project: "/test",
      };

      const markdown = generateMarkdown(conversation);

      assert.ok(markdown.startsWith("# Test Title"));
      assert.ok(markdown.includes("## Conversation Metadata"));
      assert.ok(markdown.includes("Session ID"));
      assert.ok(markdown.includes("Model"));
      assert.ok(markdown.includes("## Conversation History"));
      assert.ok(markdown.includes("USER (Message 1)"));
      assert.ok(markdown.includes("ASSISTANT (Message 2)"));
      assert.ok(markdown.includes("Test message"));
      assert.ok(markdown.includes("Response with **bold** and code"));
    });

    it("should handle empty messages array", () => {
      const conversation = {
        title: "Empty Conversation",
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T12:00:00Z"),
        messages: [],
        sessionId: "empty-123",
        modelId: "test-model",
        project: "/test",
      };

      const markdown = generateMarkdown(conversation);

      // Verify basic structure is present
      assert.ok(markdown.includes("# Empty Conversation"));
      assert.ok(markdown.includes("## Conversation Metadata"));
      assert.ok(markdown.includes("Session ID"));
      // Verify no message sections are generated
      assert.ok(markdown.includes("USER") === false);
      assert.ok(markdown.includes("ASSISTANT") === false);
    });
  });
});
