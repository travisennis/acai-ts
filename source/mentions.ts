import fs from "node:fs/promises";
import path from "node:path";
import { formatFile, formatUrl } from "./formatting.ts";
import type { ModelMetadata } from "./models/providers.ts";
import { readUrl } from "./tools/index.ts";

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
async function processUrlCommand(context: CommandContext): Promise<string> {
  const { match } = context;
  const urlPath = match;
  try {
    const clean = await readUrl(urlPath);
    return formatUrl(urlPath, clean.trim(), context.model.promptFormat);
  } catch (error) {
    if (error instanceof Error) {
      return `Url: ${urlPath}\nStatus: Error fetching URL: ${error.message}`;
    }
    // Fallback for unknown error types
    return `Url: ${urlPath}\nStatus: Error fetching URL: An unknown error occurred.`;
  }
}

export async function processPrompt(
  message: string,
  { baseDir, model }: { baseDir: string; model: ModelMetadata },
): Promise<{ prompt: string }> {
  const fileRegex = /@([^\s@]+(?:\.[\w\d]+))/g;
  const urlRegex = /@(https?:\/\/[^\s]+)/g;

  // Collect all matches for files and urls
  const fileMatches = Array.from(message.matchAll(fileRegex));
  const urlMatches = Array.from(message.matchAll(urlRegex));

  const mentionProcessingPromises: Promise<string>[] = [];

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

  // Construct the final prompt
  const finalPromptParts = [message, "", ...mentionResults, "", message];

  return {
    prompt: finalPromptParts.join("\n").trim(),
  };
}
