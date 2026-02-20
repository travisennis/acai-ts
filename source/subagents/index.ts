import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { logger } from "../utils/logger.ts";
import { parseFrontMatter } from "../utils/yaml.ts";

// Core subagent interfaces
interface SubagentFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
  timeout?: number;
}

export interface Subagent {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  timeout: number;
  systemPrompt: string;
  filePath: string;
  source: string; // "user" or "project"
}

const CONFIG_DIR_NAME = ".acai";
const DEFAULT_TIMEOUT = 900;

// Validation functions
function validateSubagentName(
  name: string,
  fileName: string,
): { valid: boolean; error?: string } {
  // Check required field
  if (!name) {
    return { valid: false, error: "Name field is required" };
  }

  // Check length (1-64 characters)
  if (name.length < 1 || name.length > 64) {
    return { valid: false, error: "Name must be 1-64 characters long" };
  }

  // Check allowed characters (lowercase letters, numbers, hyphens)
  if (!/^[a-z0-9-]+$/.test(name)) {
    return {
      valid: false,
      error: "Name can only contain lowercase letters, numbers, and hyphens",
    };
  }

  // Check no leading or trailing hyphens
  if (name.startsWith("-") || name.endsWith("-")) {
    return { valid: false, error: "Name cannot start or end with a hyphen" };
  }

  // Check no consecutive hyphens
  if (name.includes("--")) {
    return { valid: false, error: "Name cannot contain consecutive hyphens" };
  }

  // Check matches filename (without .md)
  const expectedName = fileName.replace(/\.md$/, "");
  if (name !== expectedName) {
    return {
      valid: false,
      error: `Name "${name}" must match filename "${fileName}" (without .md)`,
    };
  }

  return { valid: true };
}

function validateSubagentDescription(description: string): {
  valid: boolean;
  error?: string;
} {
  // Check required field
  if (!description) {
    return { valid: false, error: "Description field is required" };
  }

  // Check length (1-1024 characters)
  if (description.length < 1 || description.length > 1024) {
    return {
      valid: false,
      error: "Description must be 1-1024 characters long",
    };
  }

  return { valid: true };
}

function validateSubagentTimeout(timeout?: number): {
  valid: boolean;
  error?: string;
} {
  if (timeout === undefined) {
    return { valid: true };
  }

  if (typeof timeout !== "number" || timeout < 1 || timeout > 3600) {
    return {
      valid: false,
      error: "Timeout must be a number between 1 and 3600 seconds",
    };
  }

  return { valid: true };
}

function parseFrontmatter(content: string): {
  frontmatter: SubagentFrontmatter;
  body: string;
} {
  const { data, content: body } = parseFrontMatter(content);

  // Type cast and validate required fields
  const name = data["name"] as string;
  const description = data["description"] as string;

  // Set default empty values for optional fields
  const frontmatter: SubagentFrontmatter = {
    name: name || "",
    description: description || "",
    model: (data["model"] as string) || undefined,
    tools: (data["tools"] as string) || undefined,
    timeout: (data["timeout"] as number) || undefined,
  };

  return { frontmatter, body };
}

