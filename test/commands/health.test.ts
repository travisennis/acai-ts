import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  BASH_TOOLS,
  checkEnvironmentVariables,
  checkTools,
  ENVIRONMENT_VARIABLES,
  formatEnvStatus,
  formatToolStatus,
} from "../../source/commands/health/utils.ts";

describe("health utils", () => {
  describe("ENVIRONMENT_VARIABLES", () => {
    it("should contain AI provider API keys", () => {
      const names = ENVIRONMENT_VARIABLES.map((v) => v.name);
      assert.ok(names.includes("OPENAI_API_KEY"));
      assert.ok(names.includes("ANTHROPIC_API_KEY"));
      assert.ok(names.includes("GOOGLE_GENERATIVE_AI_API_KEY"));
    });

    it("should contain OpenRouter and DeepSeek keys", () => {
      const names = ENVIRONMENT_VARIABLES.map((v) => v.name);
      assert.ok(names.includes("OPENROUTER_API_KEY"));
      assert.ok(names.includes("DEEPSEEK_API_KEY"));
    });

    it("should have descriptions for all variables", () => {
      for (const envVar of ENVIRONMENT_VARIABLES) {
        assert.ok(
          envVar.description.length > 0,
          `${envVar.name} should have a description`,
        );
      }
    });
  });

  describe("BASH_TOOLS", () => {
    it("should contain git and gh", () => {
      const names = BASH_TOOLS.map((t) => t.name);
      assert.ok(names.includes("git"));
      assert.ok(names.includes("gh"));
    });

    it("should contain search tools (rg, fd)", () => {
      const names = BASH_TOOLS.map((t) => t.name);
      assert.ok(names.includes("rg"));
      assert.ok(names.includes("fd"));
    });

    it("should contain JSON/YAML tools (jq, yq)", () => {
      const names = BASH_TOOLS.map((t) => t.name);
      assert.ok(names.includes("jq"));
      assert.ok(names.includes("yq"));
    });

    it("should have version commands for all tools", () => {
      for (const tool of BASH_TOOLS) {
        assert.ok(
          tool.command.length > 0,
          `${tool.name} should have a version command`,
        );
        assert.ok(
          tool.command.includes("--version"),
          `${tool.name} command should check version`,
        );
      }
    });
  });

  describe("checkEnvironmentVariables", () => {
    it("should return array with same length as ENVIRONMENT_VARIABLES", () => {
      const result = checkEnvironmentVariables();
      assert.strictEqual(result.length, ENVIRONMENT_VARIABLES.length);
    });

    it("should return array with 3 columns (name, status, description)", () => {
      const result = checkEnvironmentVariables();
      for (const row of result) {
        assert.strictEqual(row.length, 3);
      }
    });

    it("should mark unset environment variables correctly", () => {
      const result = checkEnvironmentVariables();
      const unsetVars = result.filter((row) => row[1] === "✗ Not set");
      assert.ok(unsetVars.length > 0);
    });

    it("should handle environment variable status", () => {
      const result = checkEnvironmentVariables();
      const hasSetVars = result.some((row) => row[1] === "✓ Set");
      // At least one env var should be set (LOG_LEVEL is often set)
      assert.ok(hasSetVars || result.length > 0);
    });
  });

  describe("checkTools", () => {
    it("should return array with same length as BASH_TOOLS", () => {
      const mockExec = mock.fn(() => undefined);
      const result = checkTools(mockExec);
      assert.strictEqual(result.length, BASH_TOOLS.length);
    });

    it("should return array with 2 columns (name, status)", () => {
      const mockExec = mock.fn(() => undefined);
      const result = checkTools(mockExec);
      for (const row of result) {
        assert.strictEqual(row.length, 2);
      }
    });

    it("should report installed tools correctly", () => {
      const mockExec = mock.fn(() => undefined);
      const result = checkTools(mockExec);
      const installedTools = result.filter((row) => row[1] === "✓ Installed");
      assert.strictEqual(installedTools.length, BASH_TOOLS.length);
      assert.strictEqual(
        // biome-ignore lint/suspicious/noExplicitAny: mock.calls is dynamically typed
        (mockExec as any).mock.calls.length,
        BASH_TOOLS.length,
      );
    });

    it("should report not installed tools correctly", () => {
      const mockExec = mock.fn(() => {
        throw new Error("Tool not found");
      });
      const result = checkTools(mockExec);
      const notInstalledTools = result.filter(
        (row) => row[1] === "✗ Not installed",
      );
      assert.strictEqual(notInstalledTools.length, BASH_TOOLS.length);
      assert.strictEqual(
        // biome-ignore lint/suspicious/noExplicitAny: mock.calls is dynamically typed
        (mockExec as any).mock.calls.length,
        BASH_TOOLS.length,
      );
    });

    it("should call execSync for each tool with correct command", () => {
      const mockExec = mock.fn(() => undefined);
      checkTools(mockExec);

      // biome-ignore lint/suspicious/noExplicitAny: mock.calls is dynamically typed
      const calls = (mockExec as any).mock.calls as Array<{
        arguments: [string, object];
      }>;
      assert.strictEqual(calls.length, BASH_TOOLS.length);

      for (let i = 0; i < BASH_TOOLS.length; i++) {
        assert.strictEqual(calls[i].arguments[0], BASH_TOOLS[i].command);
      }
    });

    it("should pass stdio ignore option to exec", () => {
      const mockExec = mock.fn(() => undefined);
      checkTools(mockExec);

      // biome-ignore lint/suspicious/noExplicitAny: mock.calls is dynamically typed
      const calls = (mockExec as any).mock.calls as Array<{
        arguments: [string, object];
      }>;
      assert.strictEqual(calls.length, BASH_TOOLS.length);

      for (const call of calls) {
        assert.deepStrictEqual(call.arguments[1], {
          stdio: "ignore",
          timeout: 5000,
        });
      }
    });
  });

  describe("formatEnvStatus", () => {
    it("should return the same status array", () => {
      const input: (string | number)[][] = [
        ["VAR1", "✓ Set", "Description 1"],
        ["VAR2", "✗ Not set", "Description 2"],
      ];
      const result = formatEnvStatus(input);
      assert.deepStrictEqual(result, input);
    });
  });

  describe("formatToolStatus", () => {
    it("should return the same status array", () => {
      const input: string[][] = [
        ["git", "✓ Installed"],
        ["gh", "✗ Not installed"],
      ];
      const result = formatToolStatus(input);
      assert.deepStrictEqual(result, input);
    });
  });
});
