import type { Container, Editor, TUI } from "../../tui/index.ts";

export function hideRuleSelector(
  editorContainer: Container,
  editor: Editor,
  tui: TUI,
): void {
  editorContainer.clear();
  editorContainer.addChild(editor);
  tui.setFocus(editor);
}

export function parseRulesText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length === 0) {
    return [];
  }

  return trimmed
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);
}

export function formatRulesForStorage(
  existingRules: string,
  newRules: string[],
): string {
  if (newRules.length === 0) {
    return existingRules;
  }

  const rulesToAdd = newRules.join("\n");
  if (existingRules.endsWith("\n") || existingRules.length === 0) {
    return `${existingRules}${rulesToAdd}`;
  }
  return `${existingRules}\n${rulesToAdd}`;
}
