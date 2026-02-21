type EastAsianWidthType =
  | "fullwidth"
  | "halfwidth"
  | "wide"
  | "narrow"
  | "neutral"
  | "ambiguous";

interface EastAsianWidthOptions {
  ambiguousAsWide?: boolean;
}

function validate(codePoint: number): asserts codePoint is number {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}

function isAmbiguous(codePoint: number): boolean {
  return (
    codePoint === 0xa1 ||
    codePoint === 0xa4 ||
    codePoint === 0xa7 ||
    codePoint === 0xa8 ||
    codePoint === 0xaa ||
    codePoint === 0xad ||
    codePoint === 0xae ||
    (codePoint >= 0xb0 && codePoint <= 0xb4) ||
    (codePoint >= 0xb6 && codePoint <= 0xba) ||
    (codePoint >= 0xbc && codePoint <= 0xbf) ||
    codePoint === 0xc6 ||
    codePoint === 0xd0 ||
    codePoint === 0xd7 ||
    codePoint === 0xd8 ||
    (codePoint >= 0xde && codePoint <= 0xe1) ||
    codePoint === 0xe6 ||
    (codePoint >= 0xe8 && codePoint <= 0xea) ||
    codePoint === 0xec ||
    codePoint === 0xed ||
    codePoint === 0xf0 ||
    codePoint === 0xf2 ||
    codePoint === 0xf3 ||
    (codePoint >= 0xf7 && codePoint <= 0xfa) ||
    codePoint === 0xfc ||
    codePoint === 0xfe ||
    codePoint === 0x101 ||
    codePoint === 0x111 ||
    codePoint === 0x113 ||
    codePoint === 0x11b ||
    codePoint === 0x126 ||
    codePoint === 0x127 ||
    codePoint === 0x12b ||
    (codePoint >= 0x131 && codePoint <= 0x133) ||
    codePoint === 0x138 ||
    (codePoint >= 0x13f && codePoint <= 0x142) ||
    codePoint === 0x144 ||
    (codePoint >= 0x148 && codePoint <= 0x14b) ||
    codePoint === 0x14d ||
    codePoint === 0x152 ||
    codePoint === 0x153 ||
    codePoint === 0x166 ||
    codePoint === 0x167 ||
    codePoint === 0x16b ||
    codePoint === 0x1ce ||
    codePoint === 0x1d0 ||
    codePoint === 0x1d2 ||
    codePoint === 0x1d4 ||
    codePoint === 0x1d6 ||
    codePoint === 0x1d8 ||
    codePoint === 0x1da ||
    codePoint === 0x1dc ||
    codePoint === 0x251 ||
    codePoint === 0x261 ||
    codePoint === 0x2c4 ||
    codePoint === 0x2c7 ||
    (codePoint >= 0x2c9 && codePoint <= 0x2cb) ||
    codePoint === 0x2cd ||
    codePoint === 0x2d0 ||
    (codePoint >= 0x2d8 && codePoint <= 0x2db) ||
    codePoint === 0x2dd ||
    codePoint === 0x2df ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x391 && codePoint <= 0x3a1) ||
    (codePoint >= 0x3a3 && codePoint <= 0x3a9) ||
    (codePoint >= 0x3b1 && codePoint <= 0x3c1) ||
    (codePoint >= 0x3c3 && codePoint <= 0x3c9) ||
    codePoint === 0x401 ||
    (codePoint >= 0x410 && codePoint <= 0x44f) ||
    codePoint === 0x451 ||
    codePoint === 0x2010 ||
    (codePoint >= 0x2013 && codePoint <= 0x2016) ||
    codePoint === 0x2018 ||
    codePoint === 0x2019 ||
    codePoint === 0x201c ||
    codePoint === 0x201d ||
    (codePoint >= 0x2020 && codePoint <= 0x2022) ||
    (codePoint >= 0x2024 && codePoint <= 0x2027) ||
    codePoint === 0x2030 ||
    codePoint === 0x2032 ||
    codePoint === 0x2033 ||
    codePoint === 0x2035 ||
    codePoint === 0x203b ||
    codePoint === 0x203e ||
    codePoint === 0x2074 ||
    codePoint === 0x207f ||
    (codePoint >= 0x2081 && codePoint <= 0x2084) ||
    codePoint === 0x20ac ||
    codePoint === 0x2103 ||
    codePoint === 0x2105 ||
    codePoint === 0x2109 ||
    codePoint === 0x2113 ||
    codePoint === 0x2116 ||
    codePoint === 0x2121 ||
    codePoint === 0x2122 ||
    codePoint === 0x2126 ||
    codePoint === 0x212b ||
    codePoint === 0x2153 ||
    codePoint === 0x2154 ||
    (codePoint >= 0x215b && codePoint <= 0x215e) ||
    (codePoint >= 0x2160 && codePoint <= 0x216b) ||
    (codePoint >= 0x2170 && codePoint <= 0x2179) ||
    codePoint === 0x2189 ||
    (codePoint >= 0x2190 && codePoint <= 0x2199) ||
    codePoint === 0x21b8 ||
    codePoint === 0x21b9 ||
    codePoint === 0x21d2 ||
    codePoint === 0x21d4 ||
    codePoint === 0x21e7 ||
    codePoint === 0x2200 ||
    codePoint === 0x2202 ||
    codePoint === 0x2203 ||
    codePoint === 0x2207 ||
    codePoint === 0x2208 ||
    codePoint === 0x220b ||
    codePoint === 0x220f ||
    codePoint === 0x2211 ||
    codePoint === 0x2215 ||
    codePoint === 0x221a ||
    (codePoint >= 0x221d && codePoint <= 0x2220) ||
    codePoint === 0x2223 ||
    codePoint === 0x2225 ||
    (codePoint >= 0x2227 && codePoint <= 0x222c) ||
    codePoint === 0x222e ||
    (codePoint >= 0x2234 && codePoint <= 0x2237) ||
    codePoint === 0x223c ||
    codePoint === 0x223d ||
    codePoint === 0x2248 ||
    codePoint === 0x224c ||
    codePoint === 0x2252 ||
    codePoint === 0x2260 ||
    codePoint === 0x2261 ||
    (codePoint >= 0x2264 && codePoint <= 0x2267) ||
    codePoint === 0x226a ||
    codePoint === 0x226b ||
    codePoint === 0x226e ||
    codePoint === 0x226f ||
    codePoint === 0x2282 ||
    codePoint === 0x2283 ||
    codePoint === 0x2286 ||
    codePoint === 0x2287 ||
    codePoint === 0x2295 ||
    codePoint === 0x2299 ||
    codePoint === 0x22a5 ||
    codePoint === 0x22bf ||
    codePoint === 0x2312 ||
    (codePoint >= 0x2460 && codePoint <= 0x24e9) ||
    (codePoint >= 0x24eb && codePoint <= 0x254b) ||
    (codePoint >= 0x2550 && codePoint <= 0x2573) ||
    (codePoint >= 0x2580 && codePoint <= 0x258f) ||
    (codePoint >= 0x2592 && codePoint <= 0x2595) ||
    codePoint === 0x25a0 ||
    codePoint === 0x25a1 ||
    (codePoint >= 0x25a3 && codePoint <= 0x25a9) ||
    codePoint === 0x25b2 ||
    codePoint === 0x25b3 ||
    codePoint === 0x25b6 ||
    codePoint === 0x25b7 ||
    codePoint === 0x25bc ||
    codePoint === 0x25bd ||
    codePoint === 0x25c0 ||
    codePoint === 0x25c1 ||
    (codePoint >= 0x25c6 && codePoint <= 0x25c8) ||
    codePoint === 0x25cb ||
    (codePoint >= 0x25ce && codePoint <= 0x25d1) ||
    (codePoint >= 0x25e2 && codePoint <= 0x25e5) ||
    codePoint === 0x25ef ||
    codePoint === 0x2605 ||
    codePoint === 0x2606 ||
    codePoint === 0x2609 ||
    codePoint === 0x260e ||
    codePoint === 0x260f ||
    codePoint === 0x261c ||
    codePoint === 0x261e ||
    codePoint === 0x2640 ||
    codePoint === 0x2642 ||
    codePoint === 0x2660 ||
    codePoint === 0x2661 ||
    (codePoint >= 0x2663 && codePoint <= 0x2665) ||
    (codePoint >= 0x2667 && codePoint <= 0x266a) ||
    codePoint === 0x266c ||
    codePoint === 0x266d ||
    codePoint === 0x266f ||
    codePoint === 0x269e ||
    codePoint === 0x269f ||
    codePoint === 0x26bf ||
    (codePoint >= 0x26c6 && codePoint <= 0x26cd) ||
    (codePoint >= 0x26cf && codePoint <= 0x26d3) ||
    (codePoint >= 0x26d5 && codePoint <= 0x26e1) ||
    codePoint === 0x26e3 ||
    codePoint === 0x26e8 ||
    codePoint === 0x26e9 ||
    (codePoint >= 0x26eb && codePoint <= 0x26f1) ||
    codePoint === 0x26f4 ||
    (codePoint >= 0x26f6 && codePoint <= 0x26f9) ||
    codePoint === 0x26fb ||
    codePoint === 0x26fc ||
    codePoint === 0x26fe ||
    codePoint === 0x26ff ||
    codePoint === 0x273d ||
    (codePoint >= 0x2776 && codePoint <= 0x277f) ||
    (codePoint >= 0x2b56 && codePoint <= 0x2b59) ||
    (codePoint >= 0x3248 && codePoint <= 0x324f) ||
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    codePoint === 0xfffd ||
    (codePoint >= 0x1f100 && codePoint <= 0x1f10a) ||
    (codePoint >= 0x1f110 && codePoint <= 0x1f12d) ||
    (codePoint >= 0x1f130 && codePoint <= 0x1f169) ||
    (codePoint >= 0x1f170 && codePoint <= 0x1f18d) ||
    codePoint === 0x1f18f ||
    codePoint === 0x1f190 ||
    (codePoint >= 0x1f19b && codePoint <= 0x1f1ac) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  );
}

