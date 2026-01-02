import { getTerminalSize } from "../../terminal/control.ts";
import stripAnsi from "../../terminal/strip-ansi.ts";
import type { Component } from "../tui.ts";
import { Markdown } from "./markdown.ts";

/**
 * Box component - displays content in a bordered box with header
 */
export class BoxComponent implements Component {
  private header: string;
  private content: string;
  private width: number;

  // Cache for rendered output
  private cachedOutput?: string[];
  private cachedHeader?: string;
  private cachedContent?: string;
  private cachedWidth?: number;

  constructor(header: string, content: string, width?: number) {
    this.header = header;
    this.content = content;
    this.width = width || 0;
  }

  setHeader(header: string): void {
    this.header = header;
    this.invalidateCache();
  }

  setContent(content: string): void {
    this.content = content;
    this.invalidateCache();
  }

  setWidth(width: number): void {
    this.width = width;
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cachedOutput = undefined;
    this.cachedHeader = undefined;
    this.cachedContent = undefined;
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    // Use provided width if specified, otherwise use component width or terminal size
    let renderWidth = width || this.width;
    if (renderWidth === 0) {
      const { columns } = getTerminalSize();
      const cols = columns > 0 ? columns : 80;
      renderWidth = Math.max(4, cols - 4);
    }

    // Check cache
    if (
      this.cachedOutput &&
      this.cachedHeader === this.header &&
      this.cachedContent === this.content &&
      this.cachedWidth === renderWidth
    ) {
      return this.cachedOutput;
    }

    const paddedHeader = ` ${this.header} `;
    const headerVisibleLen = stripAnsi(paddedHeader).length;
    const headerStartPos = 1;

    // Top border with header (use visible header length)
    const leftDashes = headerStartPos;
    const rightDashes = Math.max(
      0,
      renderWidth - leftDashes - headerVisibleLen,
    );
    const topBorder = `┌${"─".repeat(leftDashes)}${paddedHeader}${"─".repeat(rightDashes - 2)}┐`;

    // Prepare inner content: format markdown wrapped to inner width
    const innerWidth = Math.max(1, renderWidth - 4);
    const md = new Markdown(this.content);
    const formatted = md.render(innerWidth);

    const contentLines = formatted.map((line) => {
      const visibleLen = stripAnsi(line).length;
      const padCount = Math.max(0, innerWidth - visibleLen);
      return `│ ${line}${" ".repeat(padCount)} │`;
    });

    // Bottom border
    const bottomBorder = `└${"─".repeat(renderWidth - 2)}┘`;

    const result = [topBorder, ...contentLines, bottomBorder];

    // Update cache
    this.cachedOutput = result;
    this.cachedHeader = this.header;
    this.cachedContent = this.content;
    this.cachedWidth = renderWidth;

    return result;
  }
}
