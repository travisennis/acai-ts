import { strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import {
  eastAsianWidth,
  eastAsianWidthType,
} from "../../source/terminal/east-asian-width.ts";

describe("eastAsianWidthType", () => {
  it("should throw for non-integer input", () => {
    throws(() => eastAsianWidthType(1.5), TypeError);
    throws(() => eastAsianWidthType(Number.NaN), TypeError);
    throws(() => eastAsianWidthType(Number.POSITIVE_INFINITY), TypeError);
  });

  it("should classify neutral characters", () => {
    strictEqual(eastAsianWidthType(0x0), "neutral");
    strictEqual(eastAsianWidthType(0x10), "neutral");
  });

  it("should classify narrow characters (ASCII)", () => {
    strictEqual(eastAsianWidthType(0x20), "narrow");
    strictEqual(eastAsianWidthType(0x41), "narrow"); // 'A'
    strictEqual(eastAsianWidthType(0x7a), "narrow"); // 'z'
    strictEqual(eastAsianWidthType(0x7e), "narrow"); // '~'
  });

  it("should classify narrow characters (non-ASCII)", () => {
    strictEqual(eastAsianWidthType(0xa2), "narrow"); // ¢
    strictEqual(eastAsianWidthType(0xa3), "narrow"); // £
    strictEqual(eastAsianWidthType(0xa5), "narrow"); // ¥
    strictEqual(eastAsianWidthType(0x2985), "narrow");
    strictEqual(eastAsianWidthType(0x2986), "narrow");
    strictEqual(eastAsianWidthType(0x27e6), "narrow");
    strictEqual(eastAsianWidthType(0x27ed), "narrow");
  });

  it("should classify ambiguous characters", () => {
    strictEqual(eastAsianWidthType(0xa1), "ambiguous"); // ¡
    strictEqual(eastAsianWidthType(0xa4), "ambiguous"); // ¤
    strictEqual(eastAsianWidthType(0xb0), "ambiguous"); // °
    strictEqual(eastAsianWidthType(0xb4), "ambiguous"); // ´ (end of range)
    strictEqual(eastAsianWidthType(0x391), "ambiguous"); // Greek Alpha
    strictEqual(eastAsianWidthType(0x3a9), "ambiguous"); // Greek Omega
    strictEqual(eastAsianWidthType(0x2605), "ambiguous"); // ★
    strictEqual(eastAsianWidthType(0xfffd), "ambiguous"); // replacement char
    strictEqual(eastAsianWidthType(0x100000), "ambiguous"); // Supplementary PUA
    strictEqual(eastAsianWidthType(0x10fffd), "ambiguous");
  });

  it("should classify fullwidth characters", () => {
    strictEqual(eastAsianWidthType(0x3000), "fullwidth"); // ideographic space
    strictEqual(eastAsianWidthType(0xff01), "fullwidth"); // fullwidth !
    strictEqual(eastAsianWidthType(0xff60), "fullwidth"); // fullwidth right paren
    strictEqual(eastAsianWidthType(0xffe0), "fullwidth");
    strictEqual(eastAsianWidthType(0xffe6), "fullwidth");
  });

  it("should classify halfwidth characters", () => {
    strictEqual(eastAsianWidthType(0x20a9), "halfwidth"); // ₩
    strictEqual(eastAsianWidthType(0xff61), "halfwidth");
    strictEqual(eastAsianWidthType(0xffbe), "halfwidth");
    strictEqual(eastAsianWidthType(0xffe8), "halfwidth");
    strictEqual(eastAsianWidthType(0xffee), "halfwidth");
  });

  it("should classify wide characters", () => {
    // Hangul Jamo
    strictEqual(eastAsianWidthType(0x1100), "wide");
    strictEqual(eastAsianWidthType(0x115f), "wide");
    // Watch/hourglass emoji
    strictEqual(eastAsianWidthType(0x231a), "wide");
    strictEqual(eastAsianWidthType(0x231b), "wide");
    // CJK unified ideographs
    strictEqual(eastAsianWidthType(0x4e00), "wide"); // within 0x3250-0xa48c
    // Hiragana
    strictEqual(eastAsianWidthType(0x3041), "wide");
    strictEqual(eastAsianWidthType(0x3096), "wide");
    // Katakana
    strictEqual(eastAsianWidthType(0x30a0), "wide"); // within 0x3099-0x30ff
    // Korean syllables
    strictEqual(eastAsianWidthType(0xac00), "wide");
    strictEqual(eastAsianWidthType(0xd7a3), "wide");
    // Emoji
    strictEqual(eastAsianWidthType(0x1f600), "wide"); // within 0x1f5fb-0x1f64f
    strictEqual(eastAsianWidthType(0x1f004), "wide"); // mahjong tile
    // CJK Extension B
    strictEqual(eastAsianWidthType(0x20000), "wide");
    strictEqual(eastAsianWidthType(0x2fffd), "wide");
    // CJK Extension G
    strictEqual(eastAsianWidthType(0x30000), "wide");
    strictEqual(eastAsianWidthType(0x3fffd), "wide");
  });

  it("should handle wide character boundary values", () => {
    // Just outside the wide Hangul Jamo range
    strictEqual(eastAsianWidthType(0x10ff) !== "wide", true);
    strictEqual(eastAsianWidthType(0x1160) !== "wide", true);
    // Just outside CJK Extension B
    strictEqual(eastAsianWidthType(0x1ffff) !== "wide", true);
    strictEqual(eastAsianWidthType(0x3fffe) !== "wide", true);
  });

  it("should handle specific wide singleton code points", () => {
    strictEqual(eastAsianWidthType(0x2329), "wide");
    strictEqual(eastAsianWidthType(0x232a), "wide");
    strictEqual(eastAsianWidthType(0x23f0), "wide"); // alarm clock
    strictEqual(eastAsianWidthType(0x23f3), "wide"); // hourglass
    strictEqual(eastAsianWidthType(0x267f), "wide"); // wheelchair
    strictEqual(eastAsianWidthType(0x2693), "wide"); // anchor
    strictEqual(eastAsianWidthType(0x26a1), "wide"); // lightning
    strictEqual(eastAsianWidthType(0x2705), "wide"); // check mark
    strictEqual(eastAsianWidthType(0x2728), "wide"); // sparkles
    strictEqual(eastAsianWidthType(0x274c), "wide"); // cross mark
    strictEqual(eastAsianWidthType(0x2757), "wide"); // exclamation
    strictEqual(eastAsianWidthType(0x1f0cf), "wide"); // joker
    strictEqual(eastAsianWidthType(0x1f18e), "wide"); // AB button
  });

  it("should handle wide ranges in the upper plane", () => {
    strictEqual(eastAsianWidthType(0x16fe0), "wide");
    strictEqual(eastAsianWidthType(0x16fe4), "wide");
    strictEqual(eastAsianWidthType(0x17000), "wide");
    strictEqual(eastAsianWidthType(0x18cd5), "wide");
    strictEqual(eastAsianWidthType(0x1b000), "wide");
    strictEqual(eastAsianWidthType(0x1b122), "wide");
    strictEqual(eastAsianWidthType(0x1b132), "wide");
    strictEqual(eastAsianWidthType(0x1b155), "wide");
  });
});

describe("eastAsianWidth", () => {
  it("should throw for non-integer input", () => {
    throws(() => eastAsianWidth(1.5), TypeError);
  });

  it("should return 1 for narrow/neutral/halfwidth characters", () => {
    strictEqual(eastAsianWidth(0x41), 1); // 'A'
    strictEqual(eastAsianWidth(0x20), 1); // space
    strictEqual(eastAsianWidth(0x0), 1); // null
    strictEqual(eastAsianWidth(0x20a9), 1); // halfwidth ₩
    strictEqual(eastAsianWidth(0xff61), 1); // halfwidth
  });

  it("should return 2 for fullwidth characters", () => {
    strictEqual(eastAsianWidth(0x3000), 2); // ideographic space
    strictEqual(eastAsianWidth(0xff01), 2); // fullwidth !
  });

  it("should return 2 for wide characters", () => {
    strictEqual(eastAsianWidth(0x1100), 2); // Hangul Jamo
    strictEqual(eastAsianWidth(0x4e00), 2); // CJK ideograph
    strictEqual(eastAsianWidth(0x1f600), 2); // emoji
  });

  it("should return 1 for ambiguous characters by default", () => {
    strictEqual(eastAsianWidth(0xa1), 1); // ¡
    strictEqual(eastAsianWidth(0x391), 1); // Greek Alpha
  });

  it("should return 2 for ambiguous characters when ambiguousAsWide is true", () => {
    strictEqual(eastAsianWidth(0xa1, { ambiguousAsWide: true }), 2);
    strictEqual(eastAsianWidth(0x391, { ambiguousAsWide: true }), 2);
    strictEqual(eastAsianWidth(0x2605, { ambiguousAsWide: true }), 2); // ★
  });

  it("should still return 1 for narrow chars even with ambiguousAsWide", () => {
    strictEqual(eastAsianWidth(0x41, { ambiguousAsWide: true }), 1); // 'A'
  });
});
