import { getSegmenter } from "../terminal/segmenter.ts";
import stringWidth from "../terminal/string-width.ts";

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
 * Extract ANSI escape sequences from a string at the given position.
 */
function extractAnsiCode(
  str: string,
  pos: number,
): { code: string; length: number } | null {
  if (pos >= str.length || str[pos] !== "\x1b" || str[pos + 1] !== "[") {
    return null;
  }

  let j = pos + 2;
  while (j < str.length && str[j] && !/[mGKHJ]/.test(str[j])) {
    j++;
  }

  if (j < str.length) {
    return {
      code: str.substring(pos, j + 1),
      length: j + 1 - pos,
    };
  }

  return null;
}

/**
 * Truncate text to fit within a maximum visible width, preserving ANSI codes.
 * Adds ellipsis if truncation occurs.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  ellipsis = "...",
): string {
  const textVisibleWidth = visibleWidth(text);

  if (textVisibleWidth <= maxWidth) {
    return text;
  }

  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.substring(0, maxWidth);
  }

  // Separate ANSI codes from visible content using grapheme segmentation
  let i = 0;
  const segments: Array<{ type: "ansi" | "grapheme"; value: string }> = [];

  while (i < text.length) {
    const ansiResult = extractAnsiCode(text, i);
    if (ansiResult) {
      segments.push({ type: "ansi", value: ansiResult.code });
      i += ansiResult.length;
    } else {
      // Find the next ANSI code or end of string
      let end = i;
      while (end < text.length) {
        const nextAnsi = extractAnsiCode(text, end);
        if (nextAnsi) break;
        end++;
      }
      // Segment this non-ANSI portion into graphemes
      const textPortion = text.slice(i, end);
      for (const seg of getSegmenter().segment(textPortion)) {
        segments.push({ type: "grapheme", value: seg.segment });
      }
      i = end;
    }
  }

  // Build truncated string from segments
  let result = "";
  let currentWidth = 0;

  for (const seg of segments) {
    if (seg.type === "ansi") {
      result += seg.value;
      continue;
    }

    const grapheme = seg.value;
    const graphemeWidth = visibleWidth(grapheme);

    if (currentWidth + graphemeWidth > targetWidth) {
      break;
    }

    result += grapheme;
    currentWidth += graphemeWidth;
  }

  // Add reset code before ellipsis to prevent styling leaking into it
  return `${result}\x1b[0m${ellipsis}`;
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
