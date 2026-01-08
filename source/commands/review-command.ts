import { initExecutionEnvironment } from "../execution/index.ts";
import { getTerminalSize } from "../terminal/control.ts";
import style from "../terminal/style.ts";
import type { AutocompleteItem } from "../tui/autocomplete.ts";
import { Markdown } from "../tui/components/markdown.ts";
import { Spacer } from "../tui/components/spacer.ts";
import {
  Container,
  type Editor,
  SelectList,
  Text,
  type TUI,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const reviewCommand = (_options: CommandOptions): ReplCommand => {
  return {
    command: "/review",
    description: "Shows a diff of all changes in the current directory.",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
        inputContainer,
      }: {
        tui: TUI;
        container: Container;
        editor: Editor;
        inputContainer: Container;
      },
    ): Promise<"break" | "continue" | "use"> {
      try {
        // Initialize execution environment
        const execEnv = await initExecutionEnvironment();

        // Execute git diff to get all changes (both staged and unstaged)
        const stagedResult = await execEnv.executeCommand("git diff --cached", {
          cwd: process.cwd(),
          timeout: 5000,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
        });

        const unstagedResult = await execEnv.executeCommand("git diff", {
          cwd: process.cwd(),
          timeout: 5000,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
        });

        // Combine staged and unstaged changes
        const stagedOutput =
          stagedResult.exitCode === 0 ? stagedResult.output : "";
        const unstagedOutput =
          unstagedResult.exitCode === 0 ? unstagedResult.output : "";
        const combinedOutput =
          stagedOutput +
          (stagedOutput && unstagedOutput ? "\n" : "") +
          unstagedOutput;

        if (!combinedOutput.trim()) {
          // If there are no changes, show a message in chat container
          container.addChild(new Spacer(1));
          container.addChild(
            new Markdown("No changes detected in the current directory.", {
              customBgRgb: {
                r: 52,
                g: 53,
                b: 65,
              },
              paddingX: 1,
              paddingY: 1,
            }),
          );
          tui.requestRender();
          return "continue";
        }

        // Parse individual file changes
        const fileChanges = parseGitDiffFiles(combinedOutput);

        if (fileChanges.length === 0) {
          container.addChild(new Spacer(1));
          container.addChild(
            new Markdown("No file changes could be parsed.", {
              customBgRgb: {
                r: 52,
                g: 53,
                b: 65,
              },
              paddingX: 1,
              paddingY: 1,
            }),
          );
          tui.requestRender();
          return "continue";
        }

        // Create select list for file selection
        const selectItems: AutocompleteItem[] = fileChanges.map((file) => ({
          value: file.fileName,
          label: file.fileName,
          description: file.stats,
        }));

        // Create select list component
        const selectList = new SelectList(selectItems, 10);

        // Create a container to wrap the select list with borders for better visual isolation
        const selectContainer = new Container();
        const { columns } = getTerminalSize();

        // Add top border
        selectContainer.addChild(
          new Text(style.blue("─".repeat(columns)), 0, 0),
        );
        selectContainer.addChild(new Spacer(1));

        // Add the select list
        selectContainer.addChild(selectList);

        selectContainer.addChild(new Spacer(1));

        // Add bottom border
        selectContainer.addChild(
          new Text(style.blue("─".repeat(columns)), 0, 0),
        );

        // Store the original editor and replace it with the select container
        const originalEditor = editor;
        inputContainer.clear();
        inputContainer.addChild(selectContainer);
        tui.setFocus(selectList);

        // Handle file selection
        selectList.onSelect = (selectedItem) => {
          // Find the selected file change
          const selectedFile = fileChanges.find(
            (file) => file.fileName === selectedItem.value,
          );

          if (selectedFile) {
            // Show the diff in the chat container
            container.addChild(new Spacer(1));
            container.addChild(
              new Markdown(
                formatFileDiffForDisplay(
                  selectedFile.fileName,
                  selectedFile.diff,
                ),
                {
                  customBgRgb: {
                    r: 52,
                    g: 53,
                    b: 65,
                  },
                  paddingX: 1,
                  paddingY: 1,
                },
              ),
            );

            // Restore the original editor
            inputContainer.clear();
            inputContainer.addChild(originalEditor);
            tui.setFocus(originalEditor);
            tui.requestRender();
          }
        };

        // Handle cancel
        selectList.onCancel = () => {
          // Restore the original editor
          inputContainer.clear();
          inputContainer.addChild(originalEditor);
          tui.setFocus(originalEditor);
          tui.requestRender();
        };

        tui.requestRender();
        return "continue";
      } catch (error) {
        console.error("Error executing git diff:", error);
        container.addChild(new Spacer(1));
        container.addChild(
          new Markdown(
            "Failed to retrieve git changes. Ensure git is installed and initialized.",
            {
              customBgRgb: {
                r: 52,
                g: 53,
                b: 65,
              },
              paddingX: 1,
              paddingY: 1,
            },
          ),
        );
        tui.requestRender();
        return "continue";
      }
    },
  };
};

