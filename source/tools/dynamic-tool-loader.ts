import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { config } from "../config/index.ts";
import { logger } from "../utils/logger.ts";
import type { SessionContext, ToolExecutionOptions } from "./types.ts";

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

type ToolMetadata = z.infer<typeof toolMetadataSchema>;

type ToolMetadataWithFormat = ToolMetadata & {
  format: "json" | "text";
};

interface InterpreterResult {
  command: string;
  args: string[];
}

const KNOWN_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".rb",
  ".tool",
] as const;

const EXTENSION_INTERPRETER_MAP: Record<string, string> = {
  ".js": process.execPath,
  ".mjs": process.execPath,
  ".cjs": process.execPath,
  ".sh": "/bin/bash",
  ".bash": "/bin/bash",
  ".zsh": "/bin/zsh",
  ".py": "python3",
  ".rb": "ruby",
};

export function getShebang(scriptPath: string): string | null {
  try {
    const fd = fs.openSync(scriptPath, "r");
    const buffer = Buffer.alloc(256);
    const bytesRead = fs.readSync(fd, buffer, 0, 256, 0);
    fs.closeSync(fd);
    const content = buffer.toString("utf8", 0, bytesRead);
    if (content.startsWith("#!")) {
      return content.slice(2).trim().split("\n")[0].trim();
    }
  } catch {
    // Can't read file, skip
  }
  return null;
}

export function parseShebang(
  shebang: string,
  scriptPath: string,
): InterpreterResult {
  if (shebang.startsWith("/usr/bin/env ")) {
    const interpreter = shebang
      .slice("/usr/bin/env ".length)
      .trim()
      .split(" ")[0];
    return { command: interpreter, args: [scriptPath] };
  }
  const parts = shebang.split(" ");
  return { command: parts[0], args: [...parts.slice(1), scriptPath] };
}

export function resolveToolInterpreter(
  scriptPath: string,
): InterpreterResult | null {
  // 1. Check shebang
  const shebang = getShebang(scriptPath);
  if (shebang) {
    return parseShebang(shebang, scriptPath);
  }

  // 2. Check extension
  const ext = path.extname(scriptPath).toLowerCase();
  if (EXTENSION_INTERPRETER_MAP[ext]) {
    return { command: EXTENSION_INTERPRETER_MAP[ext], args: [scriptPath] };
  }

  // 3. Extensionless executable
  if (!ext) {
    try {
      const stats = fs.statSync(scriptPath);
      if (stats.mode & 0o111) {
        return { command: scriptPath, args: [] };
      }
    } catch {
      // File doesn't exist or can't stat, skip
    }
  }

  return null;
}

