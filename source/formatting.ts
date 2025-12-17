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

/**
 * Formats a number into a compact, human-readable string.
 * Uses K, M, B, T notation for large numbers while maintaining readability.
 *
 * @param num - The number to format
 * @returns A formatted string representing the number
 *
 * @example
 * ```typescript
 * formatNumber(1) // Returns: "1"
 * formatNumber(100) // Returns: "100"
 * formatNumber(1000) // Returns: "1K"
 * formatNumber(1100) // Returns: "1.1K"
 * formatNumber(1234567) // Returns: "1.2M"
 * formatNumber(1234567890) // Returns: "1.2B"
 * formatNumber(1234567890123) // Returns: "1.2T"
 * ```
 */
export const formatNumber = (num: number): string => {
  if (num < 1000) {
    return num.toString();
  }

  const units = ["", "K", "M", "B", "T"];

  // Calculate unit index based on number of digits
  const numDigits = Math.floor(Math.log10(num)) + 1;
  let unitIndex = Math.min(Math.floor((numDigits - 1) / 3), units.length - 1);
  let unit = units[unitIndex] || "";

  // Calculate scaled value
  let scaled = num / 1000 ** unitIndex;

  // Check if we need to move to the next unit (e.g., 999.999K -> 1M)
  if (Math.round(scaled) >= 1000 && unitIndex < units.length - 1) {
    unitIndex++;
    unit = units[unitIndex] || "";
    scaled = num / 1000 ** unitIndex;
  }

  // Determine decimal places based on the value
  if (scaled < 10) {
    // For values under 10, show one decimal place unless it's a whole number
    // Also handle the case where rounding would give a whole number
    const rounded = Math.round(scaled * 10) / 10;
    return rounded % 1 === 0
      ? `${Math.round(rounded)}${unit}`
      : `${rounded.toFixed(1)}${unit}`;
  }
  if (scaled < 100) {
    // For values between 10-100, show one decimal place unless it's a whole number
    const rounded = Math.round(scaled * 10) / 10;
    return rounded % 1 === 0
      ? `${Math.round(rounded)}${unit}`
      : `${rounded.toFixed(1)}${unit}`;
  }
  // For values 100+, round to nearest whole number
  return `${Math.round(scaled)}${unit}`;
};

/**
 * Formats a date into a human-readable string.
 *
 * @param date - The date to format
 * @returns A formatted date string in the format "MMM DD, YYYY HH:MM:SS AM/PM"
 *
 * @example
 * ```typescript
 * formatDate(new Date("2023-12-25T14:30:00")) // Returns: "Dec 25, 2023, 02:30:00 PM"
 * ```
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/**
 * Formats a number as a percentage with one decimal place.
 *
 * @param n - The numerator
 * @param d - The denominator
 * @returns A formatted percentage string (e.g., "12.5%")
 *
 * @example
 * ```typescript
 * formatPercentage(25, 100) // Returns: "25.0%"
 * formatPercentage(1, 3) // Returns: "33.3%"
 * formatPercentage(0, 0) // Returns: "0.0%"
 * ```
 */
export const formatPercentage = (n: number, d: number): string => {
  if (d <= 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
};
