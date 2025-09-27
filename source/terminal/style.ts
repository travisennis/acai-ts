// Converted from https://raw.githubusercontent.com/chalk/chalk/refs/heads/main/source/vendor/supports-color/index.js to modern TypeScript
// Renamed from chalk to style for internal use

import type { AnsiStyle } from "./ansi-styles.ts";
import { ansiStyles } from "./ansi-styles.ts";
import { supportsColor } from "./supports-color.ts";

const { stdout: stdoutColor } = supportsColor;

const GENERATOR = Symbol("GENERATOR");
const STYLER = Symbol("STYLER");
const IS_EMPTY = Symbol("IS_EMPTY");

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = ["ansi", "ansi", "ansi256", "ansi16m"] as const;

const styles = Object.create(null) as Record<string, PropertyDescriptor>;

// biome-ignore lint/suspicious/noExplicitAny: Dynamic object assignment needed for style compatibility
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

interface Options {
  /**
   * Specify the color support for Style.
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

export interface StyleInstance {
  (...text: unknown[]): string;

  /**
   * The color support for Style.
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
   * import { style } from './terminal/style';
   *
   * style.rgb(222, 173, 237)('Hello');
   * //=> '\u001B[38;2;222;173;237mHello\u001B[39m'
   * ```
   */
  rgb: (red: number, green: number, blue: number) => StyleInstance;

  /**
   * Use HEX value to set text color.
   *
   * @param color - Hexadecimal value representing the desired color.
   *
   * @example
   * ```
   * import { style } from './terminal/style';
   *
   * style.hex('#DEADED')('Hello');
   * //=> '\u001B[38;2;222;173;237mHello\u001B[39m'
   * ```
   */
  hex: (color: string) => StyleInstance;

  /**
   * Use an [8-bit unsigned number](https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit) to set text color.
   *
   * @example
   * ```
   * import { style } from './terminal/style';
   *
   * style.ansi256(201)('Hello');
   * //=> '\u001B[38;5;201mHello\u001B[39m'
   * ```
   */
  ansi256: (index: number) => StyleInstance;

  /**
   * Use RGB values to set background color.
   *
   * @example
   * ```
   * import { style } from './terminal/style';
   *
   * style.bgRgb(222, 173, 237)('Hello');
   * //=> '\u001B[48;2;222;173;237mHello\u001B[49m'
   * ```
   */
  bgRgb: (red: number, green: number, blue: number) => StyleInstance;

  /**
   * Use HEX value to set background color.
   *
   * @param color - Hexadecimal value representing the desired color.
   *
   * @example
   * ```
   * import { style } from './terminal/style';
   *
   * style.bgHex('#DEADED')('Hello');
   * //=> '\u001B[48;2;222;173;237mHello\u001B[49m'
   * ```
   */
  bgHex: (color: string) => StyleInstance;

  /**
   * Use a [8-bit unsigned number](https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit) to set background color.
   *
   * @example
   * ```
   * import { style } from './terminal/style';
   *
   * style.bgAnsi256(201)('Hello');
   * //=> '\u001B[48;5;201mHello\u001B[49m'
   * ```
   */
  bgAnsi256: (index: number) => StyleInstance;

  /**
   * Modifier: Reset the current style.
   */
  readonly reset: StyleInstance;

  /**
   * Modifier: Make the text bold.
   */
  readonly bold: StyleInstance;

  /**
   * Modifier: Make the text have lower opacity.
   */
  readonly dim: StyleInstance;

  /**
   * Modifier: Make the text italic. *(Not widely supported)*
   */
  readonly italic: StyleInstance;

  /**
   * Modifier: Put a horizontal line below the text. *(Not widely supported)*
   */
  readonly underline: StyleInstance;

  /**
   * Modifier: Put a horizontal line above the text. *(Not widely supported)*
   */
  readonly overline: StyleInstance;

  /**
   * Modifier: Invert background and foreground colors.
   */
  readonly inverse: StyleInstance;

  /**
   * Modifier: Print the text but make it invisible.
   */
  readonly hidden: StyleInstance;

  /**
   * Modifier: Puts a horizontal line through the center of the text. *(Not widely supported)*
   */
  readonly strikethrough: StyleInstance;

  /**
   * Modifier: Print the text only when Style has a color level above zero.
   *
   * Can be useful for things that are purely cosmetic.
   */
  readonly visible: StyleInstance;

  readonly black: StyleInstance;
  readonly red: StyleInstance;
  readonly green: StyleInstance;
  readonly yellow: StyleInstance;
  readonly blue: StyleInstance;
  readonly magenta: StyleInstance;
  readonly cyan: StyleInstance;
  readonly white: StyleInstance;

  /*
   * Alias for `blackBright`.
   */
  readonly gray: StyleInstance;

  /*
   * Alias for `blackBright`.
   */
  readonly grey: StyleInstance;

  readonly blackBright: StyleInstance;
  readonly redBright: StyleInstance;
  readonly greenBright: StyleInstance;
  readonly yellowBright: StyleInstance;
  readonly blueBright: StyleInstance;
  readonly magentaBright: StyleInstance;
  readonly cyanBright: StyleInstance;
  readonly whiteBright: StyleInstance;

  readonly bgBlack: StyleInstance;
  readonly bgRed: StyleInstance;
  readonly bgGreen: StyleInstance;
  readonly bgYellow: StyleInstance;
  readonly bgBlue: StyleInstance;
  readonly bgMagenta: StyleInstance;
  readonly bgCyan: StyleInstance;
  readonly bgWhite: StyleInstance;

  /*
   * Alias for `bgBlackBright`.
   */
  readonly bgGray: StyleInstance;

