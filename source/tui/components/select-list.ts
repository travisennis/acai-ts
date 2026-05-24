import {
  isArrowDown,
  isArrowUp,
  isCtrlC,
  isEnter,
  isEscape,
  isShiftTab,
  isTab,
} from "../../terminal/keys.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { truncateToWidth } from "../utils.ts";

export interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

export interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export class SelectList implements Component {
  private items: SelectItem[] = [];
  private filteredItems: SelectItem[] = [];
  private selectedIndex = 0;
  private maxVisible = 5;
  private theme: SelectListTheme;

  public onSelect?: (item: SelectItem) => void;
  public onCancel?: () => void;
  public onSelectionChange?: (item: SelectItem) => void;

  constructor(items: SelectItem[], maxVisible = 5, theme?: SelectListTheme) {
    this.items = items;
    this.filteredItems = items;
    this.maxVisible = maxVisible;
    this.theme = theme || this.createDefaultTheme();
  }

  private createDefaultTheme(): SelectListTheme {
    return {
      selectedPrefix: (text: string) => style.blue(text),
      selectedText: (text: string) => style.blue(text),
      description: (text: string) => style.gray(text),
      scrollInfo: (text: string) => style.gray(text),
      noMatch: (text: string) => style.gray(text),
    };
  }

  updateItems(items: SelectItem[]) {
    this.items = items;
    this.filteredItems = items;
    // Reset selection to first item when items change
    this.setSelectedIndex(0);
    this.notifySelectionChange();
  }

  setFilter(filter: string): void {
    this.filteredItems = this.items.filter((item) =>
      item.value.toLowerCase().startsWith(filter.toLowerCase()),
    );
    // Reset selection when filter changes
    this.selectedIndex = 0;
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = Math.max(
      0,
      Math.min(index, this.filteredItems.length - 1),
    );
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // If no items match filter, show message
    if (this.filteredItems.length === 0) {
      lines.push(this.theme.noMatch("  No matching commands"));
      return lines;
    }

    // Calculate visible range with scrolling
    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisible / 2),
        this.filteredItems.length - this.maxVisible,
      ),
    );
    const endIndex = Math.min(
      startIndex + this.maxVisible,
      this.filteredItems.length,
    );

    // Render visible items
    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredItems[i];
      if (!item) continue;

      const isSelected = i === this.selectedIndex;
      lines.push(this.formatItemLine(item, isSelected, width));
    }

    // Add scroll indicators if needed
    if (startIndex > 0 || endIndex < this.filteredItems.length) {
      const scrollText = `  (${this.selectedIndex + 1}/${this.filteredItems.length})`;
      lines.push(
        this.theme.scrollInfo(truncateToWidth(scrollText, width - 2, "...")),
      );
    }

    return lines;
  }

  private formatItemLine(
    item: SelectItem,
    isSelected: boolean,
    width: number,
  ): string {
    const displayValue = item.label || item.value;
    const prefixWidth = 2;
    const prefix = isSelected ? "→ " : "  ";

    // Try to show description if available and enough width
    if (item.description && width > 40) {
      const maxValueWidth = width - prefixWidth - 4;
      const truncatedValue = truncateToWidth(
        displayValue,
        maxValueWidth,
        "...",
      );
      const spacing = " ".repeat(Math.max(1, 32 - truncatedValue.length));

      const descriptionStart =
        prefixWidth + truncatedValue.length + spacing.length;
      const remainingWidth = width - descriptionStart - 2;

      if (remainingWidth > 10) {
        const truncatedDesc = truncateToWidth(
          item.description,
          remainingWidth,
          "...",
        );
        const content = `${prefix}${truncatedValue}${spacing}${truncatedDesc}`;
        return isSelected
          ? this.theme.selectedText(content)
          : `${prefix}${truncatedValue}${this.theme.description(spacing + truncatedDesc)}`;
      }
    }

    // Fallback: no description or not enough room
    const maxWidth = width - prefixWidth - 2;
    const truncated = truncateToWidth(displayValue, maxWidth, "...");
    if (isSelected) {
      return this.theme.selectedText(`${prefix}${truncated}`);
    }
    return `${prefix}${truncated}`;
  }

  wantsNavigationKeys(): boolean {
    return true;
  }

  handleInput(keyData: string): void {
    if (isArrowUp(keyData)) {
      this.moveSelectionUp();
      return;
    }
    if (isArrowDown(keyData)) {
      this.moveSelectionDown();
      return;
    }
    if (isTab(keyData)) {
      this.moveSelectionDown();
      return;
    }
    if (isShiftTab(keyData)) {
      this.moveSelectionUp();
      return;
    }
    if (isEnter(keyData)) {
      this.selectCurrentItem();
      return;
    }
    if (isEscape(keyData) || isCtrlC(keyData)) {
      this.cancelSelection();
    }
  }

  private moveSelectionUp(): void {
    this.selectedIndex =
      this.selectedIndex === 0
        ? this.filteredItems.length - 1
        : this.selectedIndex - 1;
    this.notifySelectionChange();
  }

  private moveSelectionDown(): void {
    this.selectedIndex =
      this.selectedIndex === this.filteredItems.length - 1
        ? 0
        : this.selectedIndex + 1;
    this.notifySelectionChange();
  }

  private selectCurrentItem(): void {
    const selectedItem = this.filteredItems[this.selectedIndex];
    if (selectedItem && this.onSelect) {
      this.onSelect(selectedItem);
    }
  }

  private cancelSelection(): void {
    if (this.onCancel) {
      this.onCancel();
    }
  }

  private notifySelectionChange(): void {
    const selectedItem = this.filteredItems[this.selectedIndex];
    if (selectedItem && this.onSelectionChange) {
      this.onSelectionChange(selectedItem);
    }
  }

  getSelectedItem(): SelectItem | null {
    const item = this.filteredItems[this.selectedIndex];
    return item || null;
  }
}
