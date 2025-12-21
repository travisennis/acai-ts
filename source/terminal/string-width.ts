import { eastAsianWidth } from "./east-asian-width.ts";
import stripAnsi from "./strip-ansi.ts";

interface StringWidthOptions {
  ambiguousIsNarrow?: boolean;
  countAnsiEscapeCodes?: boolean;
}

// Lazily initialize segmenter only when needed
let segmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter {
  if (!segmenter) {
    segmenter = new Intl.Segmenter();
  }
  return segmenter;
}

// Precompile regexes (these are already at module level, which is good)
// Whole-cluster zero-width
const zeroWidthClusterRegex =
  /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;

// Pick the base scalar if the cluster starts with Prepend/Format/Marks
const leadingNonPrintingRegex =
  /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;

// RGI emoji sequences
const rgiEmojiRegex = /^\p{RGI_Emoji}$/v;

// Halfwidth/Fullwidth range constants
const HALFWIDTH_START = 0xff00;
const HALFWIDTH_END = 0xffef;

function trailingHalfwidthWidth(
  segment: string,
  eastAsianWidthOptions: { ambiguousAsWide: boolean },
): number {
  const len = segment.length;
  if (len <= 1) {
    return 0;
  }

  let extra = 0;
  // Use for loop with index for better performance
  for (let i = 1; i < len; i++) {
    const codePoint = segment.codePointAt(i);
    if (
      codePoint !== undefined &&
      codePoint >= HALFWIDTH_START &&
      codePoint <= HALFWIDTH_END
    ) {
      extra += eastAsianWidth(codePoint, eastAsianWidthOptions);
      // Skip next char if this was a surrogate pair
      if (codePoint > 0xffff) {
        i++;
      }
    }
  }
  return extra;
}

export default function stringWidth(
  input: string,
  options: StringWidthOptions = {},
): number {
  if (typeof input !== "string" || input.length === 0) {
    return 0;
  }

  const { ambiguousIsNarrow = true, countAnsiEscapeCodes = false } = options;

  let string = input;
  if (!countAnsiEscapeCodes) {
    string = stripAnsi(string);
    if (string.length === 0) {
      return 0;
    }
  }

  let width = 0;
  const eastAsianWidthOptions = { ambiguousAsWide: !ambiguousIsNarrow };

  // Use lazy segmenter initialization
  const segmenter = getSegmenter();
  for (const { segment } of segmenter.segment(string)) {
    // Zero-width clusters - inline test for hot path
    if (zeroWidthClusterRegex.test(segment)) {
      continue;
    }

    // Emoji width logic
    if (rgiEmojiRegex.test(segment)) {
      width += 2;
      continue;
    }

    // Get first code point directly, avoiding intermediate string
    const firstCodePoint = segment.codePointAt(0);
    if (firstCodePoint === undefined) {
      continue;
    }

    // Check if we need to strip leading non-printing characters
    const hasLeadingNonPrinting = leadingNonPrintingRegex.test(segment);
    const codePoint = hasLeadingNonPrinting
      ? segment.replace(leadingNonPrintingRegex, "").codePointAt(0)
      : firstCodePoint;

    if (codePoint !== undefined) {
      width += eastAsianWidth(codePoint, eastAsianWidthOptions);

      // Only check trailing width if segment has multiple characters
      if (segment.length > 1) {
        width += trailingHalfwidthWidth(segment, eastAsianWidthOptions);
      }
    }
  }

  return width;
}
