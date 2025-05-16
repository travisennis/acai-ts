import { EOL } from "node:os";
import chalk from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";
import Table from "cli-table3";
import { type Token, marked } from "marked";
import { logger } from "../logger.ts";
import { getListNumber } from "./markdown-utils.ts";

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
    case "table": {
      const header = Array.isArray(token.header)
        ? token.header
        : [token.header];
      const rows = Array.isArray(token.rows) ? token.rows : [token.rows];

      // Calculate column widths based on terminal width
      const padding = 5; // Account for table borders and padding
      const availableWidth = process.stdout.columns - padding;
      const colCount = header?.length ?? 1;
      const width = availableWidth / colCount;
      const computedColWidths: number[] = new Array(colCount).fill(width);

      const table = new Table({
        head: header,
        colWidths: computedColWidths,
        wordWrap: true, // Enable word wrapping for the description column
      });

      table.push(...rows);

      return table.toString();
    }
    default:
      return "";
  }
}
