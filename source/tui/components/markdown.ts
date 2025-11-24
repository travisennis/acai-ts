import Table from "cli-table3";
import { marked, type Token } from "marked";
import { DEFAULT_THEME } from "../../terminal/default-theme.ts";
import { highlight, supportsLanguage } from "../../terminal/highlight/index.ts";
import { getListNumber } from "../../terminal/markdown-utils.ts";
import style from "../../terminal/style.ts";
import wrapAnsi from "../../terminal/wrap-ansi.ts";
import type { Component } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "bgBlack"
  | "bgRed"
  | "bgGreen"
  | "bgYellow"
  | "bgBlue"
  | "bgMagenta"
  | "bgCyan"
  | "bgWhite"
  | "bgGray";

export class Markdown implements Component {
  private text: string;
  private bgColor?: Color;
  private fgColor?: Color;
  private customBgRgb?: { r: number; g: number; b: number };
  private paddingX: number; // Left/right padding
  private paddingY: number; // Top/bottom padding

  // Cache for rendered output
  private cachedText?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    text = "",
    bgColor?: Color,
    fgColor?: Color,
    customBgRgb?: { r: number; g: number; b: number },
    paddingX = 1,
    paddingY = 1,
  ) {
    this.text = text;
    this.bgColor = bgColor;
    this.fgColor = fgColor;
    this.customBgRgb = customBgRgb;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
  }

  setText(text: string): void {
    this.text = text;
    // Invalidate cache when text changes
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  setBgColor(bgColor?: Color): void {
    this.bgColor = bgColor;
    // Invalidate cache when color changes
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  setFgColor(fgColor?: Color): void {
    this.fgColor = fgColor;
    // Invalidate cache when color changes
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  setCustomBgRgb(customBgRgb?: { r: number; g: number; b: number }): void {
    this.customBgRgb = customBgRgb;
    // Invalidate cache when color changes
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    // Check cache
    if (
      this.cachedLines &&
      this.cachedText === this.text &&
      this.cachedWidth === width
    ) {
      return this.cachedLines;
    }

    // Calculate available width for content (subtract horizontal padding)
    const contentWidth = Math.max(1, width - this.paddingX * 2);

    // Don't render anything if there's no actual text
    if (!this.text || this.text.trim() === "") {
      const result: string[] = [];
      // Update cache
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = result;
      return result;
    }

    // Replace tabs with 3 spaces for consistent rendering
    const normalizedText = this.text.replace(/\t/g, "   ");

    // Parse markdown to HTML-like tokens
    const tokens = marked.lexer(normalizedText);

    // Convert tokens to styled terminal output
    const renderedLines: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const nextToken = tokens[i + 1];
      const tokenLines = this.renderToken(token, contentWidth, nextToken?.type);
      renderedLines.push(...tokenLines);
    }

    // Wrap lines to fit content width
    const wrappedLines: string[] = [];
    for (const line of renderedLines) {
      wrappedLines.push(...this.wrapLine(line, contentWidth));
    }

    // Add padding and apply colors
    const leftPad = " ".repeat(this.paddingX);
    const paddedLines: string[] = [];

    for (const line of wrappedLines) {
      // Calculate visible length
      const visibleLength = visibleWidth(line);
      // Right padding to fill to width (accounting for left padding and content)
      const rightPadLength = Math.max(0, width - this.paddingX - visibleLength);
      const rightPad = " ".repeat(rightPadLength);

      // Add left padding, content, and right padding
      let paddedLine = leftPad + line + rightPad;

      // Apply foreground color if specified
      if (this.fgColor) {
        paddedLine = (
          style as unknown as Record<string, (text: string) => string>
        )[this.fgColor](paddedLine);
      }

      // Apply background color if specified
      if (this.customBgRgb) {
        paddedLine = style.bgRgb(
          this.customBgRgb.r,
          this.customBgRgb.g,
          this.customBgRgb.b,
        )(paddedLine);
      } else if (this.bgColor) {
        paddedLine = (
          style as unknown as Record<string, (text: string) => string>
        )[this.bgColor](paddedLine);
      }

      paddedLines.push(paddedLine);
    }

    // Add top padding (empty lines)
    const emptyLine = " ".repeat(width);
    const topPadding: string[] = [];
    for (let i = 0; i < this.paddingY; i++) {
      let emptyPaddedLine = emptyLine;
      if (this.customBgRgb) {
        emptyPaddedLine = style.bgRgb(
          this.customBgRgb.r,
          this.customBgRgb.g,
          this.customBgRgb.b,
        )(emptyPaddedLine);
      } else if (this.bgColor) {
        emptyPaddedLine = (
          style as unknown as Record<string, (text: string) => string>
        )[this.bgColor](emptyPaddedLine);
      }
      topPadding.push(emptyPaddedLine);
    }

    // Add bottom padding (empty lines)
    const bottomPadding: string[] = [];
    for (let i = 0; i < this.paddingY; i++) {
      let emptyPaddedLine = emptyLine;
      if (this.customBgRgb) {
        emptyPaddedLine = style.bgRgb(
          this.customBgRgb.r,
          this.customBgRgb.g,
          this.customBgRgb.b,
        )(emptyPaddedLine);
      } else if (this.bgColor) {
        emptyPaddedLine = (
          style as unknown as Record<string, (text: string) => string>
        )[this.bgColor](emptyPaddedLine);
      }
      bottomPadding.push(emptyPaddedLine);
    }

    // Combine top padding, content, and bottom padding
    const result = [...topPadding, ...paddedLines, ...bottomPadding];

    // Update cache
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;

    return result.length > 0 ? result : [""];
  }

  private renderToken(
    token: Token,
    width: number,
    nextTokenType?: string,
  ): string[] {
    const lines: string[] = [];

    switch (token.type) {
      case "heading": {
        const headingLevel = token.depth;
        const headingPrefix = `${"#".repeat(headingLevel)} `;
        const headingText = this.renderInlineTokens(token.tokens || []);
        if (headingLevel === 1) {
          lines.push(style.bold.underline.yellow(headingText));
        } else if (headingLevel === 2) {
          lines.push(style.bold.yellow(headingText));
        } else {
          lines.push(style.bold(headingPrefix + headingText));
        }
        lines.push(""); // Add spacing after headings
        break;
      }

      case "paragraph": {
        const paragraphText = this.renderInlineTokens(token.tokens || []);
        lines.push(paragraphText);
        // Don't add spacing if next token is space or list
        if (
          nextTokenType &&
          nextTokenType !== "list" &&
          nextTokenType !== "space"
        ) {
          lines.push("");
        }
        break;
      }

      case "code": {
        if (token.lang && supportsLanguage(token.lang)) {
          // Use syntax highlighting for supported languages
          const highlightedCode = highlight(token.text, {
            language: token.lang,
            theme: DEFAULT_THEME,
          });
          const codeLines = highlightedCode.split("\n");
          lines.push(style.gray(`\`\`\`${token.lang}`));
          for (const codeLine of codeLines) {
            lines.push(style.dim("  ") + codeLine);
          }
          lines.push(style.gray("```"));
        } else {
          // Fallback to basic styling for unsupported languages
          lines.push(style.gray(`\`\`\`${token.lang || ""}`));
          const codeLines = token.text.split("\n");
          for (const codeLine of codeLines) {
            lines.push(style.dim("  ") + style.green(codeLine));
          }
          lines.push(style.gray("```"));
        }
        lines.push(""); // Add spacing after code blocks
        break;
      }

      case "list": {
        const listLines = this.renderList(
          token as Token & { items: unknown[]; ordered: boolean },
          0,
        );
        lines.push(...listLines);
        // Don't add spacing after lists if a space token follows
        // (the space token will handle it)
        break;
      }

      case "table": {
        const tableLines = this.renderTable(
          token as Token & { header: unknown[]; rows: unknown[][] },
        );
        lines.push(...tableLines);
        break;
      }

      case "blockquote": {
        const quoteText = this.renderInlineTokens(token.tokens || []);
        const quoteLines = quoteText.split("\n");
        for (const quoteLine of quoteLines) {
          lines.push(style.gray("│ ") + style.italic(quoteLine));
        }
        lines.push(""); // Add spacing after blockquotes
        break;
      }

      case "hr":
        lines.push(style.gray("─".repeat(Math.min(width, 80))));
        lines.push(""); // Add spacing after horizontal rules
        break;

      case "image": {
        const alt = (token.title ?? token.text ?? "").toString().trim();
        if (alt.length > 0) {
          lines.push(`[Image: ${alt} (${token.href})]`);
        } else {
          lines.push(`[Image: ${token.href}]`);
        }
        break;
      }

      case "html":
        // Render HTML tags with dim styling and content as normal text
        lines.push(style.dim(token.text));
        break;

      case "space":
        // Space tokens represent blank lines in markdown
        lines.push("");
        break;

      default:
        // Handle any other token types as plain text
        if ("text" in token && typeof token.text === "string") {
          lines.push(token.text);
        }
    }

    return lines;
  }

  private renderInlineTokens(tokens: Token[]): string {
    let result = "";

    for (const token of tokens) {
      switch (token.type) {
        case "text":
          // Text tokens in list items can have nested tokens for inline formatting
          if (token.tokens && token.tokens.length > 0) {
            result += this.renderInlineTokens(token.tokens);
          } else {
            result += token.text;
          }
          break;

        case "strong":
          result += style.bold(this.renderInlineTokens(token.tokens || []));
          break;

        case "em":
          result += style.italic(this.renderInlineTokens(token.tokens || []));
          break;

        case "codespan":
          result += style.gray("`") + style.cyan(token.text) + style.gray("`");
          break;

        case "link": {
          const linkText = this.renderInlineTokens(token.tokens || []);
          // If link text matches href, only show the link once
          if (linkText === token.href) {
            result += style.underline.blue(linkText);
          } else {
            result +=
              style.underline.blue(linkText) + style.gray(` (${token.href})`);
          }
          break;
        }

        case "br":
          result += "\n";
          break;

        case "del":
          result += style.strikethrough(
            this.renderInlineTokens(token.tokens || []),
          );
          break;

        case "image": {
          const alt = (token.title ?? token.text ?? "").toString().trim();
          if (alt.length > 0) {
            result += `[Image: ${alt} (${token.href})]`;
          } else {
            result += `[Image: ${token.href}]`;
          }
          break;
        }

        default:
          // Handle any other inline token types as plain text
          if ("text" in token && typeof token.text === "string") {
            result += token.text;
          }
      }
    }

    return result;
  }

  private wrapLine(line: string, width: number): string[] {
    // Handle undefined or null lines
    if (!line) {
      return [""];
    }

    // Use the existing wrapAnsi function for robust ANSI-aware wrapping
    const wrappedText = wrapAnsi(line, width, { trim: false });
    return wrappedText.split("\n");
  }

  /**
   * Render a list with proper nesting support
   */
  private renderList(
    token: Token & {
      items: unknown[];
      ordered: boolean;
      start?: number | string;
    },
    depth: number,
  ): string[] {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    for (let i = 0; i < token.items.length; i++) {
      const item = token.items[i] as { tokens?: Token[] };
      const startNumber =
        typeof token.start === "string"
          ? Number.parseInt(token.start, 10)
          : token.start;
      const bullet = token.ordered
        ? `${getListNumber(depth, (startNumber ?? 1) + i)}. `
        : "- ";

      // Process item tokens to handle nested lists
      const itemLines = this.renderListItem(item.tokens || [], depth);

      if (itemLines.length > 0) {
        // First line - check if it's a nested list (contains cyan ANSI code for bullets)
        const firstLine = itemLines[0];
        const isNestedList = firstLine.includes("\x1b[36m"); // cyan color code

        if (isNestedList) {
          // This is a nested list, just add it as-is (already has full indent)
          lines.push(firstLine);
        } else {
          // Regular text content - add indent and bullet
          lines.push(indent + style.cyan(bullet) + firstLine);
        }

        // Rest of the lines
        for (let j = 1; j < itemLines.length; j++) {
          const line = itemLines[j];
          const isNestedListLine = line.includes("\x1b[36m"); // cyan bullet color

          if (isNestedListLine) {
            // Nested list line - already has full indent
            lines.push(line);
          } else {
            // Regular content - add parent indent + 2 spaces for continuation
            lines.push(`${indent}  ${line}`);
          }
        }
      } else {
        lines.push(indent + style.cyan(bullet));
      }
    }

    return lines;
  }

  /**
   * Render list item tokens, handling nested lists
   * Returns lines WITHOUT the parent indent (renderList will add it)
   */
  private renderListItem(tokens: Token[], parentDepth: number): string[] {
    const lines: string[] = [];

    for (const token of tokens) {
      if (token.type === "list") {
        // Nested list - render with one additional indent level
        // These lines will have their own indent, so we just add them as-is
        const nestedLines = this.renderList(
          token as Token & {
            items: unknown[];
            ordered: boolean;
            start?: number | string;
          },
          parentDepth + 1,
        );
        lines.push(...nestedLines);
      } else if (token.type === "text") {
        // Text content (may have inline tokens)
        const text =
          token.tokens && token.tokens.length > 0
            ? this.renderInlineTokens(token.tokens)
            : token.text || "";
        lines.push(text);
      } else if (token.type === "paragraph") {
        // Paragraph in list item
        const text = this.renderInlineTokens(token.tokens || []);
        lines.push(text);
      } else if (token.type === "code") {
        // Code block in list item
        lines.push(style.gray(`\`\`\`${token.lang || ""}`));
        const codeLines = token.text.split("\n");
        for (const codeLine of codeLines) {
          lines.push(style.dim("  ") + style.green(codeLine));
        }
        lines.push(style.gray("```"));
      } else {
        // Other token types - try to render as inline
        const text = this.renderInlineTokens([token]);
        if (text) {
          lines.push(text);
        }
      }
    }

    return lines;
  }

  /**
   * Render a table
   */
  private renderTable(
    token: Token & { header: unknown[]; rows: unknown[][] },
  ): string[] {
    const lines: string[] = [];

    // Extract header and row texts
    const header = token.header.map((cell) => {
      const headerCell = cell as { tokens?: Token[] };
      return this.renderInlineTokens(headerCell.tokens || []);
    });

    const rows = token.rows.map((row) =>
      row.map((cell) => {
        const rowCell = cell as { tokens?: Token[] };
        return this.renderInlineTokens(rowCell.tokens || []);
      }),
    );

    // Calculate column widths based on available width
    const padding = 5; // Account for table borders and padding
    const availableWidth = Math.max(10, 80 - padding); // Use reasonable default width for TUI
    const colCount = header?.length ?? 1;
    const width = Math.max(
      10,
      Math.floor(availableWidth / Math.max(1, colCount)),
    );
    const computedColWidths: number[] = new Array(colCount).fill(width);

    // Create table using cli-table3
    const table = new Table({
      head: header,
      colWidths: computedColWidths,
      wordWrap: true, // Enable word wrapping for the description column
    });

    table.push(...rows);

    // Split table output into lines
    const tableOutput = table.toString();
    const tableLines = tableOutput.split("\n");
    lines.push(...tableLines);
    lines.push(""); // Add spacing after table
    return lines;
  }
}