  /*
   * Alias for `bgBlackBright`.
   */
  readonly bgGrey: StyleInstance;

  readonly bgBlackBright: StyleInstance;
  readonly bgRedBright: StyleInstance;
  readonly bgGreenBright: StyleInstance;
  readonly bgYellowBright: StyleInstance;
  readonly bgBlueBright: StyleInstance;
  readonly bgMagentaBright: StyleInstance;
  readonly bgCyanBright: StyleInstance;
  readonly bgWhiteBright: StyleInstance;
}

/**
 * Factory function to create a new Style instance.
 */
const styleFactory = (options?: Options): StyleInstance => {
  const style = ((...strings: unknown[]): string =>
    strings.join(" ")) as StyleInstance;
  applyOptions(style, options);

  Object.setPrototypeOf(style, createStyle.prototype);

  return style;
};

/**
 * Create a Style prototype with the given options.
 */
function createStyle(options?: Options): StyleInstance {
  return styleFactory(options);
}

Object.setPrototypeOf(createStyle.prototype, Function.prototype);

// Define styles as getters on the prototype
for (const [styleName, style] of Object.entries(ansiStyles)) {
  if (
    styleName === "modifier" ||
    styleName === "color" ||
    styleName === "bgColor"
  ) {
    continue;
  }

  const styleObj = style as AnsiStyle;
  styles[styleName] = {
    get(this: StyleInstance): StyleInstance {
      const builder = createBuilder(
        this,
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
        createStyler(styleObj.open, styleObj.close, (this as any)[STYLER]),
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
        (this as any)[IS_EMPTY],
      );
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Dynamic property assignment needed for style compatibility
(styles as any)["visible"] = {
  get(this: StyleInstance): StyleInstance {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
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
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
      return (ansiStyles[type] as any).ansi16m(...args);
    }

    if (level === "ansi256") {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
      return (ansiStyles[type] as any).ansi256(
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
        (ansiStyles as any).rgbToAnsi256(...args),
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
    return (ansiStyles[type] as any).ansi(
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
      (ansiStyles as any).rgbToAnsi(...args),
    );
  }

  if (model === "hex") {
    return getModelAnsi(
      "rgb",
      level,
      type,
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
      ...(ansiStyles as any).hexToRgb(...args),
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic method access needed for style compatibility
  return (ansiStyles[type] as any)[model](...args);
};

const usedModels = ["rgb", "hex", "ansi256"] as const;

for (const model of usedModels) {
  styles[model] = {
    get(this: StyleInstance): (...args: number[]) => StyleInstance {
      const { level } = this;
      return function (this: StyleInstance, ...args: number[]): StyleInstance {
        const styler = createStyler(
          // biome-ignore lint/style/noNonNullAssertion: Level is guaranteed to be valid for style compatibility
          getModelAnsi(model, levelMapping[level]!, "color", ...args),
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for style compatibility
          (ansiStyles.color as any).close,
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
          (this as any)[STYLER],
        );
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
        return createBuilder(this, styler, (this as any)[IS_EMPTY]);
      };
    },
  };

  // biome-ignore lint/style/noNonNullAssertion: Model string is guaranteed to be valid for style compatibility
  const bgModel = `bg${model[0]!.toUpperCase()}${model.slice(1)}` as const;
  styles[bgModel] = {
    get(this: StyleInstance): (...args: number[]) => StyleInstance {
      const { level } = this;
      return function (this: StyleInstance, ...args: number[]): StyleInstance {
        const styler = createStyler(
          // biome-ignore lint/style/noNonNullAssertion: Level is guaranteed to be valid for style compatibility
          getModelAnsi(model, levelMapping[level]!, "bgColor", ...args),
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for style compatibility
          (ansiStyles.bgColor as any).close,
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
          (this as any)[STYLER],
        );
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
        return createBuilder(this, styler, (this as any)[IS_EMPTY]);
      };
    },
  };
}

const proto = Object.defineProperties(() => {}, {
  ...styles,
  level: {
    enumerable: true,
    get(this: StyleInstance): number {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
      return (this as any)[GENERATOR].level;
    },
    set(this: StyleInstance, level: number): void {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
      (this as any)[GENERATOR].level = level;
    },
  },
});

/**
 * Create a styler object for chaining styles.
 */
// biome-ignore lint/suspicious/noExplicitAny: Dynamic parent type needed for style compatibility
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
  self: StyleInstance,
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic styler type needed for style compatibility
  _styler: any,
  _isEmpty: boolean,
): StyleInstance => {
  // Single argument is hot path, implicit coercion is faster than anything
  // eslint-disable-next-line no-implicit-coercion
  const builder = (...args: unknown[]): string =>
    applyStyle(
      builder as StyleInstance,
      args.length === 1 ? `${args[0]}` : args.join(" "),
    );

  // We alter the prototype because we must return a function, but there is
  // no way to create a function with a different prototype
  Object.setPrototypeOf(builder, proto);

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for style compatibility
  (builder as any)[GENERATOR] = self;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for style compatibility
  (builder as any)[STYLER] = _styler;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol assignment needed for style compatibility
  (builder as any)[IS_EMPTY] = _isEmpty;

  return builder as StyleInstance;
};

/**
 * Apply the style to the string.
 */
const applyStyle = (self: StyleInstance, stringParam: string): string => {
  let string = stringParam;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic property access needed for style compatibility
  if ((self as any).level <= 0 || !string) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
    return (self as any)[IS_EMPTY] ? "" : string;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic symbol access needed for style compatibility
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

Object.defineProperties(createStyle.prototype, styles);

const style = createStyle();

export { createStyle };
export default style;
