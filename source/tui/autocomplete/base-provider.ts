export interface AutocompleteItem {
  value: string;
  label: string;
  description?: string;
}

export interface AutocompleteProvider {
  // Get autocomplete suggestions for current text/cursor position
  // Returns null if no suggestions available
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null>;

  // Apply the selected item
  // Returns the new text and cursor position
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number };
}
