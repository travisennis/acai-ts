import { getTerminalSize } from "../../terminal/control.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { Container } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

/**
 * Modal component - displays content in an overlay on top of the main UI
 */
export class Modal extends Container implements Component {
  private title: string;
  public backdrop: boolean;
  private onClose?: () => void;
  private maxWidth: number;
  private maxHeight: number;
  private scrollPosition = 0;

  constructor(
    title: string,
    content: Component,
    backdrop = true,
    onClose?: () => void,
    maxWidth?: number,
    maxHeight?: number,
  ) {
    super();
    this.title = title;
    this.backdrop = backdrop;
    this.onClose = onClose;
    const { columns, rows } = getTerminalSize();
    this.maxWidth = maxWidth ?? columns;
    this.maxHeight = maxHeight ?? rows;
    this.addChild(content);
  }

  handleInput(data: string): void {
    // Handle Escape key to close modal
    if (data === "\x1b") {
      this.close();
      return;
    }

    // Handle scrolling
    if (data === "\x1b[A") {
      // Up arrow
      this.scrollPosition = Math.max(0, this.scrollPosition - 1);
      return;
    }
    if (data === "\x1b[B") {
      // Down arrow
      this.scrollPosition += 1;
      return;
    }
    if (data === "\x1b[5~") {
      // Page up
      this.scrollPosition = Math.max(0, this.scrollPosition - 10);
      return;
    }
    if (data === "\x1b[6~") {
      // Page down
      this.scrollPosition += 10;
      return;
    }
    if (data === "\x1b[H" || data === "g") {
      // Home key or 'g' for top
      this.scrollPosition = 0;
      return;
    }
    if (data === "\x1b[F" || data === "G") {
      // End key or 'G' for bottom
      this.scrollPosition = Number.POSITIVE_INFINITY; // Will be clamped in render
      return;
    }

    // Pass input to focused child component
    if (this.children.length > 0) {
      const focusedChild = this.children[0];
      if (focusedChild.handleInput) {
        focusedChild.handleInput(data);
      }
    }
  }

  close(): void {
    if (this.onClose) {
      this.onClose();
    }
  }

  override render(width: number): string[] {
    const lines: string[] = [];

    // Calculate modal dimensions - use dynamic sizing
    // Use the provided width directly, ensuring reasonable minimum and maximum
    const modalWidth = Math.max(40, width - 2);
    const contentWidth = modalWidth - 4; // Account for borders and padding

    // Calculate content height
    const contentLines = super.render(contentWidth);
    const contentHeight = contentLines.length;

    // Calculate modal height based on content
    const modalHeight = Math.min(
      this.maxHeight,
      Math.max(8, contentHeight + 4), // title + separator + content + bottom border
    );

    // Calculate vertical positioning (centered)
    const { rows } = getTerminalSize();
    const terminalHeight = rows;
    const topOffset = Math.max(
      0,
      Math.floor((terminalHeight - modalHeight) / 2),
    );

    // Add top offset for centering
    for (let i = 0; i < topOffset; i++) {
      lines.push(" ".repeat(width));
    }

    // Render modal frame
    const horizontalBorder = style.white("─".repeat(modalWidth - 2));
    const emptyLine =
      style.white("│") + " ".repeat(modalWidth - 2) + style.white("│");

    // Calculate horizontal offset for centering
    // Use different offsets for left and right to ensure full width coverage
    const leftOffset = Math.floor((width - modalWidth) / 2);
    const rightOffset = width - modalWidth - leftOffset;

    // Top border
    lines.push(
      " ".repeat(leftOffset) +
        style.white("┌") +
        horizontalBorder +
        style.white("┐") +
        " ".repeat(rightOffset),
    );

    // Render content lines with scrolling support
    const visibleContentHeight = Math.min(contentHeight, modalHeight - 4);
    const maxScroll = Math.max(0, contentHeight - visibleContentHeight);

    // Clamp scroll position
    this.scrollPosition = Math.min(maxScroll, Math.max(0, this.scrollPosition));

    // Add scroll indicator to title if content is scrollable
    let displayTitle = this.title;
    if (contentHeight > visibleContentHeight) {
      const scrollInfo = ` (${this.scrollPosition + 1}-${Math.min(this.scrollPosition + visibleContentHeight, contentHeight)}/${contentHeight})`;
      displayTitle = this.title + scrollInfo;
    }
    displayTitle += " [esc to exit]";

    // Update title line with scroll info
    const titleText = ` ${displayTitle} `;
    const titlePadding = Math.max(0, modalWidth - 2 - visibleWidth(titleText));
    const titleLine =
      style.white("│") +
      style.bold(titleText) +
      " ".repeat(titlePadding) +
      style.white("│");
    lines.push(" ".repeat(leftOffset) + titleLine + " ".repeat(rightOffset));

    // Separator line
    const separator =
      style.white("├") + "─".repeat(modalWidth - 2) + style.white("┤");
    lines.push(" ".repeat(leftOffset) + separator + " ".repeat(rightOffset));

    for (let i = 0; i < visibleContentHeight; i++) {
      const contentLineIndex = this.scrollPosition + i;
      const contentLine = contentLines[contentLineIndex] || "";
      const visibleLength = visibleWidth(contentLine);
      const padding = " ".repeat(Math.max(0, contentWidth - visibleLength));
      const line = `${style.white("│")} ${contentLine}${padding} ${style.white("│")}`;
      lines.push(" ".repeat(leftOffset) + line + " ".repeat(rightOffset));
    }

    // Fill remaining content area with empty lines if needed
    const remainingLines = modalHeight - 4 - visibleContentHeight;
    for (let i = 0; i < remainingLines; i++) {
      lines.push(" ".repeat(leftOffset) + emptyLine + " ".repeat(rightOffset));
    }

    // Bottom border
    lines.push(
      " ".repeat(leftOffset) +
        style.white("└") +
        horizontalBorder +
        style.white("┘") +
        " ".repeat(rightOffset),
    );

    // Fill remaining terminal height with empty lines
    const totalLinesSoFar = lines.length;
    const remainingTerminalLines = Math.max(
      0,
      terminalHeight - totalLinesSoFar,
    );
    for (let i = 0; i < remainingTerminalLines; i++) {
      lines.push(" ".repeat(width));
    }

    return lines;
  }