interface FileChange {
  fileName: string;
  diff: string;
  stats: string;
}

export function parseGitDiffFiles(diffOutput: string): FileChange[] {
  const lines = diffOutput.split("\n");
  const fileChanges: FileChange[] = [];
  let currentFile: FileChange | null = null;
  let inDiff = false;
  let isNewFile = false;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      // Start of a new file diff
      if (currentFile) {
        // Save previous file
        fileChanges.push(currentFile);
      }

      // Extract file name from diff header
      const fileMatch = line.match(/diff --git a\/(.*) b\/(.*)/);
      if (fileMatch) {
        currentFile = {
          fileName: fileMatch[1],
          diff: "",
          stats: "",
        };
        inDiff = true;
        isNewFile =
          fileMatch[1] === "/dev/null" || fileMatch[2] === "/dev/null";
      }
    } else if (line.startsWith("@@")) {
      // Extract additions and deletions from the @@ line
      const statsMatch = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (statsMatch && currentFile) {
        const deletions = Number.parseInt(statsMatch[2], 10);
        const additions = Number.parseInt(statsMatch[4], 10);
        const actualDeletions = isNewFile ? 0 : deletions;
        currentFile.stats = `Additions: ${additions}, Deletions: ${actualDeletions}`;
      } else if (currentFile) {
        // Fallback for files without proper @@ line (like new files)
        currentFile.stats = "Additions: 1, Deletions: 0";
      }
    } else if (inDiff && currentFile) {
      // Collect diff content
      if (
        (line.startsWith("+") && !line.startsWith("+++")) ||
        (line.startsWith("-") && !line.startsWith("---")) ||
        line.startsWith(" ") ||
        line.startsWith("index") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode") ||
        line.startsWith("deleted file") ||
        line.startsWith("new file")
      ) {
        currentFile.diff += `${line}\n`;
      }
    }
  }

  // Don't forget the last file
  if (currentFile) {
    fileChanges.push(currentFile);
  }

  return fileChanges;
}

export function formatFileDiffForDisplay(
  fileName: string,
  diff: string,
): string {
  const lines = diff.split("\n");
  const formattedLines: string[] = [];

  // Add file name header
  formattedLines.push(`### ${style.bold(style.underline.yellow(fileName))}`);
  formattedLines.push("");

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      formattedLines.push(style.green(`+${line.substring(1)}`));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      formattedLines.push(style.red(`-${line.substring(1)}`));
    } else if (line.startsWith(" ")) {
      formattedLines.push(` ${line.substring(1)}`);
    } else if (line.startsWith("@@")) {
      formattedLines.push(style.dim(line));
    } else if (
      line.startsWith("index") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("deleted file") ||
      line.startsWith("new file")
    ) {
      // Skip these lines or add as dim text
      formattedLines.push(style.dim(line));
    } else if (line.trim() === "") {
    } else {
      formattedLines.push(line);
    }
  }

  return formattedLines.join("\n");
}
