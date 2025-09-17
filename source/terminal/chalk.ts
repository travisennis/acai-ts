// Converted from https://raw.githubusercontent.com/chalk/chalk/refs/heads/main/source/vendor/supports-color/index.js to modern TypeScript

import type { Style } from "./ansi-styles.ts";
import { ansiStyles } from "./ansi-styles.ts";
import { supportsColor } from "./supports-color.ts";

const { stdout: stdoutColor, stderr: stderrColor } = supportsColor;

const GENERATOR = Symbol("GENERATOR");
const STYLER = Symbol("STYLER");
const IS_EMPTY = Symbol("IS_EMPTY");

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = ["ansi", "ansi", "ansi256", "ansi16m"] as const;

const styles = Object.create(null) as Record<string, PropertyDescriptor>;

// biome-ignore lint/suspicious/noExplicitAny: Dynamic object assignment needed for chalk compatibility
const applyOptions = (object: any, options: Options = {}): void => {
  if (
    options.level !== undefined &&
    !(
      Number.isInteger(options.level) &&
      options.level >= 0 &&
      options.level <= 3
    )
  ) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }

  // Detect level if not set manually
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === undefined ? colorLevel : options.level;
};

export interface Options {
  /**
   * Specify the color support for Chalk.
   *
   * By default, color support is automatically detected based on the environment.
   *
   * Levels:
   * - `0` - All colors disabled.
   * - `1` - Basic 16 colors support.
   * - `2` - ANSI 256 colors support.
   * - `3` - Truecolor 16 million colors support.
   */
  readonly level?: number; // 0 | 1 | 2 | 3 (ColorSupportLevel)
}

export interface ChalkInstance {
  (...text: unknown[]): string;

  /**
   * The color support for Chalk.
   *
   * By default, color support is automatically detected based on the environment.
   *
   * Levels:
   * - `0` - All colors disabled.
   * - `1` - Basic 16 colors support.
   * - `2` - ANSI 256 colors support.
   * - `3` - Truecolor 16 million colors support.
   */
  level: number; // ColorSupportLevel

  /**
   * Use RGB values to set text color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.rgb(222, 173, 237)('Hello');
   * //=> '\u001B[38;2;222;173;237mHello\u001B[39m'
   * ```
   */
  rgb: (red: number, green: number, blue: number) => ChalkInstance;

  /**
   * Use HEX value to set text color.
   *
   * @param color - Hexadecimal value representing the desired color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.hex('#DEADED')('Hello');
   * //=> '\u001B[38;2;222;173;237mHello\u001B[39m'
   * ```
   */
  hex: (color: string) => ChalkInstance;

  /**
   * Use an [8-bit unsigned number](https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit) to set text color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.ansi256(201)('Hello');
   * //=> '\u001B[38;5;201mHello\u001B[39m'
   * ```
   */
  ansi256: (index: number) => ChalkInstance;

  /**
   * Use RGB values to set background color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.bgRgb(222, 173, 237)('Hello');
   * //=> '\u001B[48;2;222;173;237mHello\u001B[49m'
   * ```
   */
  bgRgb: (red: number, green: number, blue: number) => ChalkInstance;

  /**
   * Use HEX value to set background color.
   *
   * @param color - Hexadecimal value representing the desired color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.bgHex('#DEADED')('Hello');
   * //=> '\u001B[48;2;222;173;237mHello\u001B[49m'
   * ```
   */
  bgHex: (color: string) => ChalkInstance;

  /**
   * Use a [8-bit unsigned number](https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit) to set background color.
   *
   * @example
   * ```
   * import { chalk } from './terminal/chalk';
   *
   * chalk.bgAnsi256(201)('Hello');
   * //=> '\u001B[48;5;201mHello\u001B[49m'
   * ```
   */
  bgAnsi256: (index: number) => ChalkInstance;

  /**
   * Modifier: Reset the current style.
   */
  readonly reset: ChalkInstance;

  /**
   * Modifier: Make the text bold.
   */
  readonly bold: ChalkInstance;

  /**
   * Modifier: Make the text have lower opacity.
   */
  readonly dim: ChalkInstance;

  /**
   * Modifier: Make the text italic. *(Not widely supported)*
   */
  readonly italic: ChalkInstance;

  /**
   * Modifier: Put a horizontal line below the text. *(Not widely supported)*
   */
  readonly underline: ChalkInstance;

  /**
   * Modifier: Put a horizontal line above the text. *(Not widely supported)*
   */
  readonly overline: ChalkInstance;

  /**
   * Modifier: Invert background and foreground colors.
   */
  readonly inverse: ChalkInstance;

  /**
   * Modifier: Print the text but make it invisible.
   */
  readonly hidden: ChalkInstance;

