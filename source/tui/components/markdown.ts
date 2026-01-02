import { marked, type Token } from "marked";
import { DEFAULT_HIGHLIGHT_THEME } from "../../terminal/default-theme.ts";
import { link as terminalLink } from "../../terminal/formatting.ts";
import { highlight, supportsLanguage } from "../../terminal/highlight/index.ts";
import type { Theme } from "../../terminal/highlight/theme.ts";
import { getListNumber } from "../../terminal/markdown-utils.ts";
import stripAnsi from "../../terminal/strip-ansi.ts";
import style from "../../terminal/style.ts";
import { Table } from "../../terminal/table/index.ts";
import wrapAnsi from "../../terminal/wrap-ansi.ts";
import type { Component } from "../tui.ts";
import { applyBackgroundToLine, visibleWidth } from "../utils.ts";

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

/**
 * Theme functions for markdown elements.
 * Each function takes text and returns styled text with ANSI codes.
 */
export interface MarkdownTheme {
  heading: (text: string) => string;
  paragraph: (text: string) => string;
  link: (text: string) => string;
  linkUrl: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  quote: (text: string) => string;
  quoteBorder: (text: string) => string;
  hr: (text: string) => string;
  listBullet: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  strikethrough: (text: string) => string;
  underline: (text: string) => string;
}

const DEFAULT_THEME: MarkdownTheme = {
  heading: (text: string) => style.bold.yellow(text),
  paragraph: (text: string) => text,
  link: (text: string) => style.underline.blue(text),
  linkUrl: (text: string) => style.gray(text),
  code: (text: string) => style.cyan(text),
  codeBlock: (text: string) => style.green(text),
  codeBlockBorder: (text: string) => style.gray(text),
  quote: (text: string) => style.italic(text),
  quoteBorder: (text: string) => style.gray(text),
  hr: (text: string) => style.gray(text),
  listBullet: (text: string) => style.cyan(text),
  bold: (text: string) => style.bold(text),
  italic: (text: string) => style.italic(text),
  strikethrough: (text: string) => style.strikethrough(text),
  underline: (text: string) => style.underline(text),
};

/**
 * Options for configuring Markdown component
 */
export interface MarkdownOptions {
  /** Background color */
  bgColor?: Color;
  /** Custom background RGB color */
  customBgRgb?: { r: number; g: number; b: number };
  /** Horizontal padding */
  paddingX?: number;
  /** Vertical padding */
  paddingY?: number;
  /** Theme for markdown */
  theme?: MarkdownTheme;
  /** Theme for code highlighting */
  highlightTheme?: Theme;
}

export class Markdown implements Component {
  private text: string;
  private bgColor?: Color;
  private customBgRgb?: { r: number; g: number; b: number };
  private paddingX: number; // Left/right padding
  private paddingY: number; // Top/bottom padding
  private theme: MarkdownTheme;
  private highlightTheme: Theme;