function isFullWidth(codePoint: number): boolean {
  return (
    codePoint === 0x3000 ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2630, 0x2637],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x268a, 0x268f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x2e99],
  [0x2e9b, 0x2ef3],
  [0x2f00, 0x2fd5],
  [0x2ff0, 0x2fff],
  [0x3001, 0x303e],
  [0x3041, 0x3096],
  [0x3099, 0x30ff],
  [0x3105, 0x312f],
  [0x3131, 0x318e],
  [0x3190, 0x31e5],
  [0x31ef, 0x321e],
  [0x3220, 0x3247],
  [0x3250, 0xa48c],
  [0xa490, 0xa4c6],
  [0xa960, 0xa97c],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe52],
  [0xfe54, 0xfe66],
  [0xfe68, 0xfe6b],
  [0x16fe0, 0x16fe4],
  [0x16ff0, 0x16ff6],
  [0x17000, 0x18cd5],
  [0x18cff, 0x18d1e],
  [0x18d80, 0x18df2],
  [0x1aff0, 0x1aff3],
  [0x1aff5, 0x1affb],
  [0x1affd, 0x1affe],
  [0x1b000, 0x1b122],
  [0x1b132, 0x1b132],
  [0x1b150, 0x1b152],
  [0x1b155, 0x1b155],
  [0x1b164, 0x1b167],
  [0x1b170, 0x1b2fb],
  [0x1d300, 0x1d356],
  [0x1d360, 0x1d376],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f202],
  [0x1f210, 0x1f23b],
  [0x1f240, 0x1f248],
  [0x1f250, 0x1f251],
  [0x1f260, 0x1f265],
  [0x1f300, 0x1f320],
  [0x1f32d, 0x1f335],
  [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393],
  [0x1f3a0, 0x1f3ca],
  [0x1f3cf, 0x1f3d3],
  [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4],
  [0x1f3f8, 0x1f43e],
  [0x1f440, 0x1f440],
  [0x1f442, 0x1f4fc],
  [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e],
  [0x1f550, 0x1f567],
  [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596],
  [0x1f5a4, 0x1f5a4],
  [0x1f5fb, 0x1f64f],
  [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc],
  [0x1f6d0, 0x1f6d2],
  [0x1f6d5, 0x1f6d8],
  [0x1f6dc, 0x1f6df],
  [0x1f6eb, 0x1f6ec],
  [0x1f6f4, 0x1f6fc],
  [0x1f7e0, 0x1f7eb],
  [0x1f7f0, 0x1f7f0],
  [0x1f90c, 0x1f93a],
  [0x1f93c, 0x1f945],
  [0x1f947, 0x1f9ff],
  [0x1fa70, 0x1fa7c],
  [0x1fa80, 0x1fa8a],
  [0x1fa8e, 0x1fac6],
  [0x1fac8, 0x1fac8],
  [0x1facd, 0x1fadc],
  [0x1fadf, 0x1faea],
  [0x1faef, 0x1faf8],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function isWide(codePoint: number): boolean {
  return WIDE_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
}

