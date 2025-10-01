import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { parseToolMetadata, type ToolMetadata } from "./dynamic-tool-parser.ts";
import type { SendData } from "./types.ts";

function generateZodSchema(parameters: ToolMetadata["parameters"]) {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (const param of parameters) {
    let schema: z.ZodTypeAny;
    switch (param.type) {
      case "string":
        schema = z.string();
        break;
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
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

export function createDynamicTool(
  scriptPath: string,
  metadata: ToolMetadata,
  sendData?: SendData,
) {
  const inputSchema = generateZodSchema(metadata.parameters);
  const toolName = `dynamic-${metadata.name}`;

  return {
    [toolName]: tool({
      description: metadata.description,
      inputSchema,
      execute: async (params, { toolCallId, abortSignal }) => {
        if (abortSignal?.aborted) {
          throw new Error("Execution aborted");
        }

        sendData?.({
          id: toolCallId,
          event: "tool-init",
          data: `Executing dynamic tool: ${metadata.name}`,
        });

        // Validate params again for safety
        try {
          inputSchema.parse(params);
        } catch (e) {
          const errMsg = `Invalid parameters for tool ${metadata.name}: ${(e as Error).message}`;
          sendData?.({
            id: toolCallId,
            event: "tool-error",
            data: errMsg,
          });
          throw new Error(errMsg);
        }

        const paramsArray = Object.entries(params).map(([name, value]) => ({
          name,
          value,
        }));
        const paramsJson = JSON.stringify(paramsArray);

        return new Promise<unknown>((resolve) => {
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
            sendData?.({
              id: toolCallId,
              event: "tool-update",
              data: { primary: "Execution timed out after 30 seconds" },
            });
            resolve("Execution timed out after 30 seconds");
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
              const errorMsg = `Dynamic tool ${metadata.name} failed: ${stderr || `Exited with code ${code}`}`;
              sendData?.({
                id: toolCallId,
                event: "tool-error",
                data: errorMsg,
              });
              resolve(errorMsg);
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
                output = `[No output from dynamic tool ${metadata.name}]`;
              }

              // Send tool-update event with last 20 lines of output
              const outputLines = output.split("\n");
              const lastLines = outputLines.slice(-20).join("\n");
              sendData?.({
                id: toolCallId,
                event: "tool-update",
                data: {
                  primary: `Last 20 lines of output from ${metadata.name}:`,
                  secondary: lastLines.split("\n"),
                },
              });

              // Attempt to parse as JSON if structured
              if (
                output &&
                (output.startsWith("{") || output.startsWith("["))
              ) {
                try {
                  resolve(JSON.parse(output));
                } catch {
                  resolve(output);
                }
              } else {
                resolve(output);
              }

              sendData?.({
                id: toolCallId,
                event: "tool-completion",
                data: `Dynamic tool ${metadata.name} completed`,
              });
            }
          });

          if (abortSignal) {
            abortSignal.addEventListener("abort", () => {
              child.kill();
            });
          }
        });
      },
    }),
  };
}

export async function loadDynamicTools({
  baseDir,
  sendData,
}: {
  baseDir: string;
  sendData?: SendData;
}) {
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

  const tools: Record<string, ReturnType<typeof createDynamicTool>> = {};
  for (const [_, { path, metadata }] of toolMap) {
    Object.assign(tools, createDynamicTool(path, metadata, sendData));
  }

  return tools;
}
