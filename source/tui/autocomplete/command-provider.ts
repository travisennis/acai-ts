import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";

export interface SlashCommand {
  name: string;
  description?: string;
  // Function to get argument completions for this command
  // Returns null if no argument completion is available
  getArgumentCompletions?(argumentPrefix: string): AutocompleteItem[] | null;
}

export class CommandProvider<T extends SlashCommand | AutocompleteItem>
  implements AutocompleteProvider
{
  private commands: T[];

  constructor(commands: T[] = []) {
    this.commands = commands;
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for slash commands
    if (textBeforeCursor.startsWith("/")) {
      const spaceIndex = textBeforeCursor.indexOf(" ");

      if (spaceIndex === -1) {
        // No space yet - complete command names
        const prefix = textBeforeCursor.slice(1); // Remove the "/"
        const filtered = this.commands
          .filter((cmd) => {
            const name = "name" in cmd ? cmd.name : cmd.value; // Check if SlashCommand or AutocompleteItem
            return name?.toLowerCase().startsWith(prefix.toLowerCase());
          })
          .map((cmd) => ({
            value: "name" in cmd ? cmd.name : cmd.value,
            label: "name" in cmd ? cmd.name : cmd.label,
            ...(cmd.description && { description: cmd.description }),
          }));

        if (filtered.length === 0) return null;

        return {
          items: filtered,
          prefix: prefix, // Return the actual prefix used for filtering (without "/")
        };
      }

      // Space found - complete command arguments
      const commandName = textBeforeCursor.slice(1, spaceIndex); // Command without "/"
      const argumentText = textBeforeCursor.slice(spaceIndex + 1); // Text after space

      const command = this.commands.find((cmd) => {
        const name = "name" in cmd ? cmd.name : cmd.value;
        return name === commandName;
      });

      if (
        !command ||
        !("getArgumentCompletions" in command) ||
        !command.getArgumentCompletions
      ) {
        return null; // No argument completion for this command
      }

      const argumentSuggestions =
        command.getArgumentCompletions?.(argumentText);
      if (!argumentSuggestions || argumentSuggestions.length === 0) {
        return null;
      }

      return {
        items: argumentSuggestions,
        prefix: argumentText,
      };
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
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check if we're completing a slash command (prefix doesn't start with "/" but we're in slash command context)
    if (textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) {
      // This is a command name completion
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const newLine = `${beforePrefix}${item.value} ${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + 1, // +1 for space
      };
    }

    // Check if we're in a slash command context (beforePrefix contains "/command ")
    if (textBeforeCursor.includes("/") && textBeforeCursor.includes(" ")) {
      // This is likely a command argument completion
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const newLine = beforePrefix + item.value + afterCursor;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;

      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length,
      };
    }

    // If we get here, this provider shouldn't handle the completion
    // Return unchanged to let other providers handle it
    return { lines, cursorLine, cursorCol };
  }
}