async function loadSubagentsFromDir(
  dir: string,
  source: string,
): Promise<Subagent[]> {
  const subagents: Subagent[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith(".")) {
        continue;
      }

      // Only process .md files
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const entryPath = join(dir, entry.name);

      // Skip symbolic links to avoid infinite recursion
      try {
        const stats = await stat(entryPath);
        if (stats.isSymbolicLink()) {
          continue;
        }
      } catch {
        // If we can't stat, skip it
        continue;
      }

      try {
        const content = await readFile(entryPath, "utf8");
        const { frontmatter, body } = parseFrontmatter(content);

        // Validate required fields
        const nameValidation = validateSubagentName(
          frontmatter.name,
          entry.name,
        );
        if (!nameValidation.valid) {
          logger.warn(
            `Invalid subagent name in ${entryPath}: ${nameValidation.error}`,
          );
          continue;
        }

        const descriptionValidation = validateSubagentDescription(
          frontmatter.description,
        );
        if (!descriptionValidation.valid) {
          logger.warn(
            `Invalid subagent description in ${entryPath}: ${descriptionValidation.error}`,
          );
          continue;
        }

        const timeoutValidation = validateSubagentTimeout(frontmatter.timeout);
        if (!timeoutValidation.valid) {
          logger.warn(
            `Invalid subagent timeout in ${entryPath}: ${timeoutValidation.error}`,
          );
          continue;
        }

        // Parse tools if provided
        let tools: string[] | undefined;
        if (frontmatter.tools) {
          tools = frontmatter.tools
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        }

        subagents.push({
          name: frontmatter.name,
          description: frontmatter.description,
          model: frontmatter.model,
          tools,
          timeout: frontmatter.timeout ?? DEFAULT_TIMEOUT,
          systemPrompt: body,
          filePath: entryPath,
          source,
        });
      } catch (error) {
        logger.warn(error, `Failed to load subagent from ${entryPath}:`);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(error, `Error reading subagents directory ${dir}:`);
    }
  }

  return subagents;
}

export async function loadSubagents(): Promise<Subagent[]> {
  const subagentMap = new Map<string, Subagent>();

  // Load from user directory (~/.acai/subagents)
  const userDir = join(homedir(), CONFIG_DIR_NAME, "subagents");
  for (const subagent of await loadSubagentsFromDir(userDir, "user")) {
    subagentMap.set(subagent.name, subagent);
  }

  // Load from project directory (.acai/subagents) - overrides user
  const projectDir = resolve(process.cwd(), CONFIG_DIR_NAME, "subagents");
  for (const subagent of await loadSubagentsFromDir(projectDir, "project")) {
    subagentMap.set(subagent.name, subagent);
  }

  return Array.from(subagentMap.values());
}

export async function getSubagent(name: string): Promise<Subagent | undefined> {
  const subagents = await loadSubagents();
  return subagents.find((s) => s.name === name);
}

export function formatSubagentsForDescription(subagents: Subagent[]): string {
  if (subagents.length === 0) {
    return "  No subagents available";
  }

  const lines = subagents.map((subagent) => {
    const toolsStr = subagent.tools
      ? ` (tools: ${subagent.tools.join(", ")})`
      : "";
    return `  - ${subagent.name}: ${subagent.description}${toolsStr}`;
  });

  return lines.join("\n");
}

export function formatSubagentsForPrompt(subagents: Subagent[]): string {
  if (subagents.length === 0) {
    return "";
  }

  const lines = [
    "## Subagents (Agent Tool)",
    "",
    "Use the Agent tool to delegate complex, multi-step tasks to specialized subagents. Subagents operate autonomously and return a single result.",
    "",
    "**When to use subagents:**",
    "- Deep codebase research or architecture exploration",
    "- Complex multi-file refactoring or implementation tasks",
    "- Writing comprehensive tests across multiple files",
    "- Creating detailed implementation plans",
    "- Tasks requiring investigation across many files",
    "",
    "<available_subagents>",
  ];

  for (const subagent of subagents) {
    lines.push("<subagent>");
    lines.push("<name>");
    lines.push(subagent.name);
    lines.push("</name>");
    lines.push("<description>");
    lines.push(subagent.description);
    lines.push("</description>");
    if (subagent.tools && subagent.tools.length > 0) {
      lines.push("<tools>");
      lines.push(subagent.tools.join(", "));
      lines.push("</tools>");
    }
    lines.push("</subagent>");
  }

  lines.push("</available_subagents>");
  lines.push("");
  lines.push("**Usage notes:**");
  lines.push("- Subagents are stateless - provide all context in your prompt");
  lines.push("- Be specific about what information you need returned");
  lines.push("- Use longer timeouts for complex tasks (1800-3600 seconds)");
  lines.push("- Launch multiple subagents concurrently for independent tasks");

  return lines.join("\n");
}
