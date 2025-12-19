import { initExecutionEnvironment } from "../execution/index.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Modal, ModalText } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const reviewCommand = (_options: CommandOptions): ReplCommand => {
  return {
    command: "/review",
    description: "Shows a diff of all changes in the current directory.",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
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
          // If there are no changes, show a message
          const modalContent = new ModalText(
            "No changes detected in the current directory.",
            1,
            1,
          );
          const modal = new Modal("Review Changes", modalContent, true, () => {
            editor.setText("");
            tui.requestRender();
          });
          tui.showModal(modal);
          return "continue";
        }

        // Format the diff output for display
        const formattedDiff = formatGitDiff(combinedOutput);

        // Create modal content
        const modalContent = new ModalText(formattedDiff, 1, 1);

        // Create and show modal
        const modal = new Modal("Review Changes", modalContent, true, () => {
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(modal);
        return "continue";
      } catch (error) {
        console.error("Error executing git diff:", error);
        const modalContent = new ModalText(
          "Failed to retrieve git changes. Ensure git is installed and initialized.",
          1,
          1,
        );
        const modal = new Modal("Review Changes", modalContent, true, () => {
          editor.setText("");
          tui.requestRender();
        });
        tui.showModal(modal);
        return "continue";
      }
    },
  };
};

function formatGitDiff(diffOutput: string): string {
  const lines = diffOutput.split("\n");
  const formattedLines: string[] = [];
  let currentFile = "";
  let inDiff = false;
  let isNewFile = false;
  let fileCount = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      // Add spacing between files
      if (fileCount > 0) {
        formattedLines.push("");
        formattedLines.push("");
      }

      // Extract file name from diff header
      const fileMatch = line.match(/diff --git a\/(.*) b\/(.*)/);
      if (fileMatch) {
        currentFile = fileMatch[1];
        inDiff = true;
        isNewFile =
          fileMatch[1] === "/dev/null" || fileMatch[2] === "/dev/null"; // Check if it's a new or deleted file
        formattedLines.push(
          style.bold(style.underline.yellow(`${currentFile}`)),
        );
        formattedLines.push("");
        fileCount++;
      }
    } else if (line.startsWith("@@")) {
      // Extract additions and deletions from the @@ line
      const statsMatch = line.match(/\+(\d+),(\d+)/);
      if (statsMatch) {
        const additions = Number.parseInt(statsMatch[2], 10);
        const deletions = Number.parseInt(statsMatch[1], 10);
        // For new files, deletions should be 0
        const actualDeletions = isNewFile ? 0 : deletions;
        formattedLines.push(
          style.dim(
            `Additions: ${style.green(additions.toString())}, Deletions: ${style.red(actualDeletions.toString())}`,
          ),
        );
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      if (inDiff) {
        formattedLines.push(style.green(`+${line.substring(1)}`));
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      if (inDiff && !isNewFile) {
        // Skip deletions for new files
        formattedLines.push(style.red(`-${line.substring(1)}`));
      }
    } else if (line.startsWith(" ")) {
      if (inDiff) {
        formattedLines.push(` ${line.substring(1)}`);
      }
    } else if (
      line.startsWith("index") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("deleted file") ||
      line.startsWith("new file")
    ) {
      // Skip these lines
    } else if (line.trim() === "") {
      // Skip empty lines
    } else {
      // Add other lines as-is
      formattedLines.push(line);
    }
  }

  return formattedLines.join("\n");
}
