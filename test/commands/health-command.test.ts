import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthCommand } from "../../source/commands/health-command.ts";
import {
  createMockCommandOptions,
  createMockContainer,
  createMockEditor,
  createMockExecSync,
  createMockTui,
} from "../utils/mocking.ts";

describe("/health command", () => {
  it("displays environment variables status", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions();

    const cmd = healthCommand(options);
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should have called showModal with modal content
    assert.equal(mockTui.showModal.mock.calls.length, 1);
  });

  it("handles no environment variables set", async () => {
    // Save original environment variables
    const originalEnv = { ...process.env };

    try {
      // Clear all relevant environment variables
      const envVars = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "DEEPSEEK_API_KEY",
        "X_AI_API_KEY",
        "XAI_API_KEY",
        "OPENROUTER_API_KEY",
        "EXA_API_KEY",
        "JINA_READER_API_KEY",
        "LOG_LEVEL",
      ];

      envVars.forEach((envVar) => {
        delete process.env[envVar];
      });

      const mockTui = createMockTui();
      const mockContainer = createMockContainer();
      const mockEditor = createMockEditor();

      const options = createMockCommandOptions();

      const cmd = healthCommand(options);
      await cmd.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });

      // Should have called showModal
      assert.equal(mockTui.showModal.mock.calls.length, 1);
    } finally {
      // Restore original environment variables
      Object.assign(process.env, originalEnv);
    }
  });

  it("shows success when at least one AI provider is configured", async () => {
    const mockTui = createMockTui();
    const mockContainer = createMockContainer();
    const mockEditor = createMockEditor();

    const options = createMockCommandOptions();

    // Set an environment variable
    process.env["OPENAI_API_KEY"] = "test-key";

    const cmd = healthCommand(options);
    await cmd.handle([], {
      tui: mockTui,
      container: mockContainer,
      inputContainer: mockContainer,
      editor: mockEditor,
    });

    // Should have called showModal
    assert.equal(mockTui.showModal.mock.calls.length, 1);

    // Clean up
    delete process.env["OPENAI_API_KEY"];
  });

  describe("bash tools status", () => {
    it("displays bash tools status when all tools are installed", async () => {
      const mockExecSync = createMockExecSync((command: string) => {
        if (
          command === "git --version" ||
          command === "gh --version" ||
          command === "rg --version" ||
          command === "fd --version" ||
          command === "ast-grep --version" ||
          command === "jq --version" ||
          command === "yq --version"
        ) {
          return Buffer.from("");
        }
        throw new Error("Unexpected command");
      });

      const mockTui = createMockTui();
      const mockContainer = createMockContainer();
      const mockEditor = createMockEditor();

      const options = createMockCommandOptions();

      const cmd = healthCommand(options, mockExecSync);
      await cmd.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });

      // Should have called showModal
      assert.equal(mockTui.showModal.mock.calls.length, 1);
    });

    it("displays warning when some tools are missing", async () => {
      const mockExecSync = createMockExecSync((command: string) => {
        if (
          command === "fd --version" ||
          command === "ast-grep --version" ||
          command === "jq --version" ||
          command === "yq --version"
        ) {
          throw new Error("Tool not found");
        }
        return Buffer.from("");
      });

      const mockTui = createMockTui();
      const mockContainer = createMockContainer();
      const mockEditor = createMockEditor();

      const options = createMockCommandOptions();

      const cmd = healthCommand(options, mockExecSync);
      await cmd.handle([], {
        tui: mockTui,
        container: mockContainer,
        inputContainer: mockContainer,
        editor: mockEditor,
      });

      // Should have called showModal
      assert.equal(mockTui.showModal.mock.calls.length, 1);
    });
  });
});
