import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";

/**
 * Spacer component that renders empty lines
 */
export class Spacer implements Component {
  private lines: number;
  private customBgRgb?: { r: number; g: number; b: number };

  constructor(lines = 1, customBgRgb?: { r: number; g: number; b: number }) {
    this.lines = lines;
    this.customBgRgb = customBgRgb;
  }

  setLines(lines: number): void {
    this.lines = lines;
  }

  render(width: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.lines; i++) {
      let line = " ".repeat(width);
      // Apply background color if specified
      if (this.customBgRgb) {
        line = style.bgRgb(
          this.customBgRgb.r,
          this.customBgRgb.g,
          this.customBgRgb.b,
        )(line);
      }
      result.push(line);
    }
    return result;
  }
}
