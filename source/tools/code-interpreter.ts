import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageTokenLimit } from "../tokens/threshold.ts";
import type { ToolResult } from "./types.ts";

export const CodeInterpreterTool = {
  name: "codeInterpreter" as const,
};

const toolDescription = `Executes Typescript code in a separate Node.js process using Node's Permission Model. 

⚠️ **IMPORTANT**: This tool uses ES Modules (ESM) only.
- Use \`import\` statements, NOT \`require()\`
- Examples: \`import fs from 'node:fs'\` NOT \`const fs = require('fs')\`
- Add file extensions for relative imports: \`import { utils } from './utils.js'\`

These scripts are run in the \`${process.cwd()}/.acai-ci-tmp\`. You can import project source files using relative paths from the project root with .ts extensions:

\`\`\` typescript
import { functionName } from '../source/path/to/module.ts';
\`\`\`

The interpreter supports ES Modules with TypeScript files directly.

Timeout defaults to 5 seconds and can be extended up to 60 seconds.`;

const inputSchema = z.object({
  code: z.string().describe("The Typescript code to be executed."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .nullable()
    .describe("Execution timeout in seconds (1-60). Default 5."),
});

export const createCodeInterpreterTool = async ({
  tokenCounter,
}: {
  tokenCounter: TokenCounter;
}) => {
  const toolDef = {
    description: toolDescription,
    inputSchema,
  };

  async function* execute(
    { code, timeoutSeconds }: z.infer<typeof inputSchema>,
    { toolCallId, abortSignal }: ToolCallOptions,
  ): AsyncGenerator<ToolResult> {
    // Check if execution has been aborted
    if (abortSignal?.aborted) {
      throw new Error("Code interpretation aborted");
    }
    const workingDirectory = process.cwd();

    const lines = code.split("\n");
    try {
      yield {
        event: "tool-init",
        id: toolCallId,
        data: `CodeInterpreter: Executing ${lines.length} of code.`,
      };

      if (code.trim().length === 0) {
        throw new Error("No code provided");
      }

      if (abortSignal?.aborted) {
        throw new Error("Code interpretation aborted before execution");
      }

      const timeoutMs = Math.min(
        Math.max((timeoutSeconds ?? 5) * 1000, 1000),
        60000,
      );

      const tmpBase = join(workingDirectory, ".acai-ci-tmp");
      await mkdir(tmpBase, { recursive: true });
      const ext = ".ts";
      const scriptPath = join(
        tmpBase,
        `temp_script_${Date.now()}_${randomUUID()}${ext}`,
      );

      await writeFile(scriptPath, code, { encoding: "utf8" });

      const args = [
        "--permission",
        `--allow-fs-read=${workingDirectory}`,
        `--allow-fs-write=${workingDirectory}`,
        scriptPath,
      ];

      const child = spawn(process.execPath, args, {
        cwd: workingDirectory,
        // do not rely solely on spawn's timeout; we implement manual timeout below
        stdio: "pipe",
        env: Object.assign({}, process.env, {
          // biome-ignore lint/style/useNamingConvention: Environment variable keys are uppercase by convention
          NO_COLOR: "true",
          // biome-ignore lint/style/useNamingConvention: Environment variable keys are uppercase by convention
          NODE_OPTIONS: "",
          // biome-ignore lint/style/useNamingConvention: Environment variable keys are uppercase by convention
          ACAI_CODE_INTERPRETER: "true",
        } as Record<string, string>),
      });

      // Handle abort signal by killing the child process
      if (abortSignal) {
        const abortHandler = () => {
          try {
            child.kill("SIGKILL");
          } catch {}
          throw new Error("Code interpretation aborted during execution");
        };
        abortSignal.addEventListener("abort", abortHandler);
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {}
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      const completed = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.on("error", (err) => reject(err));
        child.on("close", (code, signal) => resolve({ code, signal }));
      });

      clearTimeout(timer);

      // Cleanup temp file/directory
      await rm(scriptPath, { force: true });
      await rm(tmpBase, { force: true, recursive: true });

      if (timedOut) {
        throw new Error("Script timed out");
      }

      if (completed.code === null) {
        throw new Error(
          `Process terminated by signal ${completed.signal ?? "unknown"}`,
        );
      }

      if (completed.code !== 0) {
        const message = `Process exited with code ${completed.code}. Stderr:\n${stderr.trim()}`;
        throw new Error(message);
      }

      const result = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: completed.code ?? -1,
      };

      const resultJson = JSON.stringify(result, null, 2);
      const managedResult = await manageTokenLimit(
        resultJson,
        tokenCounter,
        "CodeInterpreter",
        "Reduce script complexity or output size",
      );

      yield {
        event: "tool-completion",
        id: toolCallId,
        data: `CodeInterpreter: Completed successfully${managedResult.tokenCount > 0 ? ` (${managedResult.tokenCount} tokens)` : ""}`,
      };

      yield managedResult.content;
    } catch (err) {
      const errorMessage =
        (err as Error).name === "ETIMEDOUT" ||
        (err as Error).message.includes("timed out")
          ? "Script timed out"
          : `Error:\n${(err as Error).message}`;

      yield {
        event: "tool-error",
        id: toolCallId,
        data: `CodeInterpreter: ${errorMessage}`,
      };

      yield errorMessage;
    }
  }

  return {
    toolDef,
    execute,
  };
};