  /**
   * Modifier: Puts a horizontal line through the center of the text. *(Not widely supported)*
   */
  readonly strikethrough: ChalkInstance;

  /**
   * Modifier: Print the text only when Chalk has a color level above zero.
   *
   * Can be useful for things that are purely cosmetic.
   */
  readonly visible: ChalkInstance;

  readonly black: ChalkInstance;
  readonly red: ChalkInstance;
  readonly green: ChalkInstance;
  readonly yellow: ChalkInstance;
  readonly blue: ChalkInstance;
  readonly magenta: ChalkInstance;
  readonly cyan: ChalkInstance;
  readonly white: ChalkInstance;

  /*
   * Alias for `blackBright`.
   */
  readonly gray: ChalkInstance;

  /*
   * Alias for `blackBright`.
   */
  readonly grey: ChalkInstance;

  readonly blackBright: ChalkInstance;
  readonly redBright: ChalkInstance;
  readonly greenBright: ChalkInstance;
  readonly yellowBright: ChalkInstance;
  readonly blueBright: ChalkInstance;
  readonly magentaBright: ChalkInstance;
  readonly cyanBright: ChalkInstance;
  readonly whiteBright: ChalkInstance;

  readonly bgBlack: ChalkInstance;
  readonly bgRed: ChalkInstance;
  readonly bgGreen: ChalkInstance;
  readonly bgYellow: ChalkInstance;
  readonly bgBlue: ChalkInstance;
  readonly bgMagenta: ChalkInstance;
  readonly bgCyan: ChalkInstance;
  readonly bgWhite: ChalkInstance;

  /*
   * Alias for `bgBlackBright`.
   */
  readonly bgGray: ChalkInstance;

  /*
   * Alias for `bgBlackBright`.
   */
  readonly bgGrey: ChalkInstance;

  readonly bgBlackBright: ChalkInstance;
  readonly bgRedBright: ChalkInstance;
  readonly bgGreenBright: ChalkInstance;
  readonly bgYellowBright: ChalkInstance;
  readonly bgBlueBright: ChalkInstance;
  readonly bgMagentaBright: ChalkInstance;
  readonly bgCyanBright: ChalkInstance;
  readonly bgWhiteBright: ChalkInstance;
}

export class Chalk {
  constructor(options?: Options) {
    // biome-ignore lint/correctness/noConstructorReturn: This constructor returns a ChalkInstance to match the original chalk API
    return chalkFactory(options);
  }
}

/**
 * Factory function to create a new Chalk instance.
 */
const chalkFactory = (options?: Options): ChalkInstance => {
  const chalk = ((...strings: unknown[]): string =>
    strings.join(" ")) as ChalkInstance;
  applyOptions(chalk, options);

  Object.setPrototypeOf(chalk, createChalk.prototype);

  return chalk;
};

/**
 * Create a Chalk prototype with the given options.
 */
function createChalk(options?: Options): ChalkInstance {
  return chalkFactory(options);
}

Object.setPrototypeOf(createChalk.prototype, Function.prototype);

