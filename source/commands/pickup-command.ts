import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { logger } from "../logger.ts";
import { createUserMessage } from "../sessions/manager.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const pickupCommand = (options: CommandOptions): ReplCommand => {
  return {
    command: "/pickup",
    description:
      "Loads a handoff file into a new session to continue previous work. Usage: /pickup <filename>",

    getSubCommands: async (): Promise<string[]> => {
      const getHandoffFileNames = async (): Promise<string[]> => {
        const handoffsDir = ".acai/handoffs";
        try {
          const dirents = await readdir(handoffsDir, {
            withFileTypes: true,
          });
          return dirents
            .filter(
              (dirent) =>
                dirent.isFile() && dirent.name.match(/^handoff-.*\.md$/),
            )
            .map((dirent) => basename(dirent.name, ".md"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return []; // Directory doesn't exist, return empty array
          }
          logger.error(`Error reading handoff files: ${error}`);
          return []; // Return empty on other errors too, but log them
        }
      };

      return await getHandoffFileNames();
    },

    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const { sessionManager: messageHistory, modelManager } = options;

      // Validate that filename is provided
      const filename = args.join(" ").trim();
      if (!filename) {
        const availableFiles = await getAvailableHandoffFiles(options);
        if (availableFiles.length === 0) {
          container.addChild(
            new Text(
              style.red(
                "No handoff files found. Create a handoff file first using /handoff <purpose>",
              ),
              1,
              0,
            ),
          );
        } else {
          container.addChild(
            new Text(style.red("Please specify a handoff file to load."), 0, 1),
          );
          container.addChild(new Text("Available handoff files:", 2, 0));
          availableFiles.forEach((file, index) => {
            container.addChild(new Text(`  • ${file}.md`, 3 + index, 0));
          });
        }
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      // Ensure filename has .md extension for file operations
      const filenameWithExt = filename.endsWith(".md")
        ? filename
        : `${filename}.md`;
      const handoffsDir = ".acai/handoffs";
      const filepath = `${handoffsDir}/${filenameWithExt}`;

      try {
        // Read the handoff file
        const handoffContent = await readFile(filepath, "utf8");

        container.addChild(
          new Text(
            `Loading handoff file: ${style.blue(filenameWithExt)}`,
            1,
            0,
          ),
        );

        // Create new session (like compact-command does)
        messageHistory.create(modelManager.getModel("repl").modelId);

        // Append handoff content as user message
        messageHistory.appendUserMessage(createUserMessage([], handoffContent));

        container.addChild(
          new Text(
            style.green("Handoff file loaded successfully into new session."),
            2,
            0,
          ),
        );
        container.addChild(
          new Text("You can now continue with your previous work.", 3, 0),
        );

        tui.requestRender();
        editor.setText("");
        return "use";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          container.addChild(
            new Text(
              style.red(`Handoff file not found: ${filenameWithExt}`),
              1,
              0,
            ),
          );

          // Show available files as helpful suggestion
          const availableFiles = await getAvailableHandoffFiles(options);
          if (availableFiles.length > 0) {
            container.addChild(new Text("Available handoff files:", 2, 0));
            availableFiles.forEach((file, index) => {
              container.addChild(new Text(`  • ${file}.md`, 3 + index, 0));
            });
          }
        } else {
          container.addChild(
            new Text(style.red(`Error reading handoff file: ${error}`), 0, 1),
          );
        }
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};

async function getAvailableHandoffFiles(
  _options: CommandOptions,
): Promise<string[]> {
  const handoffsDir = ".acai/handoffs";
  try {
    const dirents = await readdir(handoffsDir, {
      withFileTypes: true,
    });
    return dirents
      .filter(
        (dirent) => dirent.isFile() && dirent.name.match(/^handoff-.*\.md$/),
      )
      .map((dirent) => basename(dirent.name, ".md"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    logger.error(`Error reading handoff files: ${error}`);
    return [];
  }
}
