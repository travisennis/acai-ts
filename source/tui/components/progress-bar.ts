import { formatNumber } from "../../formatting.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";

/**
 * Progress bar component - displays a visual progress indicator
 */
export class ProgressBarComponent implements Component {
  private current: number;
  private total: number;
  private width: number;

  // Cache for rendered output
  private cachedOutput?: string[];
  private cachedCurrent?: number;
  private cachedTotal?: number;
  private cachedWidth?: number;

  constructor(current: number, total: number, width: number) {
    this.current = current;
    this.total = total;
    this.width = width;
  }

  setCurrent(current: number): void {
    this.current = current;
    this.invalidateCache();
  }

  setTotal(total: number): void {
    this.total = total;
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cachedOutput = undefined;
    this.cachedCurrent = undefined;
    this.cachedTotal = undefined;
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    // Use provided width if specified, otherwise use component width
    const renderWidth = width || this.width;

    // Check cache
    if (
      this.cachedOutput &&
      this.cachedCurrent === this.current &&
      this.cachedTotal === this.total &&
      this.cachedWidth === renderWidth
    ) {
      return this.cachedOutput;
    }

    const percentage = this.total === 0 ? 1 : this.current / this.total;
    const currentFormatted = formatNumber(this.current);
    const totalFormatted = formatNumber(this.total);
    const progressText = `${currentFormatted}/${totalFormatted} [${(percentage * 100).toFixed(1)}%]`;
    const progressTextLength = progressText.length + 1; // Add 1 for space

    const progressBarMaxWidth = Math.max(1, renderWidth - progressTextLength);

    const filledWidth = Math.max(
      0,
      Math.min(
        progressBarMaxWidth,
        Math.floor(percentage * progressBarMaxWidth),
      ),
    );
    const emptyWidth = Math.max(0, progressBarMaxWidth - filledWidth);

    const a =
      filledWidth / progressBarMaxWidth > 0.5
        ? style.red("─")
        : style.yellow("─");
    const b = style.gray("─");
    const filledBar = a.repeat(filledWidth);
    const emptyBar = b.repeat(emptyWidth);

    const result = [`${filledBar}${emptyBar} ${progressText}`];

    // Update cache
    this.cachedOutput = result;
    this.cachedCurrent = this.current;
    this.cachedTotal = this.total;
    this.cachedWidth = renderWidth;

    return result;
  }
}
