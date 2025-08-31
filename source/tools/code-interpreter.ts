import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const CodeInterpreterTool = {
  name: "codeInterpreter" as const,
};

const toolDescription = `Executes JavaScript or Typescript code in a separate Node.js process using Node's Permission Model. 

⚠️ **IMPORTANT TYPE SELECTION**:
- Use "JavaScript" for plain JavaScript code (no TypeScript syntax)
- Use "Typescript" for code containing interfaces, type annotations, generics, etc.
- Code type is automatically validated before execution

⚠️ **IMPORTANT**: This tool uses ES Modules (ESM) only.
- Use \`import\` statements, NOT \`require()\`
- Examples: \`import fs from 'node:fs'\` NOT \`const fs = require('fs')\`
- Add file extensions for relative imports: \`import { utils } from './utils.js'\`

These scripts are run in the \`${process.cwd}/.acai-ci-tmp\`. Keep this in mind if you intend to import or reference files from this project in your script.

Timeout defaults to 5 seconds and can be extended up to 60 seconds.`;

/**
 * Detects if code contains TypeScript syntax patterns
 */
function containsTypeScriptSyntax(code: string): boolean {
  // Common TypeScript patterns that don't exist in JavaScript
  const tsPatterns = [
    // Type annotations
    /:\s*[A-Z]\w*\s*(?=[,;=)])/g, // Type annotations after variables/parameters
    /:\s*\{[^}]*\}\s*(?=[,;=)])/g, // Object type annotations
    /:\s*\([^)]*\)\s*=>/g, // Function type annotations

    // Type declarations
    /^\s*interface\s+\w+/gm, // Interface declarations
    /^\s*type\s+\w+\s*=/gm, // Type aliases
    /^\s*enum\s+\w+/gm, // Enum declarations

    // Generic types
    /<\s*[A-Z]\w*(?:\s*,\s*[A-Z]\w*)*\s*>/g, // Generic type parameters
    /\w+\s*<\s*[^<>]+?\s*>/g, // Generic type usage

    // TypeScript-specific keywords (in specific contexts)
    /\b(?:implements|extends\s+[A-Z]\w*|readonly|private|protected|public)\b/g,

    // Utility types
    /\b(?:Partial|Required|Pick|Omit|Record|Exclude|Extract)\b/g,
  ];

  return tsPatterns.some((pattern) => pattern.test(code));
}

/**
 * Validates that code content matches the specified type
 */
function validateCodeTypeMatch(
  code: string,
  specifiedType: string | null,
): string | null {
  if (!code?.trim()) {
    return "No code provided";
  }

  const detectedType = containsTypeScriptSyntax(code)
    ? "Typescript"
    : "JavaScript";
  const expectedType = specifiedType ?? "JavaScript";

  // If TypeScript syntax detected but JavaScript specified
  if (detectedType === "Typescript" && expectedType === "JavaScript") {
    return `Code contains TypeScript syntax but is specified as JavaScript. Please either:
1. Change type to "Typescript", or
2. Remove TypeScript syntax (interfaces, type annotations, generics, etc.)

Detected TypeScript patterns: ${getTypeScriptPatternsFound(code).join(", ")}`;
  }

  // If no TypeScript syntax but TypeScript specified (warning, not error)
  if (detectedType === "JavaScript" && expectedType === "Typescript") {
    // This is not an error, just potentially unnecessary
    return null;
  }

  return null;
}

/**
 * Identifies specific TypeScript patterns found in code
 */
function getTypeScriptPatternsFound(code: string): string[] {
  const patterns: string[] = [];

  if (/\binterface\s+\w+/.test(code)) patterns.push("interface");
  if (/\btype\s+\w+\s*=/.test(code)) patterns.push("type alias");
  if (/:\s*[A-Z]\w*\s*(?=[,;=)])/g.test(code))
    patterns.push("type annotations");
  if (/<\s*[A-Z]\w*\s*>/.test(code)) patterns.push("generics");
  if (/\benum\s+\w+/.test(code)) patterns.push("enum");

  return patterns;
}

export const createCodeInterpreterTool = ({
  sendData,
}: Readonly<{
  sendData?: SendData | undefined;
}>) => {
  return {
    [CodeInterpreterTool.name]: tool({
      description: toolDescription,
      inputSchema: z.object({
        code: z
          .string()
          .describe("The JavaScript or Typescript code to be executed."),
        type: z
          .enum(["JavaScript", "Typescript"])
          .nullable()
          .describe("The type of code. Either Javascript or Typescript."),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(60)
          .nullable()
          .describe("Execution timeout in seconds (1-60). Default 5."),
      }),
      execute: async ({ code, type, timeoutSeconds }, { toolCallId }) => {
        const workingDirectory = process.cwd();

        try {
          // Pre-execution validation
          const validationError = validateCodeTypeMatch(code, type);
          if (validationError) {
            sendData?.({
              event: "tool-error",
              id: toolCallId,
              data: validationError,
            });
            return validationError;
          }

          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: "Initializing code interpreter environment",
          });

          const scriptType = (type ?? "JavaScript").toLowerCase();

          sendData?.({
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: "Executing...",
              secondary: [
                `${"`".repeat(3)} ${scriptType}}\n${code.slice(0, 500)}${"`".repeat(3)}`,
              ],
            },
          });

          if (code.trim().length === 0) {
            throw new Error("No code provided");
          }

          const timeoutMs = Math.min(
            Math.max((timeoutSeconds ?? 5) * 1000, 1000),
            60000,
          );

          const tmpBase = join(workingDirectory, ".acai-ci-tmp");
          await mkdir(tmpBase, { recursive: true });
          const ext = type === "JavaScript" ? ".mjs" : ".ts";
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
            } as Record<string, string>),
          });

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
            const message = `Process exited with code ${completed.code}. Stderr: ${stderr.trim()}`;
            throw new Error(message);
          }

          const result = {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: completed.code ?? -1,
          };

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data: "Code execution completed successfully",
          });

          return JSON.stringify(result, null, 2);
        } catch (err) {
          const errorMessage =
            (err as Error).name === "ETIMEDOUT" ||
            (err as Error).message.includes("timed out")
              ? "Script timed out"
              : `Error: ${(err as Error).message}`;

          sendData?.({
            event: "tool-error",
            id: toolCallId,
            data: errorMessage,
          });

          return errorMessage;
        }
      },
    }),
  };
};