export function parseTextSchema(content: string): ToolMetadata | null {
  const lines = content
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

  let name: string | undefined;
  let description: string | undefined;
  const parameters: ToolMetadata["parameters"] = [];

  for (const line of lines) {
    if (line.startsWith("name:")) {
      name = line.slice(5).trim();
      continue;
    }

    if (line.startsWith("description:")) {
      description = line.slice(12).trim();
      continue;
    }

    // Parse parameters: "paramName: type [optional|required] description text"
    const paramMatch = line.match(
      /^(\w+):\s*(string|number|boolean)\s+(optional|required)?\s*(.*)$/,
    );
    if (paramMatch) {
      const [, paramName, paramType, requirement, paramDescription] =
        paramMatch;
      parameters.push({
        name: paramName,
        type: paramType as "string" | "number" | "boolean",
        description: paramDescription || `Parameter ${paramName}`,
        required: requirement !== "optional",
      });
      continue;
    }

    // Handle params without type keyword (default to string)
    const simpleMatch = line.match(/^(\w+):\s*(.*)$/);
    if (
      simpleMatch &&
      !line.startsWith("name:") &&
      !line.startsWith("description:")
    ) {
      const [, paramName, rest] = simpleMatch;
      const typeMatch = rest.match(/^(string|number|boolean)\s*(.*)$/);
      if (typeMatch) {
        const [, paramType, afterType] = typeMatch;
        const optMatch = afterType.match(/^(optional|required)\s*(.*)$/);
        parameters.push({
          name: paramName,
          type: paramType as "string" | "number" | "boolean",
          description: optMatch
            ? optMatch[2] || `Parameter ${paramName}`
            : afterType || `Parameter ${paramName}`,
          required: !optMatch || optMatch[1] !== "optional",
        });
      } else {
        const optMatch = rest.match(/^(optional|required)\s*(.*)$/);
        parameters.push({
          name: paramName,
          type: "string",
          description: optMatch
            ? optMatch[2] || rest
            : rest || `Parameter ${paramName}`,
          required: !optMatch || optMatch[1] !== "optional",
        });
      }
    }
  }

  if (!name || !description) {
    logger.warn("Text schema missing required name or description");
    return null;
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
    logger.warn(`Invalid tool name: ${name}`);
    return null;
  }

  return {
    name,
    description,
    parameters,
    needsApproval: true,
  };
}

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
  const fields: Record<string, z.ZodType> = {};
  for (const param of parameters) {
    let schema: z.ZodType;
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

async function getMetadata(
  scriptPath: string,
  sessionContext?: SessionContext,
): Promise<ToolMetadataWithFormat | null> {
  const interpreter = resolveToolInterpreter(scriptPath);
  if (!interpreter) {
    logger.warn(`No valid interpreter for ${scriptPath}, skipping.`);
    return null;
  }

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      const env: Record<string, string | undefined> = {
        ...process.env,
        // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
        TOOL_ACTION: "describe",
        // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
        NODE_ENV: "production",
      };

      if (sessionContext) {
        env["ACAI_SESSION_ID"] = sessionContext.sessionId;
        env["ACAI_PROJECT_DIR"] = sessionContext.projectDir;
        env["ACAI_AGENT_NAME"] = sessionContext.agentName;
      }

      child = spawn(interpreter.command, interpreter.args, {
        env,
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
        resolve({ ...metadata, format: "json" });
      } catch {
        // JSON parse failed, try text format
        const textMetadata = parseTextSchema(stdout);
        if (textMetadata) {
          resolve({ ...textMetadata, format: "text" });
        } else {
          logger.error(
            `Failed to parse metadata from ${scriptPath}: not valid JSON or text format`,
          );
          resolve(null);
        }
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
  sessionContext?: SessionContext,
  format: "json" | "text" = "json",
): Promise<string> {
  const interpreter = resolveToolInterpreter(scriptPath);
  if (!interpreter) {
    throw new Error(`No valid interpreter for ${scriptPath}`);
  }

  let paramsInput: string;
  if (format === "text") {
    paramsInput = `${Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`;
  } else {
    const paramsArray = Object.entries(params).map(([name, value]) => ({
      name,
      value,
    }));
    paramsInput = `${JSON.stringify(paramsArray)}\n`;
  }

  const env: Record<string, string | undefined> = {
    ...process.env,
    // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
    TOOL_ACTION: "execute",
    // biome-ignore lint/style/useNamingConvention: Environment variables are conventionally uppercase
    NODE_ENV: "production",
  };

  if (sessionContext) {
    env["ACAI_SESSION_ID"] = sessionContext.sessionId;
    env["ACAI_PROJECT_DIR"] = sessionContext.projectDir;
    env["ACAI_AGENT_NAME"] = sessionContext.agentName;
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(interpreter.command, interpreter.args, {
      cwd: path.dirname(scriptPath),
      env,
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

    child.stdin.write(paramsInput);
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
    options: ToolExecutionOptions,
  ) => Promise<string>;
}

function createDynamicTool(
  scriptPath: string,
  metadata: ToolMetadataWithFormat,
  sessionContext?: SessionContext,
): { [x: string]: DynamicToolObject } {
  const inputSchema = generateZodSchema(metadata.parameters);
  const toolName = metadata.name;
  const format = metadata.format;

  return {
    [toolName]: {
      toolDef: {
        description: metadata.description,
        inputSchema,
      },
      display() {
        return "running";
      },
      async execute(
        input: Record<string, unknown>,
        { abortSignal, sessionContext: executionContext }: ToolExecutionOptions,
      ): Promise<string> {
        if (abortSignal?.aborted) {
          throw new Error("Execution aborted");
        }

        try {
          inputSchema.parse(input);
        } catch (e) {
          throw new Error(
            `Invalid parameters for tool ${metadata.name}: ${(e as Error).message}`,
          );
        }

        // Prefer execution-time context over load-time context
        const context = executionContext ?? sessionContext;
        return spawnChildProcess(
          scriptPath,
          input,
          abortSignal,
          context,
          format,
        );
      },
    } as unknown as DynamicToolObject,
  };
}

function findCompanion(dir: string, baseName: string): string | null {
  const companionExtensions = [
    ".sh",
    ".bash",
    ".zsh",
    ".py",
    ".rb",
    ".js",
    ".mjs",
    ".cjs",
    "",
  ];
  for (const ext of companionExtensions) {
    const candidate = path.join(dir, baseName + ext);
    if (fs.existsSync(candidate)) {
      const interpreter = resolveToolInterpreter(candidate);
      if (interpreter) return candidate;
    }
  }
  return null;
}

export async function loadDynamicTools({
  baseDir,
  existingToolNames = [],
  sessionContext,
}: {
  baseDir: string;
  existingToolNames?: string[];
  sessionContext?: SessionContext;
}) {
  const projectConfig = await config.getConfig();
  const dynamicConfig = projectConfig.tools.dynamicTools;

  if (!dynamicConfig.enabled) {
    logger.info("Dynamic tools disabled in config.");
    return {};
  }

  const projectToolsDir = path.join(baseDir, ".acai", "tools");
  const userToolsDir = path.join(os.homedir(), ".acai", "tools");

  const toolMap = new Map<
    string,
    { path: string; metadata: ToolMetadataWithFormat }
  >();

  const scanDir = async (dir: string, isProject = false) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir).filter((f) => {
        // Known extensions
        if (KNOWN_EXTENSIONS.some((ext) => f.endsWith(ext))) {
          return true;
        }

        // Extensionless files that are executable
        if (!path.extname(f)) {
          const fullPath = path.join(dir, f);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.mode & 0o111) return true;
          } catch {
            // Can't stat, skip
          }
        }

        return false;
      });

      for (const file of files) {
        // Skip .tool files, they are handled separately
        if (file.endsWith(".tool")) continue;

        const scriptPath = path.join(dir, file);
        try {
          const metadata = await getMetadata(scriptPath, sessionContext);
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

      // Scan for .tool files (text schema with companion executable)
      const allDirFiles = fs.readdirSync(dir);
      const allToolFiles = allDirFiles.filter((f) => f.endsWith(".tool"));

      for (const toolFile of allToolFiles) {
        const toolPath = path.join(dir, toolFile);
        try {
          const content = fs.readFileSync(toolPath, "utf8");
          const metadata = parseTextSchema(content);
          if (!metadata) {
            logger.warn(`Failed to parse .tool file: ${toolFile}`);
            continue;
          }

          const baseName = toolFile.slice(0, -5); // Remove .tool extension
          const companionPath = findCompanion(dir, baseName);
          if (!companionPath) {
            logger.warn(`No companion executable found for ${toolFile}`);
            continue;
          }

          const metadataWithFormat: ToolMetadataWithFormat = {
            ...metadata,
            format: "text",
          };
          toolMap.set(metadata.name, {
            path: companionPath,
            metadata: metadataWithFormat,
          });
          logger.info(
            `Loaded ${isProject ? "project" : "user"} tool: ${metadata.name} (from .tool file)`,
          );
        } catch (e) {
          logger.error(`Error reading .tool file ${toolFile}: ${e}`);
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
  const conflictingTools: string[] = [];

  for (const [_, { path, metadata }] of toolMap) {
    const toolName = metadata.name;

    // Check for conflicts with existing tools
    if (existingToolNames.includes(toolName)) {
      conflictingTools.push(toolName);
      logger.warn(
        `Dynamic tool '${toolName}' conflicts with existing tool. Skipping.`,
      );
      continue;
    }

    // Check for duplicate dynamic tool names
    if (tools[toolName]) {
      logger.warn(
        `Duplicate dynamic tool name '${toolName}' found. Skipping duplicate.`,
      );
      continue;
    }

    Object.assign(tools, createDynamicTool(path, metadata, sessionContext));
  }

  if (conflictingTools.length > 0) {
    logger.warn(
      `Warning: ${conflictingTools.length} dynamic tool(s) skipped due to name conflicts: ${conflictingTools.join(", ")}`,
    );
  }

  return tools;
}
