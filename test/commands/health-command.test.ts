import assert from "node:assert/strict";
import type { ExecSyncOptions, execSync } from "node:child_process";
import { describe, it } from "node:test";
import { healthCommand } from "../../source/commands/health-command.ts";
import type { CommandOptions } from "../../source/commands/types.ts";

describe("/health command", () => {
  it("displays environment variables status", async () => {
    const outputs: string[] = [];
    const tables: (string | number)[][][] = [];

    const options = {
      terminal: {
        info: (msg: string) => outputs.push(msg),
        success: (_msg: string) => outputs.push("success"),
        error: (_msg: string) => outputs.push("error"),
        warn: (_msg: string) => outputs.push("warn"),
        lineBreak: () => outputs.push("lineBreak"),
        table: (
          data: (string | number)[][],
          options?: { header?: string[]; colWidths?: number[] },
        ) => {
          tables.push(data);
          outputs.push(`table:${options?.header?.join(",")}`);
        },
      },
    } as unknown as CommandOptions;

    const cmd = healthCommand(options);
    await cmd.execute([]);

    // Should display environment variables status
    assert(outputs.some((o) => o.includes("Environment Variables Status")));

    // Should display a table with Variable, Status, Description headers
    assert(outputs.some((o) => o.includes("Variable,Status,Description")));

    // Should display summary
    assert(outputs.some((o) => o.includes("environment variables are set")));

    // Should have called table method with data
    assert(tables.length > 0);
    assert(tables[0] !== undefined);
    assert(tables[0].length > 0);

    // Check that each row has variable name, status, and description (3 columns)
    const firstRow = tables[0][0];
    assert(firstRow !== undefined);
    assert(firstRow.length === 3); // Should have 3 columns
    assert(typeof firstRow[0] === "string"); // Variable name
    assert(firstRow[1] === "✓ Set" || firstRow[1] === "✗ Not set"); // Status
    assert(typeof firstRow[2] === "string"); // Description
  });

  it("handles no environment variables set", async () => {
    const outputs: string[] = [];

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

      const options = {
        terminal: {
          info: (msg: string) => outputs.push(msg),
          success: (_msg: string) => outputs.push("success"),
          error: (_msg: string) => outputs.push("error"),
          warn: (msg: string) => outputs.push(msg),
          lineBreak: () => outputs.push("lineBreak"),
          table: (
            _data: (string | number)[][],
            _options?: { header?: string[]; colWidths?: number[] },
          ) => {
            outputs.push("table");
          },
        },
      } as unknown as CommandOptions;

      const cmd = healthCommand(options);
      await cmd.execute([]);

      // Should show warning when no AI providers are configured
      assert(
        outputs.some(
          (o) =>
            o.includes("No AI provider API keys are configured") &&
            o.includes("⚠️"),
        ),
      );
    } finally {
      // Restore original environment variables
      Object.assign(process.env, originalEnv);
    }
  });

  it("shows success when at least one AI provider is configured", async () => {
    const outputs: string[] = [];

    const options = {
      terminal: {
        info: (msg: string) => outputs.push(msg),
        success: (_msg: string) => outputs.push("success"),
        error: (_msg: string) => outputs.push("error"),
        warn: (_msg: string) => outputs.push("warn"),
        lineBreak: () => outputs.push("lineBreak"),
        table: (
          _data: (string | number)[][],
          _options?: { header?: string[]; colWidths?: number[] },
        ) => {
          outputs.push("table");
        },
      },
    } as unknown as CommandOptions;

    // Set an environment variable
    process.env["OPENAI_API_KEY"] = "test-key";

    const cmd = healthCommand(options);
    await cmd.execute([]);

    // Should show success when at least one provider is configured
    assert(
      outputs.some((o) => o.includes("At least one AI provider is configured")),
    );

    // Clean up
    delete process.env["OPENAI_API_KEY"];
  });

  describe("bash tools status", () => {
    it("displays bash tools status when all tools are installed", async () => {
      const outputs: string[] = [];
      const tables: string[][][] = [];

      const mockExecSync = ((command: string, _options?: ExecSyncOptions) => {
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
      }) as typeof execSync;

      const options = {
        terminal: {
          info: (msg: string) => outputs.push(msg),
          success: (_msg: string) => outputs.push("success"),
          error: (_msg: string) => outputs.push("error"),
          warn: (_msg: string) => outputs.push("warn"),
          lineBreak: () => outputs.push("lineBreak"),
          table: (
            data: string[][],
            options?: { header?: string[]; colWidths?: number[] },
          ) => {
            tables.push(data);
            outputs.push(`tool_table:${options?.header?.join(",")}`);
          },
        },
      } as unknown as CommandOptions;

      const cmd = healthCommand(options, mockExecSync);
      await cmd.execute([]);

      // Should display bash tools status
      assert(outputs.some((o) => o.includes("Bash Tools Status")));

      // Should display tool summary with all installed
      assert(outputs.some((o) => o.includes("7/7 tools are installed")));

      // Should show success message
      assert(
        outputs.some((o) => o.includes("All required tools are installed")),
      );

      // Should have called table with tool data
      assert(tables.length > 0);
      const toolTable = tables.find(
        (t) => t.length > 0 && t[0] && t[0].length > 0 && t[0][0] === "git",
      );
      assert(toolTable !== undefined);
      assert(toolTable[0] !== undefined);
      const firstRow = toolTable[0];
      assert(firstRow[1] === "✓ Installed");
    });

    it("displays warning when some tools are missing", async () => {
      const outputs: string[] = [];

      const mockExecSync = ((command: string, _options?: ExecSyncOptions) => {
        if (
          command === "fd --version" ||
          command === "ast-grep --version" ||
          command === "jq --version" ||
          command === "yq --version"
        ) {
          throw new Error("Tool not found");
        }
        return Buffer.from("");
      }) as typeof execSync;

      const options = {
        terminal: {
          info: (msg: string) => outputs.push(msg),
          success: (_msg: string) => outputs.push("success"),
          error: (_msg: string) => outputs.push("error"),
          warn: (msg: string) => outputs.push(msg),
          lineBreak: () => outputs.push("lineBreak"),
          table: (
            _data: string[][],
            _options?: { header?: string[]; colWidths?: number[] },
          ) => {
            outputs.push("tool_table");
          },
        },
      } as unknown as CommandOptions;

      const cmd = healthCommand(options, mockExecSync);
      await cmd.execute([]);

      // Should display bash tools status
      assert(outputs.some((o) => o.includes("Bash Tools Status")));

      // Should display tool summary with some missing
      assert(outputs.some((o) => o.includes("3/7 tools are installed")));

      // Should show warning
      assert(
        outputs.some(
          (o) => o.includes("Some tools are missing") && o.includes("⚠️"),
        ),
      );
    });
  });
});
