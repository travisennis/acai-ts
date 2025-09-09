import { EOL } from "node:os";
import Table from "cli-table3";
import { marked, type Token } from "marked";
import { logger } from "../logger.ts";
import chalk from "./chalk.ts";
import { DEFAULT_THEME } from "./default-theme.ts";
import { link as terminalLink } from "./formatting.ts";
import { highlight, supportsLanguage } from "./highlight/index.ts";
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
        (token.tokens ?? [])
          .map((_) => format(_))
          .map((l) => `  ${l}`)
          .join(""),
      );
    case "code": {
      if (token.lang && supportsLanguage(token.lang)) {
        return (
          highlight(token.text, {
            language: token.lang,
            theme: DEFAULT_THEME,
          }) + EOL
        );
      }
      logError(
        `Language not supported while highlighting code, falling back to markdown: ${token.lang}`,
      );
      return (
        highlight(token.text, { language: "markdown", theme: DEFAULT_THEME }) +
        EOL
      );
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
    case "image": {
      const alt = (token.title ?? token.text ?? "").toString().trim();
      if (alt.length > 0) {
        return `[Image: ${alt} (${token.href})]`;
      }
      return `[Image: ${token.href}]`;
    }
    case "link":
      return terminalLink(token.text, token.href);
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
      const availableWidth = Math.max(
        10,
        (process.stdout.columns || 80) - padding,
      );
      const colCount = header?.length ?? 1;
      const width = Math.max(
        10,
        Math.floor(availableWidth / Math.max(1, colCount)),
      );
      const computedColWidths: number[] = new Array(colCount).fill(width);

      const table = new Table({
        head: header.map((h) => h.text),
        colWidths: computedColWidths,
        wordWrap: true, // Enable word wrapping for the description column
      });

      table.push(
        ...rows.map((row) => row.map((c: { text: string }) => c.text)),
      );

      return `${table.toString()}\n`;
    }
    case "del": {
      return chalk.strikethrough(token.text);
    }
    default:
      return "";
  }
}
