import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { parseToolMetadata, type ToolMetadata } from "./dynamic-tool-parser.ts";
import type { ToolResult } from "./types.ts";

function generateZodSchema(parameters: ToolMetadata["parameters"]) {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (const param of parameters) {
    let schema: z.ZodTypeAny;
    switch (param.type) {
      case "string":
        schema = z.string();
        break;
      case "number":
        schema = z.coerce.number();
        break;
      case "boolean":
        schema = z.coerce.boolean();
        break;
      default:
        continue;
    }
    if (!param.required) {
      schema = schema.optional();
    }
    if (param.default !== undefined) {
      schema = schema.default(param.default);
    }
    fields[param.name] = schema.describe(param.description);
  }
  return z.object(fields);
}

async function getMetadata(scriptPath: string): Promise<ToolMetadata | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      // Find the node executable path
      const nodePath = process.execPath;
      child = spawn(nodePath, [scriptPath], {
        env: {
          ...process.env,
          // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
          TOOL_ACTION: "describe",
          // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      logger.error(`Failed to spawn ${scriptPath}: ${e}`);
      resolve(null);
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        logger.error(`Script ${scriptPath} failed to describe: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const metadata = parseToolMetadata(stdout);
        resolve(metadata);
      } catch (e) {
        logger.error(
          `Failed to parse metadata from ${scriptPath}: ${String(e)}`,
        );
        resolve(null);
      }
    });

    child.on("error", (err) => {
      logger.error(`Spawn error for ${scriptPath}: ${err}`);
      resolve(null);
    });
  });
}

async function spawnChildProcess(
  scriptPath: string,
  params: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<string> {
  const paramsArray = Object.entries(params).map(([name, value]) => ({
    name,
    value,
  }));
  const paramsJson = JSON.stringify(paramsArray);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
        TOOL_ACTION: "execute",
        // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
        NODE_ENV: "production",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let hasTimedOut = false;

    const timer = setTimeout(() => {
      hasTimedOut = true;
      child.kill();
      reject(new Error("Execution timed out after 30 seconds"));
    }, 30000);

    child.stdin.write(`${paramsJson}\n`);
    child.stdin.end();

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (hasTimedOut) return;

      if (code !== 0) {
        reject(
          new Error(
            `Dynamic tool failed: ${stderr || `Exited with code ${code}`}`,
          ),
        );
      } else {
        let output = stdout.trim();
        const maxOutputBytes = 2000000;
        if (output.length > maxOutputBytes) {
          output = `${output.substring(0, maxOutputBytes)}\n[Output truncated]`;
        }

        // If no stdout, prefer stderr so callers get useful info
        const errText = stderr.trim();
        if (!output && errText) {
          output = errText;
        }

        // Fallback to a non-empty placeholder to satisfy callers
        if (!output) {
          output = "[No output from dynamic tool]";
        }

        // Attempt to parse as JSON if structured
        if (output && (output.startsWith("{") || output.startsWith("["))) {
          try {
            resolve(JSON.stringify(JSON.parse(output)));
          } catch {
            resolve(output);
          }
        } else {
          resolve(output);
        }
      }
    });

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        child.kill();
      });
    }
  });
}

// Type for individual dynamic tool objects
export interface DynamicToolObject {
  toolDef: {
    description: string;
    // biome-ignore lint/suspicious/noExplicitAny: makes it easier to handle dynamic input schemas
    inputSchema: any;
  };
  execute: (
    input: Record<string, unknown>,
    options: ToolCallOptions,
  ) => AsyncGenerator<ToolResult>;
  ask?: (
    input: Record<string, unknown>,
    options: ToolCallOptions,
  ) => Promise<{ approve: boolean; reason?: string }>;
}

export function createDynamicTool(
  scriptPath: string,
  metadata: ToolMetadata,
): { [x: string]: DynamicToolObject } {
  const inputSchema = generateZodSchema(metadata.parameters);
  const toolName = `dynamic-${metadata.name}`;

  return {
    [toolName]: {
      toolDef: {
        description: metadata.description,
        inputSchema,
      },
      async *execute(
        input: Record<string, unknown>,
        { toolCallId, abortSignal }: ToolCallOptions,
      ): AsyncGenerator<ToolResult> {
        try {
          if (abortSignal?.aborted) {
            throw new Error("Execution aborted");
          }

          yield {
            event: "tool-init",
            id: toolCallId,
            data: `${metadata.name}`,
          };

          // Validate params again for safety
          try {
            inputSchema.parse(input);
          } catch (e) {
            const errMsg = `Invalid parameters for tool ${metadata.name}: ${(e as Error).message}`;
            yield { event: "tool-error", id: toolCallId, data: errMsg };
            yield errMsg;
            return;
          }

          const result = await spawnChildProcess(
            scriptPath,
            input,
            abortSignal,
          );

          // Include output preview in completion message
          const outputLines = result.split("\n");
          const lastLines = outputLines.slice(-20).join("\n");
          yield {
            event: "tool-completion",
            id: toolCallId,
            data: `Dynamic tool ${metadata.name} completed\n\nLast 20 lines of output:\n${lastLines}`,
          };

          yield result;
        } catch (error) {
          yield {
            event: "tool-error",
            id: toolCallId,
            data: `${metadata.name}: ${(error as Error).message}`,
          };
          yield (error as Error).message;
        }
      },
    } as DynamicToolObject,
  };
}

export async function loadDynamicTools({ baseDir }: { baseDir: string }) {
  const projectConfig = await config.readProjectConfig();
  const dynamicConfig = projectConfig.tools.dynamicTools;

  if (!dynamicConfig.enabled) {
    logger.info("Dynamic tools disabled in config.");
    return {};
  }

  const projectToolsDir = path.join(baseDir, ".acai", "tools");
  const userToolsDir = path.join(os.homedir(), ".acai", "tools");

  const toolMap = new Map<string, { path: string; metadata: ToolMetadata }>();

  const scanDir = async (dir: string, isProject = false) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
      for (const file of files) {
        const scriptPath = path.join(dir, file);
        try {
          const metadata = await getMetadata(scriptPath);
          if (metadata) {
            toolMap.set(metadata.name, { path: scriptPath, metadata });
            logger.info(
              `Loaded ${isProject ? "project" : "user"} tool: ${metadata.name}`,
            );
          } else {
            logger.warn(`Skipped invalid tool: ${file}`);
          }
        } catch (e) {
          logger.error(`Error scanning ${file}: ${e}`);
        }
      }
    } catch (e) {
      logger.error(`Error reading dir ${dir}: ${e}`);
    }
  };

  // Scan user first, then project to let project override
  await scanDir(userToolsDir, false);
  await scanDir(projectToolsDir, true);

  // Enforce maxTools, preferring recent (project) entries
  if (toolMap.size > dynamicConfig.maxTools) {
    logger.warn(
      `Warning: ${toolMap.size} dynamic tools found, limiting to ${dynamicConfig.maxTools}`,
    );
    const entries = Array.from(toolMap.entries());
    const limitedEntries = entries.slice(-dynamicConfig.maxTools);
    toolMap.clear();
    for (const [name, value] of limitedEntries) {
      toolMap.set(name, value);
    }
  }

  const tools: Record<string, DynamicToolObject> = {};
  for (const [_, { path, metadata }] of toolMap) {
    Object.assign(tools, createDynamicTool(path, metadata));
  }

  return tools;
}
