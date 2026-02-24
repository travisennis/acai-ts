import { eastAsianWidth } from "./east-asian-width.ts";
import { getSegmenter } from "./segmenter.ts";
import stripAnsi from "./strip-ansi.ts";

interface StringWidthOptions {
  ambiguousIsNarrow?: boolean;
  countAnsiEscapeCodes?: boolean;
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

function segmentWidth(
  segment: string,
  eastAsianWidthOptions: { ambiguousAsWide: boolean },
): number {
  if (zeroWidthClusterRegex.test(segment)) {
    return 0;
  }

  if (rgiEmojiRegex.test(segment)) {
    return 2;
  }

  const firstCodePoint = segment.codePointAt(0);
  if (firstCodePoint === undefined) {
    return 0;
  }

  const hasLeadingNonPrinting = leadingNonPrintingRegex.test(segment);
  const codePoint = hasLeadingNonPrinting
    ? segment.replace(leadingNonPrintingRegex, "").codePointAt(0)
    : firstCodePoint;

  if (codePoint === undefined) {
    return 0;
  }

  let width = eastAsianWidth(codePoint, eastAsianWidthOptions);
  if (segment.length > 1) {
    width += trailingHalfwidthWidth(segment, eastAsianWidthOptions);
  }
  return width;
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
  const segmenter = getSegmenter();

  for (const { segment } of segmenter.segment(string)) {
    width += segmentWidth(segment, eastAsianWidthOptions);
  }

  return width;
}
