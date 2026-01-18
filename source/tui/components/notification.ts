import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

/**
 * NotificationComponent - displays a notification message with styling
 */
export class NotificationComponent implements Component {
  private message: string;
  private bgColor: { r: number; g: number; b: number };
  private textStyle: (text: string) => string;
  private paddingX: number;

  // Cache for rendered output
  private cachedMessage?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    message = "",
    bgColor = { r: 64, g: 64, b: 64 },
    textStyle: (text: string) => string = style.yellow,
    paddingX = 1,
  ) {
    this.message = message;
    this.bgColor = bgColor;
    this.textStyle = textStyle;
    this.paddingX = paddingX;
  }

  setMessage(message: string): void {
    this.message = message;
    this.invalidateCache();
  }

  setBgColor(bgColor: { r: number; g: number; b: number }): void {
    this.bgColor = bgColor;
    this.invalidateCache();
  }

  setTextStyle(textStyle: (text: string) => string): void {
    this.textStyle = textStyle;
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cachedMessage = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (!this.message) {
      return [];
    }

    // Check cache
    if (
      this.cachedLines &&
      this.cachedMessage === this.message &&
      this.cachedWidth === width
    ) {
      return this.cachedLines;
    }

    const lines = this.message.split("\n");
    const result: string[] = [];

    for (const line of lines) {
      const styledText = this.textStyle(line);
      const paddedLine =
        " ".repeat(this.paddingX) + styledText + " ".repeat(this.paddingX);
      const visibleLength = visibleWidth(paddedLine);
      const paddingNeeded = Math.max(0, width - visibleLength);
      const bgLine = style.bgRgb(
        this.bgColor.r,
        this.bgColor.g,
        this.bgColor.b,
      )(paddedLine + " ".repeat(paddingNeeded));
      result.push(bgLine);
    }
    result.push("");

    this.cachedMessage = this.message;
    this.cachedWidth = width;
    this.cachedLines = result;

    return result;
  }
}
