import stringWidth from "./string-width.ts";
import stripAnsi from "./strip-ansi.ts";

interface WrapAnsiOptions {
  trim?: boolean;
  hard?: boolean;
  wordWrap?: boolean;
}

const ESCAPES = new Set(["\u001B", "\u009B"]);

const ANSI_ESCAPE_BELL = "\u0007";
const ANSI_CSI = "[";
const ANSI_OSC = "]";
const ANSI_SGR_TERMINATOR = "m";
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
const ANSI_REGEX_ESCAPE = "\u001B";

const wrapAnsiCode = (code: string | number): string =>
  `${ESCAPES.values().next().value}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;

const wrapAnsiHyperlink = (url: string): string =>
  `${ESCAPES.values().next().value}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;

// Calculate the length of words split on ' ', ignoring
// the extra characters added by ansi escape codes
const wordLengths = (string: string): number[] =>
  string.split(" ").map((character) => stringWidth(character));

// Check if character starts an ANSI escape sequence
const isEscapeStart = (character: string): boolean => ESCAPES.has(character);

// Check if this is the start of a hyperlink escape sequence
const isLinkEscapeStart = (characters: string[], index: number): boolean => {
  const candidate = characters
    .slice(index + 1, index + 1 + ANSI_ESCAPE_LINK.length)
    .join("");
  return candidate === ANSI_ESCAPE_LINK;
};

// Check if character ends an escape sequence
const isEscapeEnd = (
  character: string,
  isInsideLinkEscape: boolean,
): boolean => {
  if (isInsideLinkEscape) {
    return character === ANSI_ESCAPE_BELL;
  }
  return character === ANSI_SGR_TERMINATOR;
};

// Handle final row edge case (ANSI-only rows)
const handleFinalRowEdgeCase = (rows: string[], visible: number): void => {
  const lastRow = rows.at(-1);
  if (!visible && lastRow && lastRow.length > 0 && rows.length > 1) {
    const poppedRow = rows.pop();
    if (poppedRow) {
      rows[rows.length - 1] += poppedRow;
    }
  }
};

// Wrap a long word across multiple rows
// Ansi escape codes do not count towards length
const wrapWord = (rows: string[], word: string, columns: number): void => {
  const characters = [...word];

  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let visible = stringWidth(stripAnsi(rows.at(-1) ?? ""));

  for (const [index, character] of characters.entries()) {
    const characterLength = stringWidth(character);

    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }

    // Handle escape sequence detection
    if (isEscapeStart(character)) {
      isInsideEscape = true;
      isInsideLinkEscape = isLinkEscapeStart(characters, index);
    }

    // Process escape sequence
    if (isInsideEscape) {
      if (isEscapeEnd(character, isInsideLinkEscape)) {
        isInsideEscape = false;
        isInsideLinkEscape = false;
      }
      continue;
    }

    visible += characterLength;

    if (visible === columns && index < characters.length - 1) {
      rows.push("");
      visible = 0;
    }
  }

  handleFinalRowEdgeCase(rows, visible);
};

// Trims spaces from a string ignoring invisible sequences
const stringVisibleTrimSpacesRight = (string: string): string => {
  const words = string.split(" ");
  let last = words.length;

  while (last > 0) {
    if (stringWidth(words[last - 1]) > 0) {
      break;
    }

    last--;
  }

  if (last === words.length) {
    return string;
  }

  return words.slice(0, last).join(" ") + words.slice(last).join("");
};

type SgrSlot =
  | "intensity"
  | "italic"
  | "underline"
  | "overline"
  | "inverse"
  | "hidden"
  | "strikethrough"
  | "foreground"
  | "background";

interface ActiveSgr {
  open: string;
  close: string;
}

interface EscapeState {
  sgr: Map<SgrSlot, ActiveSgr>;
  escapeUrl: string | undefined;
}

const SGR_SLOT_BY_OPEN_CODE = new Map<number, SgrSlot>([
  [1, "intensity"],
  [2, "intensity"],
  [3, "italic"],
  [4, "underline"],
  [53, "overline"],
  [7, "inverse"],
  [8, "hidden"],
  [9, "strikethrough"],
]);