// Define styles as getters on the prototype
for (const [styleName, style] of Object.entries(ansiStyles)) {
  if (
    styleName === "modifier" ||
    styleName === "color" ||
    styleName === "bgColor"
  ) {
    continue;
  }

  const styleObj = style as Style;
  styles[styleName] = {
    get(this: ChalkInstance): ChalkInstance {
      const builder = createBuilder(
        this,
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
        createStyler(styleObj.open, styleObj.close, (this as any)[STYLER]),
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
        (this as any)[IS_EMPTY],
      );
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for chalk compatibility
(styles as any)["visible"] = {
  get(this: ChalkInstance): ChalkInstance {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
    const builder = createBuilder(this, (this as any)[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  },
};

const getModelAnsi = (
  model: string,
  level: string,
  type: "color" | "bgColor",
  ...args: number[]
): string => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
      return (ansiStyles[type] as any).ansi16m(...args);
    }

    if (level === "ansi256") {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
      return (ansiStyles[type] as any).ansi256(
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
        (ansiStyles as any).rgbToAnsi256(...args),
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
    return (ansiStyles[type] as any).ansi(
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
      (ansiStyles as any).rgbToAnsi(...args),
    );
  }

  if (model === "hex") {
    return getModelAnsi(
      "rgb",
      level,
      type,
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
      ...(ansiStyles as any).hexToRgb(...args),
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for chalk compatibility
  return (ansiStyles[type] as any)[model](...args);
};

const usedModels = ["rgb", "hex", "ansi256"] as const;

for (const model of usedModels) {
  styles[model] = {
    get(this: ChalkInstance): (...args: number[]) => ChalkInstance {
      const { level } = this;
      return function (this: ChalkInstance, ...args: number[]): ChalkInstance {
        const styler = createStyler(
          // biome-ignore lint/style/noNonNullAssertion: Level is guaranteed to be valid for chalk compatibility
          getModelAnsi(model, levelMapping[level]!, "color", ...args),
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for chalk compatibility
          (ansiStyles.color as any).close,
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
          (this as any)[STYLER],
        );
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
        return createBuilder(this, styler, (this as any)[IS_EMPTY]);
      };
    },
  };

  // biome-ignore lint/style/noNonNullAssertion: Model string is guaranteed to be valid for chalk compatibility
  const bgModel = `bg${model[0]!.toUpperCase()}${model.slice(1)}` as const;
  styles[bgModel] = {
    get(this: ChalkInstance): (...args: number[]) => ChalkInstance {
      const { level } = this;
      return function (this: ChalkInstance, ...args: number[]): ChalkInstance {
        const styler = createStyler(
          // biome-ignore lint/style/noNonNullAssertion: Level is guaranteed to be valid for chalk compatibility
          getModelAnsi(model, levelMapping[level]!, "bgColor", ...args),
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for chalk compatibility
          (ansiStyles.bgColor as any).close,
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
          (this as any)[STYLER],
        );
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
        return createBuilder(this, styler, (this as any)[IS_EMPTY]);
      };
    },
  };
}

const proto = Object.defineProperties(() => {}, {
  ...styles,
  level: {
    enumerable: true,
    get(this: ChalkInstance): number {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
      return (this as any)[GENERATOR].level;
    },
    set(this: ChalkInstance, level: number): void {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
      (this as any)[GENERATOR].level = level;
    },
  },
});

/**
 * Create a styler object for chaining styles.
 */
// biome-ignore lint/suspicious/noExplicitAny: Dynamic parent type needed for chalk compatibility
const createStyler = (open: string, close: string, parent?: any): any => {
  let openAll: string;
  let closeAll: string;
  if (parent === undefined) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }

  return {
    open,
    close,
    openAll,
    closeAll,
    parent,
  };
};

/**
 * Create a builder function for applying styles.
 */
const createBuilder = (
  self: ChalkInstance,
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic styler type needed for chalk compatibility
  _styler: any,
  _isEmpty: boolean,
): ChalkInstance => {
  // Single argument is hot path, implicit coercion is faster than anything
  // eslint-disable-next-line no-implicit-coercion
  const builder = (...args: unknown[]): string =>
    applyStyle(
      builder as ChalkInstance,
      args.length === 1 ? `${args[0]}` : args.join(" "),
    );

  // We alter the prototype because we must return a function, but there is
  // no way to create a function with a different prototype
  Object.setPrototypeOf(builder, proto);

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for chalk compatibility
  (builder as any)[GENERATOR] = self;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for chalk compatibility
  (builder as any)[STYLER] = _styler;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for chalk compatibility
  (builder as any)[IS_EMPTY] = _isEmpty;

  return builder as ChalkInstance;
};

/**
 * Apply the style to the string.
 */
const applyStyle = (self: ChalkInstance, stringParam: string): string => {
  let string = stringParam;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for chalk compatibility
  if ((self as any).level <= 0 || !string) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
    return (self as any)[IS_EMPTY] ? "" : string;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for chalk compatibility
  let styler = (self as any)[STYLER];

  if (styler === undefined) {
    return string;
  }

  const { openAll, closeAll } = styler;
  if (string.includes("\u001B")) {
    while (styler !== undefined) {
      // Replace any instances already present with a re-opening code
      // otherwise only the part of the string until said closing code
      // will be colored, and the rest will simply be 'plain'.
      string = stringReplaceAll(string, styler.close, styler.open);

      styler = styler.parent;
    }
  }

  // We can move both next actions out of loop, because remaining actions in loop won't have
  // any/visible effect on parts we add here. Close the styling before a linebreak and reopen
  // after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCrlfWithFirstIndex(string, closeAll, openAll, lfIndex);
  }

  return openAll + string + closeAll;
};

// Utility functions from utilities.js (integrated here for self-containment)
function stringReplaceAll(
  string: string,
  substring: string,
  replacer: string,
): string {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }

  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);

  returnValue += string.slice(endIndex);
  return returnValue;
}

function stringEncaseCrlfWithFirstIndex(
  string: string,
  prefix: string,
  postfix: string,
  indexParam: number,
): string {
  let index = indexParam;
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCr = string[index - 1] === "\r";
    returnValue +=
      string.slice(endIndex, gotCr ? index - 1 : index) +
      prefix +
      (gotCr ? "\r\n" : "\n") +
      postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);

  returnValue += string.slice(endIndex);
  return returnValue;
}

Object.defineProperties(createChalk.prototype, styles);

const chalk = createChalk();
export const chalkStderr = createChalk({
  level: stderrColor ? stderrColor.level : 0,
});

export { createChalk };
export default chalk;
