import fs from "node:fs/promises";
import path from "node:path";
import { formatFile, formatUrl } from "./formatting.ts";
import type { ModelMetadata } from "./models/providers.ts";
import { readUrl } from "./tools/index.ts";

interface CommandContext {
  model: ModelMetadata;
  baseDir: string;
  match: string;
  processedLines: string[];
}

async function processFileCommand(context: CommandContext) {
  const { baseDir, match, processedLines } = context;
  const filePath = match;

  const format = context.model.promptFormat;
  try {
    const fileContents = await fs.readFile(
      path.join(baseDir, filePath.trim()),
      "utf8",
    );
    processedLines.push(formatFile(filePath, fileContents, format));
  } catch (error) {
    if ((error as { code: string }).code === "ENOENT") {
      processedLines.push(
        `Error: File not found: ${filePath}\nPlease check that the file path is correct and the file exists.`,
      );
    } else {
      processedLines.push(
        `Error reading file ${filePath}: ${(error as Error).message}`,
      );
    }
  }
}

async function processUrlCommand(context: CommandContext) {
  const { match, processedLines } = context;
  const urlPath = match;
  try {
    const clean = await readUrl(urlPath);
    processedLines.push(
      formatUrl(urlPath, clean.trim(), context.model.promptFormat),
    );
  } catch (error) {
    processedLines.push(`Url:${urlPath}\nStatus: ${error}`);
  }
}

export async function processPrompt(
  message: string,
  { baseDir, model }: { baseDir: string; model: ModelMetadata },
) {
  const processedLines: string[] = [];
  const fileRegex = /@([^\s@]+(?:\.[\w\d]+))/g;
  const urlRegex = /@(https?:\/\/[^\s]+)/g;

  // Collect all matches for files and urls
  const fileMatches = Array.from(message.matchAll(fileRegex));
  const urlMatches = Array.from(message.matchAll(urlRegex));

  // Add original message first
  processedLines.push(message);
  processedLines.push("");

  // Process file references
  for (const match of fileMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir,
        match: firstMatch,
        processedLines,
      };
      await processFileCommand(context);
    }
  }

  // Process url references
  for (const match of urlMatches) {
    const firstMatch = match[1];
    if (firstMatch) {
      const context = {
        model,
        baseDir,
        match: firstMatch,
        processedLines,
      };
      await processUrlCommand(context);
    }
  }

  // Add original message again
  processedLines.push("");
  processedLines.push(message);

  return {
    prompt: processedLines.join("\n").trim(),
  };
}
