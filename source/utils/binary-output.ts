/**
 * Binary output handling for Bash tool
 *
 * Detects binary output from commands and saves it to temp files
 * with helpful metadata for the user.
 */

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Threshold for checking binary content (check first N bytes)
 */
const BINARY_CHECK_BYTES = 8192;

/**
 * Check if output appears to be binary data
 * Binary is detected by:
 * - Null bytes (most reliable indicator)
 * - High ratio of non-printable characters
 */
export function isBinaryOutput(output: string): boolean {
  if (output.length === 0) {
    return false;
  }

  // Check first N bytes for null bytes (strongest binary indicator)
  const checkLength = Math.min(output.length, BINARY_CHECK_BYTES);
  const sample = output.slice(0, checkLength);

  // Null byte is definitive binary indicator
  if (sample.includes("\0")) {
    return true;
  }

  // Count non-printable characters (excluding common whitespace)
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow printable ASCII (32-126), newlines (10), tabs (9), and carriage returns (13)
    // Also allow extended ASCII/UTF-8 (127+)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }

  // If more than 30% non-printable in the sample, treat as binary
  const ratio = nonPrintable / sample.length;
  return ratio > 0.3;
}

/**
 * Result of saving binary output
 */
export interface BinarySaveResult {
  success: boolean;
  path?: string;
  size?: number;
  mimeType?: string;
  error?: string;
}

/**
 * Save binary output to a temp file and detect its MIME type
 */
export function saveBinaryOutput(output: string): BinarySaveResult {
  try {
    // Generate unique filename
    const id = randomBytes(8).toString("hex");
    const filePath = `/tmp/acai/bash_binary_${id}`;

    // Ensure directory exists
    mkdirSync(dirname(filePath), { recursive: true });

    // Convert string back to buffer for accurate binary writing
    // Note: Some data loss may have occurred during UTF-8 decoding
    const buffer = Buffer.from(output, "utf8");
    writeFileSync(filePath, buffer);

    const size = buffer.length;

    // Detect MIME type using `file` command
    let mimeType = "application/octet-stream";
    try {
      const fileOutput = execSync(`file --mime-type -b "${filePath}"`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      if (fileOutput && fileOutput !== "cannot open") {
        mimeType = fileOutput;
      }
    } catch {
      // `file` command not available or failed, use default
    }

    return {
      success: true,
      path: filePath,
      size,
      mimeType,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Format a user-friendly message for binary output
 */
export function formatBinaryMessage(result: BinarySaveResult): string {
  if (!result.success) {
    return `⚠️ Binary output detected but could not be saved: ${result.error ?? "Unknown error"}`;
  }

  const sizeStr = formatBytes(result.size ?? 0);
  const lines: string[] = [
    "📦 Binary output detected",
    "",
    `**Size:** ${sizeStr}`,
    `**Type:** ${result.mimeType}`,
    `**Saved to:** \`${result.path}\``,
    "",
    "**To inspect this file, you can use:**",
    "  • `file <path>` - Detect file type",
    "  • `xxd <path>` - Hex dump",
    "  • `hexdump -C <path>` - Hex dump with ASCII",
    "  • `head -c 100 <path> | xxd` - Preview first 100 bytes",
  ];

  return lines.join("\n");
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 bytes";

  const units = ["bytes", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** unitIndex;

  // Show decimal for KB and up, whole number for bytes
  if (unitIndex === 0) {
    return `${bytes} bytes`;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
