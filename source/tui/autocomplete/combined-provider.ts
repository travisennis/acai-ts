import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";

export class CombinedProvider implements AutocompleteProvider {
  private providers: AutocompleteProvider[];

  constructor(providers: AutocompleteProvider[]) {
    this.providers = providers;
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    // Try each provider in order until we get suggestions
    for (const provider of this.providers) {
      const result = await provider.getSuggestions(
        lines,
        cursorLine,
        cursorCol,
      );
      if (result) {
        return result;
      }
    }
    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    // Try each provider to find the one that can handle this completion
    for (const provider of this.providers) {
      const result = provider.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
      // If the result is different from input, this provider handled it
      if (
        result.lines !== lines ||
        result.cursorLine !== cursorLine ||
        result.cursorCol !== cursorCol
      ) {
        return result;
      }
    }
    // If no provider handled it, return unchanged
    return { lines, cursorLine, cursorCol };
  }

  // Force file completion (called on Tab key) - always returns suggestions
  async getForceFileSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    if (!this.shouldTriggerFileCompletion(lines, cursorLine, cursorCol)) {
      return null;
    }
    // Try each provider that has getForceFileSuggestions method
    for (const provider of this.providers) {
      if (
        "getForceFileSuggestions" in provider &&
        typeof provider.getForceFileSuggestions === "function"
      ) {
        const result = await provider.getForceFileSuggestions(
          lines,
          cursorLine,
          cursorCol,
        );
        if (result) {
          return result;
        }
      }
    }
    return null;
  }

  // Check if we should trigger file completion (called on Tab key)
  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    // Try each provider that has shouldTriggerFileCompletion method
    for (const provider of this.providers) {
      if (
        "shouldTriggerFileCompletion" in provider &&
        typeof provider.shouldTriggerFileCompletion === "function"
      ) {
        const result = provider.shouldTriggerFileCompletion(
          lines,
          cursorLine,
          cursorCol,
        );
        if (result === false) {
          return false;
        }
      }
    }
    return true;
  }
}