  // Cache for rendered output
  private cachedText?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(text: string, options: MarkdownOptions = {}) {
    this.text = text;
    this.bgColor = options.bgColor;
    this.customBgRgb = options.customBgRgb;
    this.paddingX = options.paddingX ?? 1;
    this.paddingY = options.paddingY ?? 1;
    this.theme = options.theme ?? DEFAULT_THEME;
    this.highlightTheme = options.highlightTheme ?? DEFAULT_HIGHLIGHT_THEME;
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

  setCustomBgRgb(customBgRgb?: { r: number; g: number; b: number }): void {
    this.customBgRgb = customBgRgb;
    // Invalidate cache when color changes
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  /**
   * Get the background color function based on current configuration
   */
  private getBackgroundFunction(): ((text: string) => string) | undefined {
    if (this.customBgRgb) {
      const { r, g, b } = this.customBgRgb;
      return (text: string) => style.bgRgb(r, g, b)(text);
    }
    if (this.bgColor) {
      const bgColor = this.bgColor;
      return (text: string) =>
        (style as unknown as Record<string, (text: string) => string>)[bgColor](
          text,
        );
    }
    return undefined;
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

    // Wrap lines (NO padding, NO background yet)
    const wrappedLines: string[] = [];
    for (const line of renderedLines) {
      wrappedLines.push(...this.wrapLine(line, contentWidth));
    }

    // Add margins and background to each wrapped line
    const leftMargin = " ".repeat(this.paddingX);
    const rightMargin = " ".repeat(this.paddingX);
    const bgFn = this.getBackgroundFunction();
    const contentLines: string[] = [];

    for (const line of wrappedLines) {
      const lineWithMargins = leftMargin + line + rightMargin;

      if (bgFn) {
        contentLines.push(applyBackgroundToLine(lineWithMargins, width, bgFn));
      } else {
        // No background - just pad to width
        const visibleLen = visibleWidth(lineWithMargins);
        const paddingNeeded = Math.max(0, width - visibleLen);
        contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
      }
    }

    // Add top/bottom padding (empty lines)
    const emptyLine = " ".repeat(width);
    const emptyLines: string[] = [];
    for (let i = 0; i < this.paddingY; i++) {
      const line = bgFn
        ? applyBackgroundToLine(emptyLine, width, bgFn)
        : emptyLine;
      emptyLines.push(line);
    }

    const result = [...emptyLines, ...contentLines, ...emptyLines];

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
          lines.push(style.underline(this.theme.heading(headingText)));
        } else if (headingLevel === 2) {
          lines.push(this.theme.heading(headingText));
        } else {
          lines.push(this.theme.heading(headingPrefix + headingText));
        }
        lines.push(""); // Add spacing after headings
        break;
      }

      case "paragraph": {
        const paragraphText = this.renderInlineTokens(token.tokens || []);
        lines.push(this.theme.paragraph(paragraphText));
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
            theme: this.highlightTheme,
          });
          const codeLines = highlightedCode.split("\n");
          lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang}`));
          for (const codeLine of codeLines) {
            lines.push(style.dim("  ") + codeLine);
          }
          lines.push(this.theme.codeBlockBorder("```"));
        } else {
          // Fallback to basic styling for unsupported languages
          lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
          const codeLines = token.text.split("\n");
          for (const codeLine of codeLines) {
            lines.push(style.dim("  ") + this.theme.codeBlock(codeLine));
          }
          lines.push(this.theme.codeBlockBorder("```"));
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
          lines.push(
            this.theme.quoteBorder("│ ") + this.theme.quote(quoteLine),
          );
        }
        lines.push(""); // Add spacing after blockquotes
        break;
      }

      case "hr":
        lines.push(this.theme.hr("─".repeat(Math.min(width, 80))));
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
          result += this.theme.bold(
            this.renderInlineTokens(token.tokens || []),
          );
          break;

        case "em":
          result += this.theme.italic(
            this.renderInlineTokens(token.tokens || []),
          );
          break;

        case "codespan":
          result +=
            this.theme.codeBlockBorder("`") +
            this.theme.code(token.text) +
            this.theme.codeBlockBorder("`");
          break;

        case "link": {
          const linkText = this.renderInlineTokens(token.tokens || []);
          const terminalLinkText = terminalLink(linkText, token.href);
          // If link text matches href, only show the link once
          if (linkText === token.href) {
            result += this.theme.link(terminalLinkText ?? linkText);
          } else {
            result +=
              this.theme.link(terminalLinkText ?? linkText) +
              this.theme.linkUrl(` (${token.href})`);
          }
          break;
        }

        case "br":
          result += "\n";
          break;

        case "del":
          result += this.theme.strikethrough(
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

  private wrapLine(line: string, contentWidth: number): string[] {
    // Handle undefined or null lines
    if (!line) {
      return [""];
    }

    // Protect inline code spans from being split across lines
    // by temporarily replacing them with placeholders
    const { protectedText, codeSpans } = this.protectCodeSpans(line);

    // Use the existing wrapAnsi function for robust ANSI-aware wrapping
    // Use contentWidth (available width after padding) for wrapping
    const wrappedText = wrapAnsi(protectedText, contentWidth, { trim: false });
    const lines = wrappedText.split("\n");

    // Restore the code spans
    const restoredLines = this.restoreCodeSpans(lines, codeSpans);

    return restoredLines;
  }

  /**
   * Map a position in clean text to the corresponding position in styled text
   * This accounts for ANSI escape codes that are inserted between characters
   */
  private cleanToStyledIndex(
    cleanText: string,
    styledText: string,
    cleanIndex: number,
  ): number {
    let cleanPos = 0;
    let styledPos = 0;

    while (cleanPos < cleanIndex && styledPos < styledText.length) {
      const char = cleanText[cleanPos];

      // Check if we're at an ANSI escape sequence in the styled text
      const escapeChar = String.fromCharCode(27);
      if (styledText[styledPos] === escapeChar) {
        // Skip the entire ANSI escape sequence
        while (styledPos < styledText.length && styledText[styledPos] !== "m") {
          styledPos++;
        }
        // Skip the 'm' character too
        styledPos++;
        // Don't increment cleanPos - ANSI codes are inserted between characters
      } else if (styledText[styledPos] === char) {
        // Characters match, advance both
        cleanPos++;
        styledPos++;
      } else {
        // Characters don't match - this shouldn't happen if cleanText is derived from styledText
        // But to be safe, just advance styledPos
        styledPos++;
      }
    }

    return styledPos;
  }

  /**
   * Protect inline code spans by replacing them with placeholders
   * This prevents wrapAnsi from breaking code spans across lines
   */
  private protectCodeSpans(text: string): {
    protectedText: string;
    codeSpans: string[];
  } {
    const codeSpans: string[] = [];
    let protectedText = text;
    let placeholderIndex = 0;

    // Create a version of the text without ANSI codes for code span detection
    // This allows us to reliably find code spans regardless of styling
    const cleanText = stripAnsi(text);

    // Use the clean text to find code spans
    let i = 0;
    while (i < cleanText.length) {
      // Find the next backtick in clean text
      const backtickIndex = cleanText.indexOf("`", i);
      if (backtickIndex === -1) break;

      // Look for the closing backtick in clean text
      let closingIndex = -1;
      let depth = 1;

      for (let j = backtickIndex + 1; j < cleanText.length; j++) {
        if (cleanText[j] === "`") {
          depth--;
          if (depth === 0) {
            closingIndex = j;
            break;
          }
        }
      }

      if (closingIndex !== -1) {
        // Map the positions to the styled text
        const styledStart = this.cleanToStyledIndex(
          cleanText,
          text,
          backtickIndex,
        );
        const styledEnd = this.cleanToStyledIndex(
          cleanText,
          text,
          closingIndex + 1,
        );

        // Extract the styled code span
        const styledCodeSpan = text.slice(styledStart, styledEnd);

        const placeholder = `__CODE_SPAN_${placeholderIndex}__`;

        // Store the full styled code span for restoration
        codeSpans.push(styledCodeSpan);

        // Replace with placeholder
        protectedText = protectedText.replace(styledCodeSpan, placeholder);
        placeholderIndex++;

        // Move past this code span
        i = closingIndex + 1;
        continue;
      }

      // Move to next character
      i = backtickIndex + 1;
    }

    return { protectedText, codeSpans };
  }

  /**
   * Check if a line represents a nested list item
   */
  private isNestedListLine(line: string, currentDepth: number): boolean {
    // A nested list line should have proper indentation for its depth
    // and typically starts with a bullet (cyan colored number or dash)
    const expectedIndent = "  ".repeat(currentDepth + 1);
    const escapeChar = String.fromCharCode(27);

    // Check if the line starts with the expected indent for a nested list
    // and contains a cyan bullet (either number or dash) after the indent
    if (line.startsWith(expectedIndent)) {
      const afterIndent = line.slice(expectedIndent.length);

      // Look for cyan-colored content at the start (bullet)
      // Pattern: cyan escape sequence followed by content, then reset
      const cyanPattern = `${escapeChar}[36m`;
      const resetPattern = `${escapeChar}[39m`;

      if (afterIndent.startsWith(cyanPattern)) {
        const afterCyan = afterIndent.slice(cyanPattern.length);
        const resetIndex = afterCyan.indexOf(resetPattern);

        if (resetIndex > 0) {
          const bulletContent = afterCyan.slice(0, resetIndex);
          // Check if this looks like a list bullet (number with dot or dash)
          return /^(\d+\.|-)/.test(bulletContent);
        }
      }
    }

    return false;
  }

  /**
   * Restore code spans from placeholders after wrapping
   */
  private restoreCodeSpans(lines: string[], codeSpans: string[]): string[] {
    return lines.map((line) => {
      let restoredLine = line;

      // Restore each code span placeholder
      for (let i = 0; i < codeSpans.length; i++) {
        const placeholder = `__CODE_SPAN_${i}__`;
        const codeSpan = codeSpans[i];

        restoredLine = restoredLine.replace(placeholder, codeSpan);
      }

      return restoredLine;
    });
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
        // First line - check if it's a nested list
        const firstLine = itemLines[0];
        const isNestedList = this.isNestedListLine(firstLine, depth);

        if (isNestedList) {
          // This is a nested list, just add it as-is (already has full indent)
          lines.push(firstLine);
        } else {
          // Regular text content - add indent and bullet
          lines.push(indent + this.theme.listBullet(bullet) + firstLine);
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
        lines.push(indent + this.theme.listBullet(bullet));
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
        lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
        const codeLines = token.text.split("\n");
        for (const codeLine of codeLines) {
          lines.push(style.dim("  ") + this.theme.codeBlock(codeLine));
        }
        lines.push(this.theme.codeBlockBorder("```"));
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
