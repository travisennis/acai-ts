import type { Container, Editor, TUI } from "../../tui/index.ts";

export function hideModelSelector(
  editorContainer: Container,
  editor: Editor,
  tui: TUI,
): void {
  editorContainer.clear();
  editorContainer.addChild(editor);
  tui.setFocus(editor);
}
