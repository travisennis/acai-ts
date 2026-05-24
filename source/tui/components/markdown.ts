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
interface MarkdownTheme {
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
interface MarkdownOptions {
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
      case "heading":
        this.renderHeadingToken(token, lines);
        break;

      case "paragraph":
        this.renderParagraphToken(token, lines, nextTokenType);
        break;

      case "code":
        this.renderCodeBlockToken(token, lines);
        break;

      case "list":
        this.renderBlockListToken(token, lines);
        break;

      case "table":
        this.renderBlockTableToken(token, lines);
        break;

      case "blockquote":
        this.renderBlockquoteToken(token, lines);
        break;

      case "hr":
        this.renderHrToken(width, lines);
        break;

      case "image":
        this.renderImageBlockToken(token, lines);
        break;

      case "html":
        this.renderHtmlToken(token, lines);
        break;

      case "space":
        this.renderSpaceToken(lines);
        break;

      default:
        this.renderDefaultBlockToken(token, lines);
    }

    return lines;
  }

  private renderHeadingToken(token: Token, lines: string[]): void {
    const t = token as Token & { depth: number; tokens?: Token[] };
    const headingLevel = t.depth;
    const headingPrefix = "".concat("#".repeat(headingLevel), " ");
    const headingText = this.renderInlineTokens(t.tokens || []);
    if (headingLevel === 1) {
      lines.push(style.underline(this.theme.heading(headingText)));
    } else if (headingLevel === 2) {
      lines.push(this.theme.heading(headingText));
    } else {
      lines.push(this.theme.heading(headingPrefix + headingText));
    }
    lines.push(""); // Add spacing after headings
  }

  private renderParagraphToken(
    token: Token,
    lines: string[],
    nextTokenType?: string,
  ): void {
    const t = token as Token & { tokens?: Token[] };
    const paragraphText = this.renderInlineTokens(t.tokens || []);
    lines.push(this.theme.paragraph(paragraphText));
    // Don't add spacing if next token is space or list
    if (
      nextTokenType &&
      nextTokenType !== "list" &&
      nextTokenType !== "space"
    ) {
      lines.push("");
    }
  }

  private renderCodeBlockToken(token: Token, lines: string[]): void {
    const t = token as Token & { lang?: string; text: string };
    if (t.lang && supportsLanguage(t.lang)) {
      // Use syntax highlighting for supported languages
      const highlightedCode = highlight(t.text, {
        language: t.lang,
        theme: this.highlightTheme,
      });
      const codeLines = highlightedCode.split("\n");
      lines.push(this.theme.codeBlockBorder("".concat("```", t.lang)));
      for (const codeLine of codeLines) {
        lines.push(style.dim("  ") + codeLine);
      }
      lines.push(this.theme.codeBlockBorder("```"));
    } else {
      // Fallback to basic styling for unsupported languages
      lines.push(this.theme.codeBlockBorder("".concat("```", t.lang || "")));
      const codeLines = t.text.split("\n");
      for (const codeLine of codeLines) {
        lines.push(style.dim("  ") + this.theme.codeBlock(codeLine));
      }
      lines.push(this.theme.codeBlockBorder("```"));
    }
    lines.push(""); // Add spacing after code blocks
  }

  private renderBlockListToken(token: Token, lines: string[]): void {
    const listLines = this.renderList(
      token as Token & { items: unknown[]; ordered: boolean },
      0,
    );
    lines.push(...listLines);
  }

  private renderBlockTableToken(token: Token, lines: string[]): void {
    const tableLines = this.renderTable(
      token as Token & { header: unknown[]; rows: unknown[][] },
    );
    lines.push(...tableLines);
  }

  private renderBlockquoteToken(token: Token, lines: string[]): void {
    const t = token as Token & { tokens?: Token[] };
    const quoteText = this.renderInlineTokens(t.tokens || []);
    const quoteLines = quoteText.split("\n");
    for (const quoteLine of quoteLines) {
      lines.push(this.theme.quoteBorder("│ ") + this.theme.quote(quoteLine));
    }
    lines.push(""); // Add spacing after blockquotes
  }

  private renderHrToken(width: number, lines: string[]): void {
    lines.push(this.theme.hr("─".repeat(Math.min(width, 80))));
    lines.push(""); // Add spacing after horizontal rules
  }

  private renderImageBlockToken(token: Token, lines: string[]): void {
    const t = token as Token & {
      title?: string | null;
      text: string;
      href: string;
    };
    const alt = (t.title ?? t.text ?? "").toString().trim();
    if (alt.length > 0) {
      lines.push("[Image: ".concat(alt, " (", t.href, ")]"));
    } else {
      lines.push("[Image: ".concat(t.href, "]"));
    }
  }

  private renderHtmlToken(token: Token, lines: string[]): void {
    const t = token as Token & { text: string };
    // Render HTML tags with dim styling and content as normal text
    lines.push(style.dim(t.text));
  }

  private renderSpaceToken(lines: string[]): void {
    // Space tokens represent blank lines in markdown
    lines.push("");
  }

  private renderDefaultBlockToken(token: Token, lines: string[]): void {
    const t = token as Token & { text: string };
    // Handle any other token types as plain text
    if ("text" in t && typeof t.text === "string") {
      lines.push(t.text);
    }
  }

  private renderInlineTokens(tokens: Token[]): string {
    let result = "";

    for (const token of tokens) {
      result += this.renderInlineToken(token);
    }

    return result;
  }

  private renderInlineToken(token: Token): string {
    switch (token.type) {
      case "text":
        return this.renderTextToken(token);
      case "strong":
        return this.theme.bold(this.renderInlineTokens(token.tokens || []));
      case "em":
        return this.theme.italic(this.renderInlineTokens(token.tokens || []));
      case "codespan":
        return (
          this.theme.codeBlockBorder("`") +
          this.theme.code(token.text) +
          this.theme.codeBlockBorder("`")
        );
      case "link":
        return this.renderLinkToken(token);
      case "br":
        return "\n";
      case "del":
        return this.theme.strikethrough(
          this.renderInlineTokens(token.tokens || []),
        );
      case "image":
        return this.renderImageToken(token);
      default:
        return this.renderDefaultToken(token);
    }
  }

  private renderTextToken(token: Token): string {
    const t = token as Token & { tokens?: Token[]; text: string };
    // Text tokens in list items can have nested tokens for inline formatting
    if (t.tokens && t.tokens.length > 0) {
      return this.renderInlineTokens(t.tokens);
    }
    return t.text;
  }

  private renderLinkToken(token: Token): string {
    const t = token as Token & {
      tokens?: Token[];
      href: string;
    };
    const linkText = this.renderInlineTokens(t.tokens || []);
    const terminalLinkText = terminalLink(linkText, t.href);
    // If link text matches href, only show the link once
    if (linkText === t.href) {
      return this.theme.link(terminalLinkText ?? linkText);
    }
    return (
      this.theme.link(terminalLinkText ?? linkText) +
      this.theme.linkUrl(` (${t.href})`)
    );
  }

  private renderImageToken(token: Token): string {
    const t = token as Token & {
      title?: string | null;
      text: string;
      href: string;
    };
    const alt = (t.title ?? t.text ?? "").toString().trim();
    if (alt.length > 0) {
      return `[Image: ${alt} (${t.href})]`;
    }
    return `[Image: ${t.href}]`;
  }

  private renderDefaultToken(token: Token): string {
    // Handle any other inline token types as plain text
    if ("text" in token && typeof token.text === "string") {
      return token.text;
    }
    return "";
  }

  private wrapLine(line: string, contentWidth: number): string[] {
    if (!line) {
      return [""];
    }

    const { protectedText, codeSpans, placeholders } =
      this.protectCodeSpans(line);

    const wrappedText = wrapAnsi(protectedText, contentWidth, { trim: false });
    const lines = wrappedText.split("\n");

    const restoredLines = this.restoreCodeSpans(lines, codeSpans, placeholders);

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
    if (cleanIndex === 0) {
      return 0;
    }

    const escapeChar = String.fromCharCode(27);
    let cleanPos = 0;
    let styledPos = 0;

    while (styledPos < styledText.length) {
      if (cleanPos >= cleanIndex) {
        return this.skipAnsiAtPosition(styledText, styledPos, escapeChar);
      }

      styledPos = this.skipAnsiAtPosition(styledText, styledPos, escapeChar);
      if (styledPos >= styledText.length) break;

      if (styledText[styledPos] === cleanText[cleanPos]) {
        cleanPos++;
      }
      styledPos++;
    }

    return styledPos;
  }

  /**
   * Skip any ANSI escape sequences at the given position in styled text
   * and return the position after the last complete escape sequence.
   */
  private skipAnsiAtPosition(
    styledText: string,
    position: number,
    escapeChar: string,
  ): number {
    while (
      position < styledText.length &&
      styledText[position] === escapeChar
    ) {
      position++;
      while (position < styledText.length && styledText[position] !== "m") {
        position++;
      }
      position++; // skip 'm'
    }
    return position;
  }

  /**
   * Create a placeholder string whose visible width matches the target width.
   * Returns null if the code span is too short to protect reliably.
   */
  private createWidthMatchedPlaceholder(
    index: number,
    targetWidth: number,
  ): string | null {
    if (targetWidth < 3) {
      return null;
    }

    const core = `__CS${index}__`;
    const coreWidth = core.length;

    if (targetWidth >= coreWidth) {
      return core + "_".repeat(targetWidth - coreWidth);
    }

    const short = `_${index}_`;
    if (targetWidth >= short.length) {
      return short + "_".repeat(targetWidth - short.length);
    }

    return null;
  }

  /**
   * Find the closing backtick for an inline code span starting at the given index.
   */
  private findClosingBacktick(cleanText: string, startIndex: number): number {
    for (let j = startIndex; j < cleanText.length; j++) {
      if (cleanText[j] === "`") {
        return j;
      }
    }
    return -1;
  }

  /**
   * Protect inline code spans by replacing them with width-matched placeholders.
   * This prevents wrapAnsi from breaking code spans across lines while
   * preserving the correct visible width for accurate wrapping.
   */
  private protectCodeSpans(text: string): {
    protectedText: string;
    codeSpans: string[];
    placeholders: string[];
  } {
    const codeSpans: string[] = [];
    const placeholders: string[] = [];
    let protectedText = text;
    let placeholderIndex = 0;

    const cleanText = stripAnsi(text);

    let i = 0;
    while (i < cleanText.length) {
      const backtickIndex = cleanText.indexOf("`", i);
      if (backtickIndex === -1) break;

      const closingIndex = this.findClosingBacktick(
        cleanText,
        backtickIndex + 1,
      );

      if (closingIndex !== -1) {
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

        const styledCodeSpan = text.slice(styledStart, styledEnd);
        const codeSpanWidth = visibleWidth(styledCodeSpan);

        const placeholder = this.createWidthMatchedPlaceholder(
          placeholderIndex,
          codeSpanWidth,
        );

        if (placeholder !== null) {
          codeSpans.push(styledCodeSpan);
          placeholders.push(placeholder);
          protectedText = protectedText.replace(styledCodeSpan, placeholder);
          placeholderIndex++;
        }

        i = closingIndex + 1;
        continue;
      }

      i = backtickIndex + 1;
    }

    return { protectedText, codeSpans, placeholders };
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

  private restoreCodeSpans(
    lines: string[],
    codeSpans: string[],
    placeholders: string[],
  ): string[] {
    return lines.map((line) => {
      let restoredLine = line;

      for (let i = 0; i < codeSpans.length; i++) {
        restoredLine = restoredLine.replace(placeholders[i], codeSpans[i]);
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

      this.appendItemLines(lines, itemLines, indent, bullet);
    }

    return lines;
  }

  /**
   * Append list item lines to the output, handling nested lists
   */
  private appendItemLines(
    lines: string[],
    itemLines: string[],
    indent: string,
    bullet: string,
  ): void {
    if (itemLines.length > 0) {
      // First line - check if it's a nested list
      const firstLine = itemLines[0];
      const isNestedList = this.isNestedListLine(firstLine, indent.length / 2);

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

  /**
   * Render list item tokens, handling nested lists
   * Returns lines WITHOUT the parent indent (renderList will add it)
   */
  // Token handler map for renderListItem dispatch
  private listTokenHandlers: Record<
    string,
    (token: Token, parentDepth: number) => string[]
  > = {
    list: (token, parentDepth) =>
      this.renderList(
        token as Token & {
          items: unknown[];
          ordered: boolean;
          start?: number | string;
        },
        parentDepth + 1,
      ),
    text: (token) => {
      const t = token as { tokens?: Token[]; text?: string };
      return t.tokens && t.tokens.length > 0
        ? [this.renderInlineTokens(t.tokens)]
        : [t.text || ""];
    },
    paragraph: (token) => [
      this.renderInlineTokens((token as { tokens?: Token[] }).tokens || []),
    ],
    code: (token) => {
      const t = token as { lang?: string; text?: string };
      const lines: string[] = [
        this.theme.codeBlockBorder(`\`\`\`${t.lang || ""}`),
      ];
      const codeLines = (t.text || "").split("\n");
      for (const codeLine of codeLines) {
        lines.push(style.dim("  ") + this.theme.codeBlock(codeLine));
      }
      lines.push(this.theme.codeBlockBorder("```"));
      return lines;
    },
  };

  private renderListItem(tokens: Token[], parentDepth: number): string[] {
    const lines: string[] = [];

    for (const token of tokens) {
      const handler = this.listTokenHandlers[token.type];
      if (handler) {
        lines.push(...handler(token, parentDepth));
      } else {
        // Unknown token types - try to render as inline
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
