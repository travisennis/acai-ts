import assert from "node:assert/strict";
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
    assert(tables[0].length > 0);

    // Check that each row has variable name, status, and description (3 columns)
    const firstRow = tables[0][0];
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
        table: (
          _data: (string | number)[][],
          _options?: { header?: string[]; colWidths?: number[] },
        ) => {
          outputs.push("table");
        },
      },
    } as unknown as CommandOptions;

    // Set an environment variable
    process.env.OPENAI_API_KEY = "test-key";

    const cmd = healthCommand(options);
    await cmd.execute([]);

    // Should show success when at least one provider is configured
    assert(
      outputs.some((o) => o.includes("At least one AI provider is configured")),
    );

    // Clean up
    delete process.env.OPENAI_API_KEY;
  });
});
