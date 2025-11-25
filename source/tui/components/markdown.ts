import Table from "cli-table3";
import { marked, type Token } from "marked";
import { DEFAULT_THEME } from "../../terminal/default-theme.ts";
import { highlight, supportsLanguage } from "../../terminal/highlight/index.ts";
import { getListNumber } from "../../terminal/markdown-utils.ts";
import style from "../../terminal/style.ts";
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
 * Default text styling for markdown content.
 * Applied to all text unless overridden by markdown formatting.
 */
export interface DefaultTextStyle {
  /** Foreground color function */
  color?: (text: string) => string;
  /** Background color function */
  bgColor?: (text: string) => string;
  /** Bold text */
  bold?: boolean;
  /** Italic text */
  italic?: boolean;
  /** Strikethrough text */
  strikethrough?: boolean;
  /** Underline text */
  underline?: boolean;
}

/**
 * Theme functions for markdown elements.
 * Each function takes text and returns styled text with ANSI codes.
 */
export interface MarkdownTheme {
  heading: (text: string) => string;
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

export class Markdown implements Component {
  private text: string;
  private bgColor?: Color;
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
    _fgColor?: Color,
    customBgRgb?: { r: number; g: number; b: number },
    paddingX = 1,
    paddingY = 1,
  ) {
    this.text = text;
    this.bgColor = bgColor;
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

    // Find all inline code spans (text between backticks with ANSI styling)
    // Only protect actual code spans that have been styled by renderInlineTokens
    // Pattern: gray backtick + cyan content + gray backtick
    // Use a simpler approach that doesn't rely on specific ANSI codes
    const codeSpanRegex = /`[^`]+`/g;
    let match: RegExpExecArray | null = null;

    // biome-ignore lint/suspicious/noAssignInExpressions: Need assignment in while condition
    while ((match = codeSpanRegex.exec(text)) !== null) {
      const codeSpan = match[0];

      // Only protect code spans that are actual code (not escaped backticks)
      // We can identify actual code spans by checking if they're surrounded by ANSI codes
      // or if they appear in contexts where escaped backticks would have been processed
      const startIndex = match.index;
      const endIndex = startIndex + codeSpan.length;

      // Check if this looks like an actual code span (not escaped backticks)
      // Escaped backticks would appear as literal backticks without ANSI styling
      // Actual code spans would have been processed by renderInlineTokens
      if (this.isActualCodeSpan(text, startIndex, endIndex)) {
        const placeholder = `__CODE_SPAN_${placeholderIndex}__`;
        codeSpans.push(codeSpan);
        protectedText = protectedText.replace(codeSpan, placeholder);
        placeholderIndex++;
      }
    }

    return { protectedText, codeSpans };
  }

  /**
   * Check if a potential code span is an actual code span (not escaped backticks)
   */
  private isActualCodeSpan(
    text: string,
    startIndex: number,
    endIndex: number,
  ): boolean {
    // If the text around the code span contains ANSI escape sequences,
    // it's likely an actual code span that was processed by renderInlineTokens
    // Look for ANSI escape sequences in the surrounding context
    const contextStart = Math.max(0, startIndex - 10);
    const contextEnd = Math.min(text.length, endIndex + 10);
    const context = text.slice(contextStart, contextEnd);

    // Check for ANSI escape sequences that would indicate styled code
    // Use String.fromCharCode(27) to avoid control characters in regex
    const escapeChar = String.fromCharCode(27);
    return context.includes(`${escapeChar}[`);
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
