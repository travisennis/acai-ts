import { logger } from "../../logger.ts";
import {
  getTerminalSize,
  isArrowDown,
  isArrowUp,
  isEnter,
  isEscape,
  isShiftTab,
  isTab,
} from "../../terminal/control.ts";
import style from "../../terminal/style.ts";
import {
  Container,
  type Editor,
  Input,
  Spacer,
  Text,
  type TUI,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import { generateRulesFromSession } from "./service.ts";
import { hideRuleSelector } from "./utils.ts";

export const generateRulesCommand = ({
  sessionManager,
  modelManager,
  tokenTracker,
  config,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/generate-rules",
    description:
      "Analyzes the current conversation to generate and save new interaction rules, then displays them.",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      _args: string[],
      {
        tui,
        container,
        inputContainer,
        editor,
      }: {
        tui: TUI;
        container: Container;
        inputContainer: Container;
        editor: Editor;
      },
    ): Promise<"break" | "continue" | "use"> {
      if (sessionManager.isEmpty()) {
        container.addChild(
          new Text(
            style.yellow("Cannot generate rules from an empty conversation."),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      container.addChild(
        new Text("Analyzing conversation to generate rules...", 0, 1),
      );
      tui.requestRender();

      try {
        const { rules: newRules } = await generateRulesFromSession({
          modelManager,
          messages: sessionManager.get(),
          tokenTracker,
          config,
          workspace,
        });

        if (newRules == null || newRules.length === 0) {
          container.addChild(
            new Text(
              style.yellow("No new generalizable rules were identified."),
              2,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        const ruleSelector = new RuleSelectorComponent(
          newRules,
          async (selectedRules) => {
            if (selectedRules.length === 0) {
              container.addChild(
                new Text(style.yellow("No rules selected to save."), 2, 0),
              );
            } else {
              try {
                const existingRules =
                  await config.readProjectLearnedRulesFile();
                const rulesToAdd = selectedRules.join("\n");
                const updatedProjectRules =
                  existingRules.endsWith("\n") || existingRules.length === 0
                    ? `${existingRules}${rulesToAdd}`
                    : `${existingRules}\n${rulesToAdd}`;

                await config.writeProjectLearnedRulesFile(updatedProjectRules);
                container.addChild(
                  new Text(
                    style.green(
                      "Selected rules saved to project learned rules.",
                    ),
                    2,
                    0,
                  ),
                );
                container.addChild(new Text(style.dim("Saved rules:"), 3, 0));
                selectedRules.forEach((rule, index) => {
                  container.addChild(new Text(`- ${rule}`, 4 + index, 0));
                });
              } catch (error) {
                container.addChild(
                  new Text(style.red(`Failed to save rules: ${error}`), 2, 0),
                );
              }
            }

            hideRuleSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
          () => {
            hideRuleSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
        );

        inputContainer.clear();
        inputContainer.addChild(ruleSelector);
        tui.setFocus(ruleSelector);
        tui.requestRender();
        return "continue";
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        container.addChild(
          new Text(style.red(`Error generating rules: ${errorMessage}`), 0, 1),
        );
        logger.error(error, "Error during rule generation:");
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};

class RuleSelectorComponent extends Container {
  private searchInput: Input;
  private listContainer: Container;
  private allRules: string[] = [];
  private filteredRules: string[] = [];
  private selectedIndex = 0;
  private selectedRules = new Set<number>();
  private onSelectCallback: (rules: string[]) => void;
  private onCancelCallback: () => void;

  constructor(
    rules: string[],
    onSelect: (rules: string[]) => void,
    onCancel: () => void,
  ) {
    super();

    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    this.allRules = rules;
    this.filteredRules = rules;

    const { columns } = getTerminalSize();

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      this.toggleSelection(this.selectedIndex);
    };
    this.addChild(this.searchInput);

    this.addChild(new Spacer(1));

    this.listContainer = new Container();
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));

    this.addChild(
      new Text(
        style.dim("Space: toggle selection, Enter: confirm, Escape: cancel"),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));

    this.updateList();
  }

  private filterRules(query: string): void {
    if (!query.trim()) {
      this.filteredRules = this.allRules;
    } else {
      const searchTokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t);
      this.filteredRules = this.allRules.filter((rule) => {
        const searchText = rule.toLowerCase();
        return searchTokens.every((token) => searchText.includes(token));
      });
    }

    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredRules.length - 1),
    );
    this.updateList();
  }

  private updateList(): void {
    this.listContainer.clear();

    const maxVisible = 10;
    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(maxVisible / 2),
        this.filteredRules.length - maxVisible,
      ),
    );
    const endIndex = Math.min(
      startIndex + maxVisible,
      this.filteredRules.length,
    );

    for (let i = startIndex; i < endIndex; i++) {
      const rule = this.filteredRules[i];
      if (!rule) continue;

      const isSelected = i === this.selectedIndex;
      const isChecked = this.selectedRules.has(i);

      let line = "";
      if (isSelected) {
        const prefix = style.blue("→ ");
        const checkbox = isChecked ? style.green("[✓] ") : "[ ] ";
        const ruleText = rule;
        line = `${prefix + checkbox + style.blue(ruleText)}`;
      } else {
        const checkbox = isChecked ? style.green("[✓] ") : "[ ] ";
        const ruleText = `  ${rule}`;
        line = `${checkbox + ruleText}`;
      }

      this.listContainer.addChild(new Text(line, 0, 0));
    }

    if (startIndex > 0 || endIndex < this.filteredRules.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredRules.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    if (this.filteredRules.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching rules"), 0, 0),
      );
    }
  }

  wantsNavigationKeys(): boolean {
    return true;
  }

  handleInput(keyData: string): void {
    if (isArrowUp(keyData) || isShiftTab(keyData)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateList();
    } else if (isArrowDown(keyData) || isTab(keyData)) {
      this.selectedIndex = Math.min(
        this.filteredRules.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    } else if (keyData === " ") {
      this.toggleSelection(this.selectedIndex);
    } else if (isEnter(keyData)) {
      this.handleConfirm();
    } else if (isEscape(keyData)) {
      this.onCancelCallback();
    } else {
      this.searchInput.handleInput(keyData);
      this.filterRules(this.searchInput.getValue());
    }
  }

  private toggleSelection(index: number): void {
    if (this.selectedRules.has(index)) {
      this.selectedRules.delete(index);
    } else {
      this.selectedRules.add(index);
    }
    this.updateList();
  }

  private handleConfirm(): void {
    const selectedRuleTexts = Array.from(this.selectedRules)
      .map((index) => this.filteredRules[index])
      .filter((rule): rule is string => rule !== undefined);
    this.onSelectCallback(selectedRuleTexts);
  }

  getSearchInput(): Input {
    return this.searchInput;
  }
}
