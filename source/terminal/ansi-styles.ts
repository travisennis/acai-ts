// Converted from ansi-styles/index.js to modern TypeScript
// Original source: chalk-main/source/vendor/ansi-styles/index.js

import { objectEntries } from "@travisennis/stdlib/object";

const ANSI_BACKGROUND_OFFSET = 10;

const wrapAnsi16 =
  (offset = 0): ((code: number) => string) =>
  (code: number) =>
    `\u001B[${code + offset}m`;

const wrapAnsi256 =
  (offset = 0): ((code: number) => string) =>
  (code: number) =>
    `\u001B[${38 + offset};5;${code}m`;

const wrapAnsi16m =
  (offset = 0): ((red: number, green: number, blue: number) => string) =>
  (red: number, green: number, blue: number) =>
    `\u001B[${38 + offset};2;${red};${green};${blue}m`;

interface StyleCodes {
  [0]: number; // open
  [1]: number; // close
}

export interface Style {
  open: string;
  close: string;
}

interface ColorStyle extends Style {
  ansi: (code: number) => string;
  ansi256: (code: number) => string;
  ansi16m: (red: number, green: number, blue: number) => string;
}

interface Styles {
  modifier: typeof styles.modifier;
  color: typeof styles.color & ColorStyle;
  bgColor: typeof styles.bgColor & ColorStyle;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for chalk compatibility
  [key: string]: any;
  rgbToAnsi256: (red: number, green: number, blue: number) => number;
  hexToRgb: (hex: string) => [number, number, number];
  hexToAnsi256: (hex: string) => number;
  ansi256ToAnsi: (code: number) => number;
  rgbToAnsi: (red: number, green: number, blue: number) => number;
  hexToAnsi: (hex: string) => number;
}

const styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
  } as const,
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39], // Alias of `blackBright`
    grey: [90, 39], // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39],
  } as const,
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49], // Alias of `bgBlackBright`
    bgGrey: [100, 49], // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49],
  } as const,
} as const;

/**
 * Assembles the styles object with open/close ANSI sequences.
 * @returns The fully assembled styles object.
 */
function assembleStyles(): Styles {
  const codes = new Map<number, number>();

  for (const [groupName, group] of objectEntries(styles)) {
    for (const [styleName, styleCodes] of objectEntries(group)) {
      const style: Style = {
        open: `\u001B[${(styleCodes as StyleCodes)[0]}m`,
        close: `\u001B[${(styleCodes as StyleCodes)[1]}m`,
      };

      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
      (styles as any)[styleName] = style;
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
      (group as any)[styleName] = style;

      codes.set((styleCodes as StyleCodes)[0], (styleCodes as StyleCodes)[1]);
    }

    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false,
    });
  }

  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false,
  });

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.color as any).close = "\u001B[39m";
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.bgColor as any).close = "\u001B[49m";

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.color as any).ansi = wrapAnsi16();
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.color as any).ansi256 = wrapAnsi256();
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.color as any).ansi16m = wrapAnsi16m();
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.bgColor as any).ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.bgColor as any).ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
  (styles.bgColor as any).ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);

  // Color conversion functions (from original source)
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red: number, green: number, blue: number): number {
        // We use the extended greyscale palette here, with the exception of
        // black and white. normal palette only has 4 greyscale shades.
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }

          if (red > 248) {
            return 231;
          }

          return Math.round(((red - 8) / 247) * 24) + 232;
        }

        return (
          16 +
          36 * Math.round((red / 255) * 5) +
          6 * Math.round((green / 255) * 5) +
          Math.round((blue / 255) * 5)
        );
      },
      enumerable: false,
    },
    hexToRgb: {
      value(hex: string): [number, number, number] {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex);
        if (!matches) {
          return [0, 0, 0];
        }

        let [colorString] = matches;

        if (colorString.length === 3) {
          colorString = [...colorString]
            .map((character) => character + character)
            .join("");
        }

        const integer = Number.parseInt(colorString, 16);

        return [
          /* eslint-disable no-bitwise */
          (integer >> 16) & 0xff,
          (integer >> 8) & 0xff,
          integer & 0xff,
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false,
    },
    hexToAnsi256: {
      value: (hex: string): number =>
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
        (styles as any).rgbToAnsi256(...(styles as any).hexToRgb(hex)),
      enumerable: false,
    },
    ansi256ToAnsi: {
      value(codeParam: number): number {
        const code = codeParam;
        if (code < 8) {
          return 30 + code;
        }

        if (code < 16) {
          return 90 + (code - 8);
        }

        let red: number;
        let green: number;
        let blue: number;

        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          const adjustedCode = code - 16;

          const remainder = adjustedCode % 36;

          red = Math.floor(adjustedCode / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = (remainder % 6) / 5;
        }

        const value = Math.max(red, green, blue) * 2;

        if (value === 0) {
          return 30;
        }

        // eslint-disable-next-line no-bitwise
        let result =
          30 +
          ((Math.round(blue) << 2) |
            (Math.round(green) << 1) |
            Math.round(red));

        if (value === 2) {
          result += 60;
        }

        return result;
      },
      enumerable: false,
    },
    rgbToAnsi: {
      value: (red: number, green: number, blue: number): number =>
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
        (styles as any).ansi256ToAnsi(
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
          (styles as any).rgbToAnsi256(red, green, blue),
        ),
      enumerable: false,
    },
    hexToAnsi: {
      value: (hex: string): number =>
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
        (styles as any).ansi256ToAnsi((styles as any).hexToAnsi256(hex)),
      enumerable: false,
    },
  });

  return styles as Styles;
}

export const ansiStyles = assembleStyles();
