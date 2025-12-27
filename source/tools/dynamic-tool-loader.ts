import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import type { ToolCallOptions, ToolResult } from "./types.ts";

// Tool Metadata Schema and Parser
const toolMetadataSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  description: z.string().min(1),
  parameters: z.array(
    z.object({
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
      type: z.enum(["string", "number", "boolean"]),
      description: z.string().min(1),
      required: z.boolean().default(true),
      default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }),
  ),
  needsApproval: z.boolean().default(true),
});

export type ToolMetadata = z.infer<typeof toolMetadataSchema>;

export function parseToolMetadata(output: string): ToolMetadata {
  try {
    const parsed = JSON.parse(output.trim());
    return toolMetadataSchema.parse(parsed);
  } catch (error) {
    throw new Error(
      `Failed to parse tool metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function generateZodSchema(parameters: ToolMetadata["parameters"]) {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (const param of parameters) {
    let schema: z.ZodTypeAny;
    switch (param.type) {
      case "string":
        schema = z.string();
        break;
      case "number":
        schema = z.preprocess(
          (val) =>
            typeof val === "string" && val.toLowerCase() === "null"
              ? null
              : val,
          z.coerce.number().nullable(),
        );
        break;
      case "boolean":
        schema = z.preprocess(
          (val) =>
            typeof val === "string" && val.toLowerCase() === "null"
              ? null
              : val,
          z.coerce.boolean().nullable(),
        );
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

    child.on("close", () => {
      clearTimeout(timer);
      if (hasTimedOut) return;

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
    });

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        child.kill();
      });
    }
  });
}

// Type for individual dynamic tool objects
interface DynamicToolObject {
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

function createDynamicTool(
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
            name: metadata.name,
            event: "tool-init",
            id: toolCallId,
            data: "Running",
          };

          // Validate params again for safety
          try {
            inputSchema.parse(input);
          } catch (e) {
            const errMsg = `Invalid parameters for tool ${metadata.name}: ${(e as Error).message}`;
            yield {
              name: metadata.name,
              event: "tool-error",
              id: toolCallId,
              data: errMsg,
            };
            yield errMsg;
            return;
          }

          const result = await spawnChildProcess(
            scriptPath,
            input,
            abortSignal,
          );

          yield {
            name: metadata.name,
            event: "tool-completion",
            id: toolCallId,
            data: "Completed",
          };

          yield result;
        } catch (error) {
          yield {
            name: metadata.name,
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
  const projectConfig = await config.getConfig();
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
