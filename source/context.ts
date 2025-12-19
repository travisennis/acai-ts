import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { logger } from "./logger.ts";

// Core context interfaces
export interface ContextFrontmatter {
  name?: string;
  description: string;
}

export interface Context {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string; // "user", "project"
}

const CONFIG_DIR_NAME = ".acai";

function stripQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

function parseFrontmatter(content: string): {
  frontmatter: ContextFrontmatter;
  body: string;
} {
  const frontmatter: ContextFrontmatter = { description: "" };

  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!normalizedContent.startsWith("---")) {
    return { frontmatter, body: normalizedContent };
  }

  const endIndex = normalizedContent.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter, body: normalizedContent };
  }

  const frontmatterBlock = normalizedContent.slice(4, endIndex);
  const body = normalizedContent.slice(endIndex + 4).trim();

  for (const line of frontmatterBlock.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = stripQuotes(match[2].trim());
      if (key === "name") {
        frontmatter.name = value;
      } else if (key === "description") {
        frontmatter.description = value;
      }
    }
  }

  return { frontmatter, body };
}

async function loadContextsFromDir(
  dir: string,
  source: string,
): Promise<Context[]> {
  const contexts: Context[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = join(dir, entry.name);

      // Skip symbolic links
      try {
        const stats = await stat(entryPath);
        if (stats.isSymbolicLink()) {
          continue;
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively load from subdirectories
        const subContexts = await loadContextsFromDir(entryPath, source);
        contexts.push(...subContexts);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        // Load context file
        try {
          const content = await readFile(entryPath, "utf8");
          const { frontmatter } = parseFrontmatter(content);

          if (!frontmatter.description) {
            continue;
          }

          const contextName = frontmatter.name || entry.name.replace(".md", "");
          contexts.push({
            name: contextName,
            description: frontmatter.description,
            filePath: entryPath,
            baseDir: dir,
            source,
          });
        } catch (error) {
          logger.warn(error, `Failed to load context from ${entryPath}:`);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(error, `Error reading context directory ${dir}:`);
    }
  }

  return contexts;
}

export async function loadContexts(): Promise<Context[]> {
  const contextMap = new Map<string, Context>();

  // Load user contexts
  const userContextDir = join(homedir(), CONFIG_DIR_NAME, "context");
  for (const context of await loadContextsFromDir(userContextDir, "user")) {
    contextMap.set(context.name, context);
  }

  // Load project contexts
  const projectContextDir = resolve(process.cwd(), CONFIG_DIR_NAME, "context");
  for (const context of await loadContextsFromDir(
    projectContextDir,
    "project",
  )) {
    contextMap.set(context.name, context);
  }

  return Array.from(contextMap.values());
}

export function formatContextsForPrompt(contexts: Context[]): string {
  if (contexts.length === 0) {
    return "";
  }

  const lines = [
    "\n\n<available_context>",
    "The following context files provide background information for specific subtasks.",
    "Use the readFile tool to load a context file when working on relevant tasks.",
    "Contexts may contain {baseDir} placeholders - replace them with the context's base directory path.",
    "",
  ];

  for (const context of contexts) {
    lines.push("<context>");
    lines.push("<name>");
    lines.push(context.name);
    lines.push("</name>");
    lines.push("<description>");
    lines.push(context.description);
    lines.push("</description>");
    lines.push("<location>");
    lines.push(context.filePath);
    lines.push("</location>");
    lines.push("</context>");
  }

  lines.push("</available_context>");

  return lines.join("\n");
}