  getCursorPosition(): [number, number] | null {
    // Modal doesn't have its own cursor, but children might
    if (this.children.length > 0) {
      const childCursor = this.children[0].getCursorPosition?.();
      if (childCursor) {
        // Adjust cursor position for modal frame and centering
        const [childRow, childCol] = childCursor;
        const modalWidth = Math.min(this.maxWidth, 80 - 4);
        const horizontalOffset = Math.floor((80 - modalWidth) / 2);

        // Top padding + title + separator + content offset
        const { columns } = getTerminalSize();
        const terminalHeight = columns;
        const modalHeight = Math.min(this.maxHeight, terminalHeight - 4);
        const topPadding = Math.max(
          0,
          Math.floor((terminalHeight - modalHeight) / 2),
        );

        return [
          topPadding + 3 + childRow, // 3 = top border + title + separator
          horizontalOffset + 2 + childCol, // 2 = left border + padding
        ];
      }
    }
    return null;
  }
}

/**
 * ModalText component - displays text content in a modal with word wrapping
 */
export class ModalText extends Container {
  private text: string;
  private paddingX: number;
  private paddingY: number;

  constructor(text: string, paddingX = 1, paddingY = 0) {
    super();
    this.text = text;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
  }

  override render(width: number): string[] {
    const lines: string[] = [];
    const contentWidth = Math.max(1, width - this.paddingX * 2);

    if (!this.text || this.text.trim() === "") {
      return [];
    }

    // Replace tabs with spaces
    const normalizedText = this.text.replace(/\t/g, "   ");
    const textLines = normalizedText.split("\n");

    for (const line of textLines) {
      const visibleLineLength = visibleWidth(line);

      if (visibleLineLength <= contentWidth) {
        lines.push(line);
      } else {
        // Word wrap
        const words = line.split(" ");
        let currentLine = "";

        for (const word of words) {
          const currentVisible = visibleWidth(currentLine);
          const wordVisible = visibleWidth(word);

          let finalWord = word;
          if (wordVisible > contentWidth) {
            // Truncate word to fit
            let truncated = "";
            for (const char of word) {
              if (visibleWidth(truncated + char) > contentWidth) {
                break;
              }
              truncated += char;
            }
            finalWord = truncated;
          }

          if (currentVisible === 0) {
            currentLine = finalWord;
          } else if (
            currentVisible + 1 + visibleWidth(finalWord) <=
            contentWidth
          ) {
            currentLine += ` ${finalWord}`;
          } else {
            lines.push(currentLine);
            currentLine = finalWord;
          }
        }

        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
      }
    }

    // Add padding
    const leftPad = " ".repeat(this.paddingX);
    const paddedLines: string[] = [];

    // Top padding
    for (let i = 0; i < this.paddingY; i++) {
      paddedLines.push("");
    }

    // Content with horizontal padding
    for (const line of lines) {
      const visibleLength = visibleWidth(line);
      const rightPadLength = Math.max(0, width - this.paddingX - visibleLength);
      const rightPad = " ".repeat(rightPadLength);
      paddedLines.push(leftPad + line + rightPad);
    }

    // Bottom padding
    for (let i = 0; i < this.paddingY; i++) {
      paddedLines.push("");
    }

    return paddedLines;
  }
}
