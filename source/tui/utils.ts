import { getSegmenter } from "../terminal/segmenter.ts";
import stringWidth from "../terminal/string-width.ts";

/**
 * Check if a string contains only printable ASCII characters (0x20-0x7e).
 */
function isPrintableAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
}

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
 * Get the width of a single grapheme cluster.
 */
function graphemeWidth(grapheme: string): number {
  return stringWidth(grapheme);
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
interface TruncationState {
  result: string;
  pendingAnsi: string;
  visibleSoFar: number;
  keptWidth: number;
  keepContiguousPrefix: boolean;
  overflowed: boolean;
}

function createInitialState(): TruncationState {
  return {
    result: "",
    pendingAnsi: "",
    visibleSoFar: 0,
    keptWidth: 0,
    keepContiguousPrefix: true,
    overflowed: false,
  };
}

function processAnsiCode(
  state: TruncationState,
  text: string,
  pos: number,
): number {
  const ansi = extractAnsiCode(text, pos);
  if (ansi) {
    state.pendingAnsi += ansi.code;
    return ansi.length;
  }
  return 0;
}

function processTab(
  state: TruncationState,
  targetWidth: number,
  maxWidth: number,
): boolean {
  if (state.keepContiguousPrefix && state.keptWidth + 3 <= targetWidth) {
    if (state.pendingAnsi) {
      state.result += state.pendingAnsi;
      state.pendingAnsi = "";
    }
    state.result += "\t";
    state.keptWidth += 3;
  } else {
    state.keepContiguousPrefix = false;
    state.pendingAnsi = "";
  }
  state.visibleSoFar += 3;
  if (state.visibleSoFar > maxWidth) {
    state.overflowed = true;
    return true;
  }
  return false;
}

function processGraphemeSegment(
  state: TruncationState,
  segment: string,
  targetWidth: number,
  maxWidth: number,
): boolean {
  const width = graphemeWidth(segment);
  if (state.keepContiguousPrefix && state.keptWidth + width <= targetWidth) {
    if (state.pendingAnsi) {
      state.result += state.pendingAnsi;
      state.pendingAnsi = "";
    }
    state.result += segment;
    state.keptWidth += width;
  } else {
    state.keepContiguousPrefix = false;
    state.pendingAnsi = "";
  }

  state.visibleSoFar += width;
  if (state.visibleSoFar > maxWidth) {
    state.overflowed = true;
    return true;
  }
  return false;
}

function truncateSimple(
  text: string,
  targetWidth: number,
  maxWidth: number,
): {
  result: string;
  keptWidth: number;
  overflowed: boolean;
  visibleSoFar: number;
} {
  const state = createInitialState();

  for (const { segment } of getSegmenter().segment(text)) {
    if (processGraphemeSegment(state, segment, targetWidth, maxWidth)) {
      break;
    }
  }

  return {
    result: state.result,
    keptWidth: state.keptWidth,
    overflowed: state.overflowed,
    visibleSoFar: state.visibleSoFar,
  };
}

function truncateComplex(
  text: string,
  targetWidth: number,
  maxWidth: number,
): {
  result: string;
  keptWidth: number;
  overflowed: boolean;
  exhaustedInput: boolean;
  visibleSoFar: number;
} {
  const state = createInitialState();
  let i = 0;

  while (i < text.length && !state.overflowed) {
    const ansiSkip = processAnsiCode(state, text, i);
    if (ansiSkip > 0) {
      i += ansiSkip;
      continue;
    }

    if (text[i] === "\t") {
      if (processTab(state, targetWidth, maxWidth)) {
        break;
      }
      i++;
      continue;
    }

    // Find end of current text segment (until tab or ANSI)
    let end = i;
    while (end < text.length && text[end] !== "\t") {
      const nextAnsi = extractAnsiCode(text, end);
      if (nextAnsi) {
        break;
      }
      end++;
    }

    // Process graphemes in this segment
    for (const { segment } of getSegmenter().segment(text.slice(i, end))) {
      if (processGraphemeSegment(state, segment, targetWidth, maxWidth)) {
        break;
      }
    }

    i = end;
  }

  return {
    result: state.result,
    keptWidth: state.keptWidth,
    overflowed: state.overflowed,
    exhaustedInput: i >= text.length,
    visibleSoFar: state.visibleSoFar,
  };
}

function handleOversizedEllipsis(
  text: string,
  maxWidth: number,
  ellipsis: string,
  pad: boolean,
): string | null {
  const textWidth = visibleWidth(text);
  if (textWidth <= maxWidth) {
    return pad ? text + " ".repeat(maxWidth - textWidth) : text;
  }

  const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth);
  if (clippedEllipsis.width === 0) {
    return pad ? " ".repeat(maxWidth) : "";
  }
  return finalizeTruncatedResult(
    "",
    0,
    clippedEllipsis.text,
    clippedEllipsis.width,
    maxWidth,
    pad,
  );
}

