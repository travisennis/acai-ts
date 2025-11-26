import stringWidth from "../string-width.ts";

type CharName =
  | "top"
  | "topMid"
  | "topLeft"
  | "topRight"
  | "bottom"
  | "bottomMid"
  | "bottomLeft"
  | "bottomRight"
  | "left"
  | "leftMid"
  | "mid"
  | "midMid"
  | "right"
  | "rightMid"
  | "middle";

type HorizontalAlignment = "left" | "center" | "right";
type VerticalAlignment = "top" | "center" | "bottom";

interface TableOptions {
  truncate: string;
  colWidths: Array<number | null>;
  rowHeights: Array<number | null>;
  colAligns: HorizontalAlignment[];
  rowAligns: VerticalAlignment[];
  head: Cell[];
  wordWrap: boolean;
  wrapOnWordBoundary: boolean;
  textWrap?: boolean; // Legacy property name for wordWrap
}

interface TableInstanceOptions extends TableOptions {
  chars: Record<CharName, string>;
  style: {
    "padding-left": number;
    "padding-right": number;
    head: string[];
    border: string[];
    compact: boolean;
  };
  debug?: boolean | number | string;
}

interface TableConstructorOptions extends Partial<TableOptions> {
  chars?: Partial<Record<CharName, string>>;
  style?: Partial<TableInstanceOptions["style"]>;
}

type CellValue = boolean | number | bigint | string | null | undefined;

interface CellOptions {
  content: CellValue;
  chars?: Partial<Record<CharName, string>>;
  truncate?: string;
  colSpan?: number;
  rowSpan?: number;
  hAlign?: HorizontalAlignment;
  vAlign?: VerticalAlignment;
  wordWrap?: boolean;
  wrapOnWordBoundary?: boolean;
  href?: string;
  style?: {
    "padding-left"?: number;
    "padding-right"?: number;
    head?: string[];
    border?: string[];
  };
}

type Cell = CellValue | CellOptions;

interface CodeCacheEntry {
  set: string;
  to: boolean;
}

interface CodeCache {
  [key: string]: CodeCacheEntry | { on: string; off: string };
}

