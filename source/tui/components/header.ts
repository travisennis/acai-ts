import { getTerminalSize } from "../../terminal/control.ts";
import style, { type StyleInstance } from "../../terminal/style.ts";
import type { Component } from "../tui.ts";

/**
 * Header component - displays styled header line
 */
export class HeaderComponent implements Component {
  private header: string;
  private styleFn: StyleInstance;
  private width: number;

  // Cache for rendered output
  private cachedOutput?: string[];
  private cachedHeader?: string;
  private cachedStyleFn?: StyleInstance;
  private cachedWidth?: number;

  constructor(
    header: string,
    styleFn: StyleInstance = style.cyan,
    width?: number,
  ) {
    this.header = header;
    this.styleFn = styleFn;
    this.width = width || 0;
  }

  setHeader(header: string): void {
    this.header = header;
    this.invalidateCache();
  }

  setStyleFn(styleFn: StyleInstance): void {
    this.styleFn = styleFn;
    this.invalidateCache();
  }

  setWidth(width: number): void {
    this.width = width;
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cachedOutput = undefined;
    this.cachedHeader = undefined;
    this.cachedStyleFn = undefined;
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    // Use provided width if specified, otherwise use component width or terminal size
    let renderWidth = width || this.width;
    if (renderWidth === 0) {
      const { columns } = getTerminalSize();
      const cols = columns > 0 ? columns : 80;
      renderWidth = Math.max(0, cols - this.header.length - 4);
    }

    // Check cache
    if (
      this.cachedOutput &&
      this.cachedHeader === this.header &&
      this.cachedStyleFn === this.styleFn &&
      this.cachedWidth === renderWidth
    ) {
      return this.cachedOutput;
    }

    const result = [
      `${style.gray("\n── ")}${this.styleFn(this.header)} ${style.gray("─".repeat(renderWidth))}`,
    ];

    // Update cache
    this.cachedOutput = result;
    this.cachedHeader = this.header;
    this.cachedStyleFn = this.styleFn;
    this.cachedWidth = renderWidth;

    return result;
  }
}