function getCategory(codePoint: number): EastAsianWidthType {
  if (isAmbiguous(codePoint)) return "ambiguous";

  if (isFullWidth(codePoint)) return "fullwidth";

  if (
    codePoint === 0x20a9 ||
    (codePoint >= 0xff61 && codePoint <= 0xffbe) ||
    (codePoint >= 0xffc2 && codePoint <= 0xffc7) ||
    (codePoint >= 0xffca && codePoint <= 0xffcf) ||
    (codePoint >= 0xffd2 && codePoint <= 0xffd7) ||
    (codePoint >= 0xffda && codePoint <= 0xffdc) ||
    (codePoint >= 0xffe8 && codePoint <= 0xffee)
  ) {
    return "halfwidth";
  }

  if (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    codePoint === 0xa2 ||
    codePoint === 0xa3 ||
    codePoint === 0xa5 ||
    codePoint === 0xa6 ||
    codePoint === 0xac ||
    codePoint === 0xaf ||
    (codePoint >= 0x27e6 && codePoint <= 0x27ed) ||
    codePoint === 0x2985 ||
    codePoint === 0x2986
  ) {
    return "narrow";
  }

  if (isWide(codePoint)) return "wide";

  return "neutral";
}

export function eastAsianWidthType(codePoint: number): EastAsianWidthType {
  validate(codePoint);
  return getCategory(codePoint);
}

export function eastAsianWidth(
  codePoint: number,
  options: EastAsianWidthOptions = {},
): 1 | 2 {
  const { ambiguousAsWide = false } = options;
  validate(codePoint);
  if (
    isFullWidth(codePoint) ||
    isWide(codePoint) ||
    (ambiguousAsWide && isAmbiguous(codePoint))
  ) {
    return 2;
  }
  return 1;
}
