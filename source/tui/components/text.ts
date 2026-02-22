import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

/**
 * Text component - displays multi-line text with word wrapping
 */
export class Text implements Component {
  private text: string;
  private paddingX: number; // Left/right padding
  private paddingY: number; // Top/bottom padding
  private customBgRgb?: { r: number; g: number; b: number };

  // Cache for rendered output
  private cachedText?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    text = "",
    paddingX = 1,
    paddingY = 1,
    customBgRgb?: { r: number; g: number; b: number },
  ) {
    this.text = text;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
    this.customBgRgb = customBgRgb;
  }

  setText(text: string): void {
    this.text = text;
    // Invalidate cache when text changes
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

  /**
   * Apply background color to a line if customBgRgb is set
   */
  private applyBackground(line: string): string {
    if (!this.customBgRgb) {
      return line;
    }
    return style.bgRgb(
      this.customBgRgb.r,
      this.customBgRgb.g,
      this.customBgRgb.b,
    )(line);
  }

  /**
   * Create an empty padded line (for top/bottom padding)
   */
  private createEmptyPaddedLine(width: number): string {
    const emptyLine = " ".repeat(width);
    return this.applyBackground(emptyLine);
  }

  /**
   * Wrap a single line of text to fit within contentWidth
   */
  private wrapLine(line: string, contentWidth: number): string[] {
    const lines: string[] = [];
    const visibleLineLength = visibleWidth(line);

    if (visibleLineLength <= contentWidth) {
      lines.push(line);
      return lines;
    }

    // Word wrap
    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const currentVisible = visibleWidth(currentLine);

      // If word is too long, truncate it
      const finalWord = this.truncateWord(word, contentWidth);

      if (currentVisible === 0) {
        currentLine = finalWord;
      } else if (currentVisible + 1 + visibleWidth(finalWord) <= contentWidth) {
        currentLine += ` ${finalWord}`;
      } else {
        lines.push(currentLine);
        currentLine = finalWord;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Truncate a word to fit within contentWidth
   */
  private truncateWord(word: string, contentWidth: number): string {
    const wordVisible = visibleWidth(word);
    if (wordVisible <= contentWidth) {
      return word;
    }

    let truncated = "";
    for (const char of word) {
      if (visibleWidth(truncated + char) > contentWidth) {
        break;
      }
      truncated += char;
    }
    return truncated;
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

    const lines: string[] = [];
    const textLines = normalizedText.split("\n");

    for (const line of textLines) {
      const wrappedLines = this.wrapLine(line, contentWidth);
      lines.push(...wrappedLines);
    }

    // Add padding to each line
    const leftPad = " ".repeat(this.paddingX);
    const paddedLines: string[] = [];

    for (const line of lines) {
      // Calculate visible length (strip ANSI codes)
      const visibleLength = visibleWidth(line);
      // Right padding to fill to width (accounting for left padding and content)
      const rightPadLength = Math.max(0, width - this.paddingX - visibleLength);
      const rightPad = " ".repeat(rightPadLength);
      const paddedLine = leftPad + line + rightPad;

      // Apply background color if specified
      paddedLines.push(this.applyBackground(paddedLine));
    }

    // Add top padding (empty lines)
    const topPadding: string[] = [];
    for (let i = 0; i < this.paddingY; i++) {
      topPadding.push(this.createEmptyPaddedLine(width));
    }

    // Add bottom padding (empty lines)
    const bottomPadding: string[] = [];
    for (let i = 0; i < this.paddingY; i++) {
      bottomPadding.push(this.createEmptyPaddedLine(width));
    }

    // Combine top padding, content, and bottom padding
    const result = [...topPadding, ...paddedLines, ...bottomPadding];

    // Update cache
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;

    return result.length > 0 ? result : [""];
  }
}