export function truncateToWidth(
  text: string,
  maxWidth: number,
  ellipsis = "...",
  pad = false,
): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (text.length === 0) {
    return pad ? " ".repeat(maxWidth) : "";
  }

  const ellipsisWidth = visibleWidth(ellipsis);

  // Handle case where ellipsis is wider than maxWidth
  if (ellipsisWidth >= maxWidth) {
    const result = handleOversizedEllipsis(text, maxWidth, ellipsis, pad);
    if (result !== null) {
      return result;
    }
  }

  // Fast path: pure ASCII printable
  if (isPrintableAscii(text)) {
    if (text.length <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - text.length) : text;
    }
    const targetWidth = maxWidth - ellipsisWidth;
    return finalizeTruncatedResult(
      text.slice(0, targetWidth),
      targetWidth,
      ellipsis,
      ellipsisWidth,
      maxWidth,
      pad,
    );
  }

  const targetWidth = maxWidth - ellipsisWidth;
  const hasAnsi = text.includes("\x1b");
  const hasTabs = text.includes("\t");

  let truncatedResult: {
    result: string;
    keptWidth: number;
    overflowed: boolean;
    visibleSoFar: number;
  };
  let exhaustedInput: boolean;

  if (!hasAnsi && !hasTabs) {
    truncatedResult = truncateSimple(text, targetWidth, maxWidth);
    exhaustedInput = !truncatedResult.overflowed;
  } else {
    const complexResult = truncateComplex(text, targetWidth, maxWidth);
    truncatedResult = complexResult;
    exhaustedInput = complexResult.exhaustedInput;
  }

  // Text fits completely
  if (!truncatedResult.overflowed && exhaustedInput) {
    return pad
      ? text + " ".repeat(Math.max(0, maxWidth - truncatedResult.visibleSoFar))
      : text;
  }

  return finalizeTruncatedResult(
    truncatedResult.result,
    truncatedResult.keptWidth,
    ellipsis,
    ellipsisWidth,
    maxWidth,
    pad,
  );
}

/**
 * Truncate a single fragment to a maximum width.
 */
function truncateFragmentToWidth(
  text: string,
  maxWidth: number,
): { text: string; width: number } {
  if (maxWidth <= 0 || text.length === 0) {
    return { text: "", width: 0 };
  }

  if (isPrintableAscii(text)) {
    const clipped = text.slice(0, maxWidth);
    return { text: clipped, width: clipped.length };
  }

  const hasAnsi = text.includes("\x1b");
  const hasTabs = text.includes("\t");
  if (!hasAnsi && !hasTabs) {
    let result = "";
    let width = 0;
    for (const { segment } of getSegmenter().segment(text)) {
      const w = graphemeWidth(segment);
      if (width + w > maxWidth) {
        break;
      }
      result += segment;
      width += w;
    }
    return { text: result, width };
  }

  let result = "";
  let width = 0;
  let i = 0;
  let pendingAnsi = "";

  while (i < text.length) {
    const ansi = extractAnsiCode(text, i);
    if (ansi) {
      pendingAnsi += ansi.code;
      i += ansi.length;
      continue;
    }

    if (text[i] === "\t") {
      if (width + 3 > maxWidth) {
        break;
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += "\t";
      width += 3;
      i++;
      continue;
    }

    let end = i;
    while (end < text.length && text[end] !== "\t") {
      const nextAnsi = extractAnsiCode(text, end);
      if (nextAnsi) {
        break;
      }
      end++;
    }

    for (const { segment } of getSegmenter().segment(text.slice(i, end))) {
      const w = graphemeWidth(segment);
      if (width + w > maxWidth) {
        return { text: result, width };
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += segment;
      width += w;
    }
    i = end;
  }

  return { text: result, width };
}

/**
 * Finalize a truncated result with proper ANSI reset codes.
 * Only adds reset codes if the prefix contains ANSI sequences.
 */
function finalizeTruncatedResult(
  prefix: string,
  prefixWidth: number,
  ellipsis: string,
  ellipsisWidth: number,
  maxWidth: number,
  pad: boolean,
): string {
  const hasAnsi = prefix.includes("\x1b");
  const visibleWidth = prefixWidth + ellipsisWidth;
  let result: string;

  if (hasAnsi) {
    const reset = "\x1b[0m";
    if (ellipsis.length > 0) {
      result = `${prefix}${reset}${ellipsis}${reset}`;
    } else {
      result = `${prefix}${reset}`;
    }
  } else {
    result = ellipsis.length > 0 ? `${prefix}${ellipsis}` : prefix;
  }

  return pad
    ? result + " ".repeat(Math.max(0, maxWidth - visibleWidth))
    : result;
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
