import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

/**
 * NotificationComponent - displays a notification message with styling
 * and auto-dismiss functionality.
 */
export class NotificationComponent implements Component {
  private message: string;
  private bgColor: { r: number; g: number; b: number };
  private textStyle: (text: string) => string;
  private paddingX: number;
  private autoDismissTimer?: NodeJS.Timeout;
  private autoDismissMs: number;
  private onDismiss?: () => void;

  // Cache for rendered output
  private cachedMessage?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    message = "",
    bgColor = { r: 52, g: 53, b: 65 },
    textStyle: (text: string) => string = style.yellow,
    paddingX = 1,
    autoDismissMs = 3000,
    onDismiss?: () => void,
  ) {
    this.message = message;
    this.bgColor = bgColor;
    this.textStyle = textStyle;
    this.paddingX = paddingX;
    this.autoDismissMs = autoDismissMs;
    this.onDismiss = onDismiss;
  }

  /**
   * Sets the auto-dismiss timeout in milliseconds.
   * This affects the next setMessage call.
   */
  setAutoDismissMs(ms: number): void {
    this.autoDismissMs = ms;
  }

  /**
   * Clears the notification immediately and cancels any pending timer.
   */
  clear(): void {
    this.clearTimer();
    this.message = "";
    this.invalidateCache();
  }

  /**
   * Clears any pending auto-dismiss timer.
   */
  private clearTimer(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = undefined;
    }
  }

  setMessage(message: string): void {
    // Clear any pending timer first (handles reset on new notification)
    this.clearTimer();

    this.message = message;
    this.invalidateCache();

    // If message is non-empty, set up auto-dismiss
    if (message) {
      this.autoDismissTimer = setTimeout(() => {
        this.message = "";
        this.autoDismissTimer = undefined;
        this.invalidateCache();
        if (this.onDismiss) {
          this.onDismiss();
        }
      }, this.autoDismissMs);
    }
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
