import fs from "node:fs/promises";
import path from "node:path";
import { isString } from "@travisennis/stdlib/typeguards";
import { formatFile, formatUrl } from "./formatting.ts";
import type { ModelMetadata } from "./models/providers.ts";
import type { ContextItem } from "./prompts/manager.ts";
import { type ReadUrlResult, readUrl } from "./tools/url.ts";

interface CommandContext {
  model: ModelMetadata;
  baseDir: string;
  match: string;
}

// Returns the formatted string or an error message string
async function processFileCommand(context: CommandContext): Promise<string> {
  const { baseDir, match } = context;
  const filePath = match.trim();
  const format = context.model.promptFormat;

  try {
    // Resolve paths to absolute to prevent traversal issues
    const resolvedBaseDir = path.resolve(baseDir);
    const resolvedFilePath = path.resolve(resolvedBaseDir, filePath);

    // Security Check: Ensure the resolved path is still within the base directory
    if (!resolvedFilePath.startsWith(resolvedBaseDir + path.sep)) {
      return `Error: Access denied. Attempted to read file outside the allowed directory: ${filePath}`;
    }

    const fileContents = await fs.readFile(resolvedFilePath, "utf8");
    return formatFile(filePath, fileContents, format);
  } catch (error) {
    // Improved type checking for errors
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return `Error: File not found: ${filePath}\nPlease check that the file path is correct and the file exists.`;
    }
    if (error instanceof Error) {
      return `Error reading file ${filePath}: ${error.message}`;
    }
    // Fallback for unknown error types
    return `Error reading file ${filePath}: An unknown error occurred.`;
  }
}

// Returns the formatted string or an error message string
async function processUrlCommand(
  context: CommandContext,
): Promise<ReadUrlResult & { source: string }> {
  const { match } = context;
  const urlPath = match;
  try {
    return Object.assign(await readUrl(urlPath), { source: urlPath });
  } catch (error) {
    if (error instanceof Error) {
      return {
        contentType: "text/plain",
        data: `Url: ${urlPath} Status: Error fetching URL: ${error.message}`,
        source: urlPath,
      };
    }
    // Fallback for unknown error types
    return {
      contentType: "text/plain",
      data: `Url: ${urlPath} Status: Error fetching URL: An unknown error occurred.`,
      source: urlPath,
    };
  }
}

export async function processPrompt(
  message: string,
  { baseDir, model }: { baseDir: string; model: ModelMetadata },
): Promise<{ message: string; context: ContextItem[] }> {
  const fileRegex = /@([^\s@]+(?:\.[\w\d]+))/g;
  const urlRegex = /@(https?:\/\/[^\s]+)/g;

  // Collect all matches for files and urls
  const fileMatches = Array.from(message.matchAll(fileRegex));
  const urlMatches = Array.from(message.matchAll(urlRegex));

  const mentionProcessingPromises: Promise<
    string | (ReadUrlResult & { source: string })
  >[] = [];

  // Process file references - collect promises
  for (const match of fileMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir,
        match: firstMatch,
      };
      mentionProcessingPromises.push(processFileCommand(context));
    }
  }

  // Process url references - collect promises
  for (const match of urlMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir, // baseDir is not used by processUrlCommand but kept for consistency
        match: firstMatch,
      };
      mentionProcessingPromises.push(processUrlCommand(context));
    }
  }

  // Wait for all mentions to be processed
  const mentionResults = await Promise.all(mentionProcessingPromises);

  const context: ContextItem[] = [];

  for (const mention of mentionResults) {
    if (isString(mention)) {
      context.push(mention);
    } else if (mention.data.startsWith("data")) {
      context.push({
        type: "image",
        mimeType: mention.contentType,
        image: mention.data,
      });
    } else {
      context.push(
        formatUrl(mention.source, mention.data.trim(), model.promptFormat),
      );
    }
  }

  return {
    message,
    context,
  };
}
