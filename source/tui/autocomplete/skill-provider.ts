import type { Skill } from "../../skills/index.ts";
import type {
  AutocompleteItem,
  AutocompleteProvider,
} from "./base-provider.ts";

export class SkillProvider implements AutocompleteProvider {
  private skills: Skill[];

  constructor(skills: Skill[] = []) {
    this.skills = skills;
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for skill trigger (">" at start or after whitespace)
    if (textBeforeCursor.match(/(?:^|[\s])>$/)) {
      // User just typed ">" - show all skills
      const items = this.skills.map((skill) => ({
        value: `\`${skill.name}\` skill`,
        label: skill.name,
        description: skill.description,
      }));

      // Sort alphabetically
      items.sort((a, b) => a.label.localeCompare(b.label));

      return { items, prefix: "" };
    }

    // Check for partial match (typing after ">")
    const match = textBeforeCursor.match(/(?:^|[\s])>([^\s]*)$/);
    if (match) {
      const prefix = match[1];
      const filtered = this.skills
        .filter((skill) =>
          skill.name.toLowerCase().startsWith(prefix.toLowerCase()),
        )
        .map((skill) => ({
          value: `\`${skill.name}\` skill`,
          label: skill.name,
          description: skill.description,
        }));

      filtered.sort((a, b) => a.label.localeCompare(b.label));

      if (filtered.length === 0) return null;

      return { items: filtered, prefix };
    }

    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    _prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Find the position of ">" in the text before cursor
    const triggerMatch = textBeforeCursor.match(/(?:^|[\s])>([^\s]*)$/);
    if (!triggerMatch || triggerMatch.index === undefined) {
      return { lines, cursorLine, cursorCol };
    }

    const triggerStart = triggerMatch.index;
    const beforeTrigger = currentLine.slice(0, triggerStart + 1); // Include ">"
    const afterCursor = currentLine.slice(cursorCol);

    // Replace prefix after ">" with selected skill name
    const newLine = `${beforeTrigger}${item.value}${afterCursor}`;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforeTrigger.length + item.value.length,
    };
  }
}
