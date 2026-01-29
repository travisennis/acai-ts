import { join } from "node:path";
import { initExecutionEnvironment } from "../../execution/index.ts";
import { getTerminalSize } from "../../terminal/control.ts";
import style from "../../terminal/style.ts";
import type { AutocompleteItem } from "../../tui/autocomplete.ts";
import { Markdown } from "../../tui/components/markdown.ts";
import { Spacer } from "../../tui/components/spacer.ts";
import {
  Container,
  type Editor,
  SelectList,
  Text,
  type TUI,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  formatFileDiffForDisplay,
  getUntrackedFiles,
  openFileInEditor,
  parseGitDiffFiles,
} from "./utils.ts";

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
        const execEnv = await initExecutionEnvironment();

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

        const untrackedResult = await execEnv.executeCommand(
          "git ls-files --others --exclude-standard",
          {
            cwd: process.cwd(),
            timeout: 5000,
            preserveOutputOnError: true,
            captureStderr: true,
            throwOnError: false,
          },
        );

        const stagedOutput =
          stagedResult.exitCode === 0 ? stagedResult.output : "";
        const unstagedOutput =
          unstagedResult.exitCode === 0 ? unstagedResult.output : "";
        const untrackedOutput =
          untrackedResult.exitCode === 0 ? untrackedResult.output : "";
        const combinedOutput =
          stagedOutput +
          (stagedOutput && unstagedOutput ? "\n" : "") +
          unstagedOutput;

        if (!combinedOutput.trim()) {
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

        const fileChanges = parseGitDiffFiles(combinedOutput);
        const untrackedFiles = await getUntrackedFiles(
          untrackedOutput,
          process.cwd(),
        );
        fileChanges.push(...untrackedFiles);

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

        const selectItems: AutocompleteItem[] = fileChanges.map((file) => ({
          value: file.fileName,
          label: file.fileName,
          description: file.stats,
        }));

        const selectList = new SelectList(selectItems, 10);

        const selectContainer = new Container();
        const { columns } = getTerminalSize();

        selectContainer.addChild(
          new Text(style.blue("─".repeat(columns)), 0, 0),
        );
        selectContainer.addChild(new Spacer(1));

        selectContainer.addChild(selectList);

        selectContainer.addChild(new Spacer(1));

        selectContainer.addChild(
          new Text(style.blue("─".repeat(columns)), 0, 0),
        );

        const originalEditor = editor;
        inputContainer.clear();
        inputContainer.addChild(selectContainer);
        tui.setFocus(selectList);

        selectList.onSelect = (selectedItem) => {
          const selectedFile = fileChanges.find(
            (file) => file.fileName === selectedItem.value,
          );

          if (!selectedFile) {
            container.addChild(new Spacer(1));
            container.addChild(
              new Markdown(style.red("Error: Selected file not found."), {
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
            return;
          }

          // Show action selection menu (view diff or open in editor)
          const actionItems: AutocompleteItem[] = [
            { value: "diff", label: "View diff", description: "Show changes" },
            {
              value: "edit",
              label: "Open in editor",
              description: `Open in ${process.env["EDITOR"] || process.env["VISUAL"] || "vi"}`,
            },
          ];

          const actionSelectList = new SelectList(actionItems, 5);
          const actionContainer = new Container();
          actionContainer.addChild(new Spacer(1));
          actionContainer.addChild(
            new Text(style.blue(`Selected: ${selectedFile.fileName}`), 0, 0),
          );
          actionContainer.addChild(new Spacer(1));
          actionContainer.addChild(actionSelectList);
          actionContainer.addChild(new Spacer(1));
          actionContainer.addChild(
            new Text(style.blue("─".repeat(columns)), 0, 0),
          );

          inputContainer.clear();
          inputContainer.addChild(actionContainer);
          tui.setFocus(actionSelectList);
          tui.requestRender();

          actionSelectList.onSelect = (actionItem) => {
            if (actionItem.value === "diff") {
              // Show diff
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
            } else if (actionItem.value === "edit") {
              // Open in editor
              const filePath = join(process.cwd(), selectedFile.fileName);
              const result = openFileInEditor(filePath, tui.getTerminal());

              if (!result.success) {
                container.addChild(new Spacer(1));
                container.addChild(
                  new Markdown(
                    `Failed to open file in editor: ${result.error || "Unknown error"}`,
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
              }
            }

            inputContainer.clear();
            inputContainer.addChild(originalEditor);
            tui.setFocus(originalEditor);
            tui.requestRender();
          };

          actionSelectList.onCancel = () => {
            inputContainer.clear();
            inputContainer.addChild(selectContainer);
            tui.setFocus(selectList);
            tui.requestRender();
          };
        };

        selectList.onCancel = () => {
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