const CLOSE_CODE_BY_SLOT = new Map<SgrSlot, number>([
  ["intensity", 22],
  ["italic", 23],
  ["underline", 24],
  ["overline", 55],
  ["inverse", 27],
  ["hidden", 28],
  ["strikethrough", 29],
  ["foreground", 39],
  ["background", 49],
]);

const SLOT_BY_CLOSE_CODE = new Map<number, SgrSlot>(
  [...CLOSE_CODE_BY_SLOT.entries()].map(([slot, closeCode]) => [
    closeCode,
    slot,
  ]),
);

const isForegroundCode = (code: number): boolean =>
  (code >= 30 && code <= 37) || (code >= 90 && code <= 97);

const isBackgroundCode = (code: number): boolean =>
  (code >= 40 && code <= 47) || (code >= 100 && code <= 107);

const applySgrCode = (
  state: EscapeState,
  slot: SgrSlot,
  open: string,
): void => {
  const close = CLOSE_CODE_BY_SLOT.get(slot);
  if (close !== undefined) {
    state.sgr.set(slot, { open, close: wrapAnsiCode(close) });
  }
};

const applyExtendedColorCode = (
  state: EscapeState,
  codes: number[],
  index: number,
): number => {
  const code = codes[index];
  const mode = codes[index + 1];
  const parameterCount = mode === 2 ? 5 : mode === 5 ? 3 : 0;

  if ((code !== 38 && code !== 48) || parameterCount === 0) {
    return index;
  }

  const openCodes = codes.slice(index, index + parameterCount).join(";");
  applySgrCode(state, code === 38 ? "foreground" : "background", openCodes);
  return index + parameterCount - 1;
};

const applySgrCodeAt = (
  state: EscapeState,
  codes: number[],
  index: number,
): number => {
  const code = codes[index] ?? 0;

  if (code === 0) {
    state.sgr.clear();
    return index;
  }

  const closeSlot = SLOT_BY_CLOSE_CODE.get(code);
  if (closeSlot) {
    state.sgr.delete(closeSlot);
    return index;
  }

  const slot = SGR_SLOT_BY_OPEN_CODE.get(code);
  if (slot) {
    applySgrCode(state, slot, String(code));
    return index;
  }

  if (isForegroundCode(code)) {
    applySgrCode(state, "foreground", String(code));
    return index;
  }

  if (isBackgroundCode(code)) {
    applySgrCode(state, "background", String(code));
    return index;
  }

  return applyExtendedColorCode(state, codes, index);
};

const applySgrCodes = (state: EscapeState, rawCode: string): void => {
  const codes = rawCode.length === 0 ? [0] : rawCode.split(";").map(Number);

  for (let index = 0; index < codes.length; index++) {
    index = applySgrCodeAt(state, codes, index);
  }
};

/**
 * Parses an ANSI escape sequence from preString starting at the given index.
 */
function parseEscapeSequence(
  preString: string,
  preStringIndex: number,
  state: EscapeState,
): void {
  const rest = preString.slice(preStringIndex);
  const match = new RegExp(
    `^(?:${ANSI_REGEX_ESCAPE}\\${ANSI_CSI}(?<code>[\\d;]*)m|${ANSI_REGEX_ESCAPE}\\${ANSI_ESCAPE_LINK}(?<uri>.*?)${ANSI_ESCAPE_BELL})`,
  ).exec(rest);

  if (!match?.groups) {
    return;
  }

  const { groups } = match;
  if (groups["code"] !== undefined) {
    applySgrCodes(state, groups["code"]);
  } else if (groups["uri"] !== undefined) {
    state.escapeUrl = groups["uri"].length === 0 ? undefined : groups["uri"];
  }
}

const closeActiveEscapes = (state: EscapeState): string =>
  `${state.escapeUrl ? wrapAnsiHyperlink("") : ""}${[...state.sgr.values()]
    .toReversed()
    .map(({ close }) => close)
    .join("")}`;

const openActiveEscapes = (state: EscapeState): string =>
  `${[...state.sgr.values()]
    .map(({ open }) => wrapAnsiCode(open))
    .join("")}${state.escapeUrl ? wrapAnsiHyperlink(state.escapeUrl) : ""}`;

