import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createUserMessage } from "../../sessions/manager.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import type { CommandOptions } from "../types.ts";
import type { HandoffFile } from "./types.ts";

export function hidePickupSelector(
  editorContainer: Container,
  editor: Editor,
  tui: TUI,
): void {
  editorContainer.clear();
  editorContainer.addChild(editor);
  tui.setFocus(editor);
}

export async function getAvailableHandoffFiles(): Promise<HandoffFile[]> {
  const handoffsDir = ".acai/handoffs";
  try {
    const { readdir, stat } = await import("node:fs/promises");
    const dirents = await readdir(handoffsDir, {
      withFileTypes: true,
    });
    const files: HandoffFile[] = [];
    for (const dirent of dirents) {
      if (dirent.isFile() && dirent.name.match(/^handoff-.*\.md$/)) {
        const filepath = `${handoffsDir}/${dirent.name}`;
        const stats = await stat(filepath);
        files.push({
          name: basename(dirent.name, ".md"),
          filename: dirent.name,
          createdAt: stats.mtime,
        });
      }
    }
    files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    return [];
  }
}

export async function loadHandoff(
  handoff: HandoffFile,
  options: CommandOptions,
  container: Container,
  tui: TUI,
  editor: Editor,
): Promise<void> {
  const { sessionManager, modelManager } = options;
  const filepath = `.acai/handoffs/${handoff.filename}`;

  try {
    const handoffContent = await readFile(filepath, "utf8");

    container.addChild(
      new (await import("../../tui/index.ts")).Text(
        `Loading handoff: ${(await import("../../terminal/style.ts")).default.blue(handoff.name)}`,
        0,
        1,
      ),
    );

    sessionManager.create(modelManager.getModel("repl").modelId);
    sessionManager.appendUserMessage(createUserMessage([], handoffContent));

    container.addChild(
      new (await import("../../tui/index.ts")).Text(
        "Handoff loaded successfully.",
        1,
        0,
      ),
    );
    container.addChild(
      new (await import("../../tui/index.ts")).Text(
        "You can now continue with your previous work.",
        2,
        0,
      ),
    );

    tui.requestRender();
    editor.setText("");
  } catch (error) {
    container.addChild(
      new (await import("../../tui/index.ts")).Text(
        `Error loading handoff: ${error}`,
        0,
        1,
      ),
    );
    tui.requestRender();
    editor.setText("");
  }
}
