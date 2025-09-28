import { eastAsianWidth } from "./east-asian-width.ts";
import stripAnsi from "./strip-ansi.ts";

interface StringWidthOptions {
  ambiguousIsNarrow?: boolean;
  countAnsiEscapeCodes?: boolean;
}

const segmenter = new Intl.Segmenter();

// Whole-cluster zero-width
const zeroWidthClusterRegex =
  /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;

// Pick the base scalar if the cluster starts with Prepend/Format/Marks
const leadingNonPrintingRegex =
  /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;

// RGI emoji sequences
const rgiEmojiRegex = /^\p{RGI_Emoji}$/v;

function baseVisible(segment: string): string {
  return segment.replace(leadingNonPrintingRegex, "");
}

function isZeroWidthCluster(segment: string): boolean {
  return zeroWidthClusterRegex.test(segment);
}

function trailingHalfwidthWidth(
  segment: string,
  eastAsianWidthOptions: { ambiguousAsWide: boolean },
): number {
  let extra = 0;
  if (segment.length > 1) {
    for (const char of segment.slice(1)) {
      const codePoint = char.codePointAt(0);
      if (codePoint !== undefined && char >= "\\uFF00" && char <= "\\uFFEF") {
        extra += eastAsianWidth(codePoint, eastAsianWidthOptions);
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
  }

  if (string.length === 0) {
    return 0;
  }

  let width = 0;
  const eastAsianWidthOptions = { ambiguousAsWide: !ambiguousIsNarrow };

  for (const { segment } of segmenter.segment(string)) {
    // Zero-width / non-printing clusters
    if (isZeroWidthCluster(segment)) {
      continue;
    }

    // Emoji width logic
    if (rgiEmojiRegex.test(segment)) {
      width += 2;
      continue;
    }

    // Everything else: EAW of the cluster’s first visible scalar
    const codePoint = baseVisible(segment).codePointAt(0);
    if (codePoint !== undefined) {
      width += eastAsianWidth(codePoint, eastAsianWidthOptions);
      // Add width for trailing Halfwidth and Fullwidth Forms (e.g., ﾞ, ﾟ, ｰ)
      width += trailingHalfwidthWidth(segment, eastAsianWidthOptions);
    }
  }

  return width;
}
