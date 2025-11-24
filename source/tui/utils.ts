import stringWidth from "string-width";

/**
 * Calculate the visible width of a string in terminal columns.
 * This correctly handles:
 * - ANSI escape codes (ignored)
 * - Emojis and wide characters (counted as 2 columns)
 * - Combining characters (counted correctly)
 * - Tabs (replaced with 3 spaces for consistent width)
 */
export function visibleWidth(str: string): number {
  // Replace tabs with 3 spaces before measuring
  const normalized = str.replace(/\t/g, "   ");
  return stringWidth(normalized);
}

/**
 * Apply background color to a line, padding to full width.
 *
 * @param line - Line of text (may contain ANSI codes)
 * @param width - Total width to pad to
 * @param bgFn - Background color function
 * @returns Line with background applied and padded to width
 */
export function applyBackgroundToLine(
  line: string,
  width: number,
  bgFn: (text: string) => string,
): string {
  // Calculate padding needed
  const visibleLen = visibleWidth(line);
  const paddingNeeded = Math.max(0, width - visibleLen);
  const padding = " ".repeat(paddingNeeded);

  // Apply background to content + padding
  const withPadding = line + padding;
  return bgFn(withPadding);
}
