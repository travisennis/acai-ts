import style from "../../terminal/style.ts";
import type { TUI } from "../tui.ts";
import { Text } from "./text.ts";

/**
 * Loader component that updates every 80ms with spinning animation
 */
export class Loader extends Text {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private ui: TUI | null = null;
  private message: string;

  constructor(
    ui: TUI,
    message?: string,
    customBgRgb?: { r: number; g: number; b: number },
  ) {
    super("", 1, 0, customBgRgb);
    this.message = message ?? "Loading...";
    this.ui = ui;
    this.start();
  }

  override render(width: number): string[] {
    return ["", ...super.render(width)];
  }

  start() {
    this.updateDisplay();
    this.intervalId = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.updateDisplay();
    }, 80);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setMessage(message: string) {
    this.message = message;
    this.updateDisplay();
  }

  private updateDisplay() {
    const frame = this.frames[this.currentFrame];
    this.setText(`${style.cyan(frame)} ${style.dim(this.message)}`);
    if (this.ui) {
      this.ui.requestRender();
    }
  }
}
