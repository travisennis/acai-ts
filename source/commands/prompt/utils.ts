import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConfigManager } from "../../config.ts";
import type { PromptMetadata } from "./types.ts";

export function replaceArgumentPlaceholders(
  content: string,
  args: string[],
): string {
  const allArguments = args.join(" ");

  let replacementsMade = false;
  let result = content;

  for (let i = 0; i < args.length; i++) {
    const placeholder = `$${i + 1}`;
    if (result.includes(placeholder)) {
      result = result.replaceAll(placeholder, args[i]);
      replacementsMade = true;
    }
  }

  if (result.includes("$ARGUMENTS")) {
    result = result.replaceAll("$ARGUMENTS", allArguments);
    replacementsMade = true;
  }

  if (result.includes("{{INPUT}}")) {
    result = result.replaceAll("{{INPUT}}", allArguments);
    replacementsMade = true;
  }

  if (!replacementsMade && allArguments.trim().length > 0) {
    result += `\n\n${allArguments}`;
  }

  return result;
}

export function parsePromptFile(content: string): {
  content: string;
  metadata: {
    description: string;
    enabled: boolean;
  };
} {
  const frontMatterMatch = content.match(
    /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/,
  );

  if (!frontMatterMatch) {
    return {
      content,
      metadata: {
        description:
          content.split("\n")[0].trim().slice(0, 50) +
          (content.split("\n")[0].trim().length > 50 ? "..." : ""),
        enabled: true,
      },
    };
  }

  const yamlContent = frontMatterMatch[1];
  const promptContent = frontMatterMatch[2] || "";

  const defaultDescription =
    promptContent.split("\n")[0].trim().slice(0, 50) +
    (promptContent.split("\n")[0].trim().length > 50 ? "..." : "");

  let description = defaultDescription;
  let enabled = true;

  const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);
  if (descriptionMatch) {
    description = descriptionMatch[1].trim();
  }

  const enabledMatch = yamlContent.match(/^enabled:\s*(true|false)$/im);
  if (enabledMatch) {
    enabled = enabledMatch[1].toLowerCase() === "true";
  }

  return {
    content: promptContent,
    metadata: {
      description,
      enabled,
    },
  };
}

export async function findPrompt(
  promptName: string,
  config: ConfigManager,
): Promise<PromptMetadata | null> {
  const projectPromptDir = config.project.getPath("prompts");
  const projectPath = path.join(projectPromptDir, `${promptName}.md`);

  if (config.project.existsSync("prompts")) {
    try {
      const content = await readFile(projectPath, "utf8");
      const parsed = parsePromptFile(content);

      if (!parsed.metadata.enabled) {
        return null;
      }

      return {
        name: promptName,
        description: parsed.metadata.description,
        enabled: parsed.metadata.enabled,
        path: projectPath,
        type: "project",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const userPromptDir = config.app.getPath("prompts");
  const userPath = path.join(userPromptDir, `${promptName}.md`);

  try {
    const content = await readFile(userPath, "utf8");
    const parsed = parsePromptFile(content);

    if (!parsed.metadata.enabled) {
      return null;
    }

    return {
      name: promptName,
      description: parsed.metadata.description,
      enabled: parsed.metadata.enabled,
      path: userPath,
      type: "user",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return null;
}