function codeRegex(capture: boolean): RegExp {
  return capture
    ? // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences for terminal formatting
      /\u001b\[((?:\d*;){0,5}\d*)m/g
    : // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences for terminal formatting
      /\u001b\[(?:\d*;){0,5}\d*m/g;
}

export function strlen(str: string): number {
  const code = codeRegex(false);
  const stripped = `${str}`.replace(code, "");
  const split = stripped.split("\n");
  return split.reduce((memo: number, s: string) => {
    return stringWidth(s) > memo ? stringWidth(s) : memo;
  }, 0);
}

export function repeat(str: string, times: number): string {
  return Array(times + 1).join(str);
}

export function pad(
  str: string,
  len: number,
  padChar: string,
  dir: HorizontalAlignment,
): string {
  const length = strlen(str);
  let result = str;
  if (len + 1 >= length) {
    const padlen = len - length;
    switch (dir) {
      case "right": {
        result = repeat(padChar, padlen) + result;
        break;
      }
      case "center": {
        const right = Math.ceil(padlen / 2);
        const left = padlen - right;
        result = repeat(padChar, left) + result + repeat(padChar, right);
        break;
      }
      default: {
        result = result + repeat(padChar, padlen);
        break;
      }
    }
  }
  return result;
}

const codeCache: CodeCache = {};

function addToCodeCache(name: string, on: string, off: string): void {
  const onCode = `\u001b[${on}m`;
  const offCode = `\u001b[${off}m`;
  codeCache[onCode] = { set: name, to: true };
  codeCache[offCode] = { set: name, to: false };
  codeCache[name] = { on: onCode, off: offCode };
}

// https://github.com/Marak/colors.js/blob/master/lib/styles.js
addToCodeCache("bold", "1", "22");
addToCodeCache("italics", "3", "23");
addToCodeCache("underline", "4", "24");
addToCodeCache("inverse", "7", "27");
addToCodeCache("strikethrough", "9", "29");

interface State {
  [key: string]: boolean | string | undefined;
  lastForegroundAdded?: string;
  lastBackgroundAdded?: string;
}

function updateState(state: State, controlChars: RegExpExecArray): void {
  const controlCode = controlChars[1]
    ? Number.parseInt(controlChars[1].split(";")[0], 10)
    : 0;
  if (
    (controlCode >= 30 && controlCode <= 39) ||
    (controlCode >= 90 && controlCode <= 97)
  ) {
    state.lastForegroundAdded = controlChars[0];
    return;
  }
  if (
    (controlCode >= 40 && controlCode <= 49) ||
    (controlCode >= 100 && controlCode <= 107)
  ) {
    state.lastBackgroundAdded = controlChars[0];
    return;
  }
  if (controlCode === 0) {
    for (const i in state) {
      /* istanbul ignore else */
      if (Object.hasOwn(state, i)) {
        delete state[i];
      }
    }
    return;
  }
  const info = codeCache[controlChars[0]] as CodeCacheEntry;
  if (info) {
    state[info.set] = info.to;
  }
}

function readState(line: string): State {
  const code = codeRegex(true);
  let controlChars = code.exec(line);
  const state: State = {};
  while (controlChars !== null) {
    updateState(state, controlChars);
    controlChars = code.exec(line);
  }
  return state;
}

function unwindState(state: State, ret: string): string {
  const lastBackgroundAdded = state.lastBackgroundAdded;
  const lastForegroundAdded = state.lastForegroundAdded;

  delete state.lastBackgroundAdded;
  delete state.lastForegroundAdded;

  let result = ret;
  Object.keys(state).forEach((key) => {
    if (state[key]) {
      const cacheEntry = codeCache[key] as { off: string };
      result += cacheEntry.off;
    }
  });

  if (lastBackgroundAdded && lastBackgroundAdded !== "\u001b[49m") {
    result += "\u001b[49m";
  }
  if (lastForegroundAdded && lastForegroundAdded !== "\u001b[39m") {
    result += "\u001b[39m";
  }

  return result;
}

function rewindState(state: State, ret: string): string {
  const lastBackgroundAdded = state.lastBackgroundAdded;
  const lastForegroundAdded = state.lastForegroundAdded;

  delete state.lastBackgroundAdded;
  delete state.lastForegroundAdded;

  let result = ret;
  Object.keys(state).forEach((key) => {
    if (state[key]) {
      const cacheEntry = codeCache[key] as { on: string };
      result = cacheEntry.on + result;
    }
  });

  if (lastBackgroundAdded && lastBackgroundAdded !== "\u001b[49m") {
    result = lastBackgroundAdded + result;
  }
  if (lastForegroundAdded && lastForegroundAdded !== "\u001b[39m") {
    result = lastForegroundAdded + result;
  }

  return result;
}

function truncateWidth(str: string, desiredLength: number): string {
  if (str.length === strlen(str)) {
    return str.substr(0, desiredLength);
  }

  let result = str;
  while (strlen(result) > desiredLength) {
    result = result.slice(0, -1);
  }

  return result;
}

function truncateWidthWithAnsi(str: string, desiredLength: number): string {
  const code = codeRegex(true);
  const split = str.split(codeRegex(false));
  let splitIndex = 0;
  let retLen = 0;
  let ret = "";
  let myArray: RegExpExecArray | null;
  const state: State = {};

  while (retLen < desiredLength) {
    myArray = code.exec(str);
    let toAdd = split[splitIndex];
    splitIndex++;
    if (retLen + strlen(toAdd) > desiredLength) {
      toAdd = truncateWidth(toAdd, desiredLength - retLen);
    }
    ret += toAdd;
    retLen += strlen(toAdd);

    if (retLen < desiredLength) {
      if (!myArray) {
        break;
      } // full-width chars may cause a whitespace which cannot be filled
      ret += myArray[0];
      updateState(state, myArray);
    }
  }

  return unwindState(state, ret);
}

export function truncate(
  str: string,
  desiredLength: number,
  truncateChar?: string,
): string {
  const finalTruncateChar = truncateChar || "…";
  const lengthOfStr = strlen(str);
  if (lengthOfStr <= desiredLength) {
    return str;
  }
  const finalDesiredLength = desiredLength - strlen(finalTruncateChar);

  let ret = truncateWidthWithAnsi(str, finalDesiredLength);

  ret += finalTruncateChar;

  const hrefTag = "\x1B]8;;\x07";

  if (str.includes(hrefTag) && !ret.includes(hrefTag)) {
    ret += hrefTag;
  }

  return ret;
}

export function defaultOptions(): TableInstanceOptions {
  return {
    chars: {
      top: "─",
      topMid: "┬",
      topLeft: "┌",
      topRight: "┐",
      bottom: "─",
      bottomMid: "┴",
      bottomLeft: "└",
      bottomRight: "┘",
      left: "│",
      leftMid: "├",
      mid: "─",
      midMid: "┼",
      right: "│",
      rightMid: "┤",
      middle: "│",
    },
    truncate: "…",
    colWidths: [],
    rowHeights: [],
    colAligns: [],
    rowAligns: [],
    style: {
      "padding-left": 1,
      "padding-right": 1,
      head: ["red"],
      border: ["grey"],
      compact: false,
    },
    head: [],
    wordWrap: false,
    wrapOnWordBoundary: true,
  };
}

export function mergeOptions(
  options?: Partial<TableConstructorOptions>,
  defaults?: TableInstanceOptions,
): TableInstanceOptions {
  const finalOptions = options || {};
  const finalDefaults = defaults || defaultOptions();
  const ret = Object.assign({}, finalDefaults, finalOptions);
  ret.chars = Object.assign({}, finalDefaults.chars, finalOptions.chars);
  ret.style = Object.assign({}, finalDefaults.style, finalOptions.style);
  return ret;
}

// Wrap on word boundary
function wordWrap(maxLength: number, input: string): string[] {
  const lines: string[] = [];
  const split = input.split(/(\s+)/g);
  const line: string[] = [];
  let lineLength = 0;
  let whitespace = "";
  for (let i = 0; i < split.length; i += 2) {
    const word = split[i];
    let newLength = lineLength + strlen(word);
    if (lineLength > 0 && whitespace) {
      newLength += whitespace.length;
    }
    if (newLength > maxLength) {
      if (lineLength !== 0) {
        lines.push(line.join(""));
      }
      line.length = 0;
      line.push(word);
      lineLength = strlen(word);
    } else {
      line.push(whitespace || "", word);
      lineLength = newLength;
    }
    whitespace = split[i + 1];
  }
  if (lineLength) {
    lines.push(line.join(""));
  }
  return lines;
}

// Wrap text (ignoring word boundaries)
function textWrap(maxLength: number, input: string): string[] {
  const lines: string[] = [];
  let line = "";
  function pushLine(str: string, ws: string): void {
    if (line.length && ws) line += ws;
    line += str;
    while (line.length > maxLength) {
      lines.push(line.slice(0, maxLength));
      line = line.slice(maxLength);
    }
  }
  const split = input.split(/(\s+)/g);
  for (let i = 0; i < split.length; i += 2) {
    pushLine(split[i], i ? split[i - 1] : "");
  }
  if (line.length) lines.push(line);
  return lines;
}

export function multiLineWordWrap(
  maxLength: number,
  input: string,
  wrapOnWordBoundary = true,
): string[] {
  const output: string[] = [];
  const lines = input.split("\n");
  const handler = wrapOnWordBoundary ? wordWrap : textWrap;
  for (let i = 0; i < lines.length; i++) {
    output.push(...handler(maxLength, lines[i]));
  }
  return output;
}

export function colorizeLines(input: string[]): string[] {
  let state: State = {};
  const output: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const line = rewindState(state, input[i]);
    state = readState(line);
    const temp = Object.assign({}, state);
    output.push(unwindState(temp, line));
  }
  return output;
}

/**
 * Credit: Matheus Sampaio https://github.com/matheussampaio
 */
export function hyperlink(url: string, text: string): string {
  const Osc = "\u001B]";
  const Bel = "\u0007";
  const Sep = ";";

  return [
    Osc,
    "8",
    Sep,
    Sep,
    url || text,
    Bel,
    text,
    Osc,
    "8",
    Sep,
    Sep,
    Bel,
  ].join("");
}

export type {
  CharName,
  HorizontalAlignment,
  VerticalAlignment,
  TableInstanceOptions,
  TableConstructorOptions,
  CellOptions,
  Cell,
};
