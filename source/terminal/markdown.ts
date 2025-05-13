import { EOL } from "node:os";
import chalk from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";
import { type Token, marked } from "marked";
import { logger } from "../logger.ts";

function logError(msg: string) {
  logger.error(msg);
}

export function applyMarkdown(content: string): string {
  return marked
    .lexer(content)
    .map((token) => format(token))
    .join("")
    .trim();
}

function format(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  switch (token.type) {
    case "blockquote":
      return chalk.dim.italic(
        (token.tokens ?? []).map((_) => format(_)).join(""),
      );
    case "code": {
      if (token.lang && supportsLanguage(token.lang)) {
        return highlight(token.text, { language: token.lang }) + EOL;
      }
      logError(
        `Language not supported while highlighting code, falling back to markdown: ${token.lang}`,
      );
      return highlight(token.text, { language: "markdown" }) + EOL;
    }
    case "codespan":
      // inline code
      return chalk.blue(token.text);
    case "em":
      return chalk.italic((token.tokens ?? []).map((_) => format(_)).join(""));
    case "strong":
      return chalk.bold((token.tokens ?? []).map((_) => format(_)).join(""));
    case "heading":
      switch (token.depth) {
        case 1: // h1
          return (
            chalk.bold.italic.underline(
              (token.tokens ?? []).map((_) => format(_)).join(""),
            ) +
            EOL +
            EOL
          );
        case 2: // h2
          return (
            chalk.bold((token.tokens ?? []).map((_) => format(_)).join("")) +
            EOL +
            EOL
          );
        default: // h3+
          return (
            chalk.bold.dim(
              (token.tokens ?? []).map((_) => format(_)).join(""),
            ) +
            EOL +
            EOL
          );
      }
    case "hr":
      return "---";
    case "image":
      return `[Image: ${token.title}: ${token.href}]`;
    case "link":
      return chalk.blue(token.href);
    case "list": {
      return token.items
        .map((_: Token, index: number) =>
          format(
            _,
            listDepth,
            token.ordered ? token.start + index : null,
            token,
          ),
        )
        .join("");
    }
    case "list_item":
      return (token.tokens ?? [])
        .map(
          (_) =>
            `${"  ".repeat(listDepth)}${format(_, listDepth + 1, orderedListNumber, token)}`,
        )
        .join("");
    case "paragraph":
      return (token.tokens ?? []).map((_) => format(_)).join("") + EOL;
    case "space":
      return EOL;
    case "text": {
      if (parent?.type === "list_item") {
        return `${orderedListNumber === null ? "-" : `${getListNumber(listDepth, orderedListNumber)}.`} ${token.tokens ? token.tokens.map((_) => format(_, listDepth, orderedListNumber, token)).join("") : token.text}${EOL}`;
      }
      return token.text;
    }
    default:
      return "";
  }
  // TODO: tables
}

const DEPTH_1_LIST_NUMBERS = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "aa",
  "ab",
  "ac",
  "ad",
  "ae",
  "af",
  "ag",
  "ah",
  "ai",
  "aj",
  "ak",
  "al",
  "am",
  "an",
  "ao",
  "ap",
  "aq",
  "ar",
  "as",
  "at",
  "au",
  "av",
  "aw",
  "ax",
  "ay",
  "az",
];
const DEPTH_2_LIST_NUMBERS = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
  "xiii",
  "xiv",
  "xv",
  "xvi",
  "xvii",
  "xviii",
  "xix",
  "xx",
  "xxi",
  "xxii",
  "xxiii",
  "xxiv",
  "xxv",
  "xxvi",
  "xxvii",
  "xxviii",
  "xxix",
  "xxx",
  "xxxi",
  "xxxii",
  "xxxiii",
  "xxxiv",
  "xxxv",
  "xxxvi",
  "xxxvii",
  "xxxviii",
  "xxxix",
  "xl",
];

function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString();
    case 2:
      return DEPTH_1_LIST_NUMBERS[orderedListNumber - 1] ?? "x"; // TODO: don't hard code the list
    case 3:
      return DEPTH_2_LIST_NUMBERS[orderedListNumber - 1] ?? "x"; // TODO: don't hard code the list
    default:
      return orderedListNumber.toString();
  }
}
