/**
 * Formatting utilities for various content types including files, URLs, code blocks, and memory usage.
 * Provides consistent formatting across different output formats (XML, Markdown, Bracket).
 *
 * @module formatting
 */

import path from "node:path";
import { getCodeblockFromFilePath } from "./utils/filetype-detection.ts";

const MD_TRIPLE_QUOTE = "```";

/**
 * Supported formatting types for content output.
 */
export type FormatType = "xml" | "markdown" | "bracket";

/**
 * Formats file content with metadata in the specified format.
 *
 * @param file - The file path or name
 * @param content - The file content to format
 * @param format - The output format type
 * @returns Formatted file content with metadata
 * @throws {Error} When an unsupported format is provided
 *
 * @example
 * ```typescript
 * formatFile("example.ts", "const x = 1;", "markdown")
 * // Returns: "## File: example.ts\n``` typescript\nconst x = 1;\n```"
 * ```
 */
export function formatFile(
  file: string,
  content: string,
  format: FormatType,
): string {
  const codeBlockName =
    getCodeblockFromFilePath(file) || path.extname(file).slice(1);
  switch (format) {
    case "xml":
      return `<file>\n<name>${file}</name>\n<content>\n${content}\n</content>\n</file>`;
    case "markdown":
      return `## File: ${file}\n${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[file name]: ${file}\n[file content begin]\n${content}\n[file content end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Formats URL content with metadata in the specified format.
 *
 * @param siteUrl - The URL to format
 * @param content - The URL content to format
 * @param format - The output format type
 * @returns Formatted URL content with metadata
 * @throws {Error} When an unsupported format is provided
 *
 * @example
 * ```typescript
 * formatUrl("https://example.com", "<html>...</html>", "xml")
 * // Returns: "<webpage>\n<url>https://example.com</url>\n<content>\n<html>...</html>\n</content>\n</webpage>"
 * ```
 */
export function formatUrl(
  siteUrl: string,
  content: string,
  format: FormatType,
): string {
  switch (format) {
    case "xml":
      return `<webpage>\n<url>${siteUrl}</url>\n<content>\n${content}\n</content>\n</webpage>`;
    case "markdown":
      return `## URL: ${siteUrl}\n${MD_TRIPLE_QUOTE}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[url]: ${siteUrl}\n[url content begin]\n${content}\n[url content end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Formats content as a code block with appropriate language identifier.
 *
 * @param file - The file path used to determine the code block language
 * @param content - The code content to format
 * @returns Formatted code block with language identifier
 *
 * @example
 * ```typescript
 * formatCodeBlock("example.js", "console.log('hello');")
 * // Returns: "``` javascript\nconsole.log('hello');\n```"
 * ```
 */
export function formatCodeBlock(file: string, content: string): string {
  const codeBlockName =
    getCodeblockFromFilePath(file) || path.extname(file).slice(1);
  return `${MD_TRIPLE_QUOTE} ${codeBlockName}\n${content}\n${MD_TRIPLE_QUOTE}`;
}

/**
 * Formats generic content blocks with a name in the specified format.
 *
 * @param content - The block content to format
 * @param blockName - The name/title of the block
 * @param format - The output format type
 * @returns Formatted block content with name
 * @throws {Error} When an unsupported format is provided
 *
 * @example
 * ```typescript
 * formatBlock("Some content", "Custom Block", "markdown")
 * // Returns: "## Custom Block\n```\nSome content\n```"
 * ```
 */
export function formatBlock(
  content: string,
  blockName: string,
  format: FormatType,
): string {
  switch (format) {
    case "xml":
      return `<${blockName}>\n${content}\n</${blockName}>\n</file>`;
    case "markdown":
      return `## ${blockName}\n${MD_TRIPLE_QUOTE}\n${content}\n${MD_TRIPLE_QUOTE}`;
    case "bracket":
      return `[${blockName} begin]\n${content}\n[${blockName} end]`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Capitalizes the first character of a string.
 *
 * @param str - The string to capitalize
 * @returns The string with first character capitalized
 *
 * @example
 * ```typescript
 * capitalize("hello") // Returns: "Hello"
 * ```
 */
export const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Formats memory usage in bytes into human-readable units (KB, MB, GB).
 *
 * @param bytes - Memory usage in bytes
 * @returns Formatted memory usage string
 *
 * @example
 * ```typescript
 * formatMemoryUsage(1024) // Returns: "1.0 KB"
 * formatMemoryUsage(1048576) // Returns: "1.0 MB"
 * formatMemoryUsage(1073741824) // Returns: "1.00 GB"
 * ```
 */
export const formatMemoryUsage = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${gb.toFixed(2)} GB`;
};

/**
 * Formats a duration in milliseconds into a concise, human-readable string.
 * Omits any time units that are zero.
 *
 * @param milliseconds - The duration in milliseconds
 * @returns A formatted string representing the duration
 *
 * @example
 * ```typescript
 * formatDuration(3661000) // Returns: "1h 1m 1s"
 * formatDuration(500) // Returns: "500ms"
 * formatDuration(1500) // Returns: "1.5s"
 * ```
 */
export const formatDuration = (milliseconds: number): string => {
  if (milliseconds <= 0) {
    return "0s";
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }

  const totalSeconds = milliseconds / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0) {
    parts.push(`${seconds}s`);
  }

  // If all parts are zero (e.g., exactly 1 hour), return the largest unit.
  if (parts.length === 0) {
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  return parts.join(" ");
};
