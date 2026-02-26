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

  matchesContext(textBeforeCursor: string): boolean {
    return /(?:^|\s)>[^\s]*$/.test(textBeforeCursor);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for skill trigger (">" at start or after whitespace)
    const match = textBeforeCursor.match(/(?:^|[\s])>([^\s]*)$/);
    if (match) {
      const searchTerm = match[1];
      const prefix = `>${searchTerm}`;
      const filtered = this.skills
        .filter(
          (skill) =>
            searchTerm === "" ||
            skill.name.toLowerCase().startsWith(searchTerm.toLowerCase()),
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
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    if (!prefix.startsWith(">")) {
      return { lines, cursorLine, cursorCol };
    }

    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);

    // Replace prefix after ">" with selected skill name
    const newLine = `${beforePrefix}${item.value}${afterCursor}`;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;

    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforePrefix.length + item.value.length + 1,
    };
  }
}