const processAnsiEscapes = (pre: string[], preString: string): string => {
  let returnValue = "";
  const state: EscapeState = { sgr: new Map(), escapeUrl: undefined };
  let preStringIndex = 0;

  for (const [index, character] of pre.entries()) {
    returnValue += character;

    if (ESCAPES.has(character)) {
      parseEscapeSequence(preString, preStringIndex, state);
    }

    if (pre[index + 1] === "\n") {
      returnValue += closeActiveEscapes(state);
    } else if (character === "\n") {
      returnValue += openActiveEscapes(state);
    }

    preStringIndex += character.length;
  }

  return returnValue;
};

// Determines if a new row should be started based on current row state
const shouldStartNewRow = (
  rowLength: number,
  columns: number,
  options: WrapAnsiOptions,
): boolean =>
  rowLength >= columns &&
  (options.wordWrap === false || options.trim === false);

// Adds a space between words if needed
const addWordSpacing = (
  rows: string[],
  rowLength: number,
  options: WrapAnsiOptions,
): number => {
  if (rowLength > 0 || options.trim === false) {
    rows[rows.length - 1] += " ";
    return rowLength + 1;
  }
  return rowLength;
};

// Handles hard wrap mode where words cannot exceed column width
const handleHardWrap = (
  rows: string[],
  word: string,
  wordLength: number,
  rowLength: number,
  columns: number,
): boolean => {
  if (wordLength <= columns) {
    return false;
  }

  const remainingColumns = columns - rowLength;
  const breaksStartingThisLine =
    1 + Math.floor((wordLength - remainingColumns - 1) / columns);
  const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
  if (breaksStartingNextLine < breaksStartingThisLine) {
    rows.push("");
  }

  wrapWord(rows, word, columns);
  return true;
};

// Handles soft wrap mode for normal word wrapping
const handleSoftWrap = (
  rows: string[],
  word: string,
  wordLength: number,
  rowLength: number,
  columns: number,
  options: WrapAnsiOptions,
): boolean => {
  const totalLength = rowLength + wordLength;

  if (totalLength > columns && rowLength > 0 && wordLength > 0) {
    if (options.wordWrap === false && rowLength < columns) {
      wrapWord(rows, word, columns);
      return true;
    }
    rows.push("");
  }

  if (totalLength > columns && options.wordWrap === false) {
    wrapWord(rows, word, columns);
    return true;
  }

  return false;
};

// Process a single word and update rows accordingly
const processWord = (
  rows: string[],
  word: string,
  wordLength: number,
  index: number,
  columns: number,
  options: WrapAnsiOptions,
): number => {
  if (options.trim !== false) {
    rows[rows.length - 1] = rows.at(-1)?.trimStart() ?? "";
  }

  let rowLength = stringWidth(rows.at(-1) ?? "");

  if (index !== 0) {
    if (shouldStartNewRow(rowLength, columns, options)) {
      rows.push("");
      rowLength = 0;
    }

    rowLength = addWordSpacing(rows, rowLength, options);
  }

  if (options.hard) {
    if (handleHardWrap(rows, word, wordLength, rowLength, columns)) {
      return -1;
    }
  }

  if (handleSoftWrap(rows, word, wordLength, rowLength, columns, options)) {
    return -1;
  }

  rows[rows.length - 1] += word;
  return stringWidth(rows.at(-1) ?? "");
};

// The wrap-ansi module can be invoked in either 'hard' or 'soft' wrap mode.
//
// 'hard' will never allow a string to take up more than columns characters.
//
// 'soft' allows long words to expand past the column length.
const exec = (
  string: string,
  columns: number,
  options: WrapAnsiOptions = {},
): string => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }

  const lengths = wordLengths(string);
  const words = string.split(" ");
  let rows: string[] = [""];

  for (const [index, word] of words.entries()) {
    processWord(rows, word, lengths[index], index, columns, options);
  }

  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }

  const preString = rows.join("\n");
  const pre = [...preString];

  return processAnsiEscapes(pre, preString);
};

// For each newline, invoke the method separately
export default function wrapAnsi(
  string: string,
  columns: number,
  options?: WrapAnsiOptions,
): string {
  return String(string)
    .normalize()
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => exec(line, columns, options))
    .join("\n");
}
