import { generateText, type ModelMessage } from "ai";
import { config } from "../config.ts";
import { logger } from "../logger.ts"; // Import logger
import { createUserMessage } from "../messages.ts";
import type { ModelManager } from "../models/manager.ts";
import { systemPrompt } from "../prompts.ts";
import { getTerminalSize } from "../terminal/formatting.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { TokenTracker } from "../tokens/tracker.ts";
import {
  Container,
  type Editor,
  Input,
  Spacer,
  Text,
  type TUI,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const generateRulesCommand = ({
  messageHistory,
  modelManager,
  tokenTracker,
  config, // This is the config module from CommandOptions
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
      if (messageHistory.isEmpty()) {
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
        const newRules = await analyzeConversation({
          modelManager,
          messages: messageHistory.get(),
          tokenTracker,
        });

        if (!newRules || newRules.length === 0) {
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

        // Create rule selector for TUI mode
        const ruleSelector = new RuleSelectorComponent(
          newRules,
          async (selectedRules) => {
            // Handle rule selection
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

            // Hide selector and show editor again
            hideRuleSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
          () => {
            // Cancel selection - just hide selector
            hideRuleSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
        );

        // Replace editor with rule selector
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

// Modified System Prompt
const system =
  async () => `You are an expert analyst reviewing conversations between a coding agent and a software engineer. Your goal is to identify instances where the engineer corrected the agent's approach or understanding in a way that reveals a *generalizable principle* for improving the agent's future behavior across *different* tasks.

**Your Task:**
1. Analyze the conversation provided.
2. Identify significant corrections or redirections from the engineer. Ignore minor clarifications or task-specific adjustments.
3. For each significant correction, infer a *single, concise, broadly applicable, actionable rule* (starting with 'Always' or 'Never') that captures the underlying principle the agent should follow in the future.
4. Ensure the rule is general enough to be useful in various scenarios, not just the specific context of this conversation.
5. Provide a brief, illustrative quote or example from the conversation in parentheses after the rule.
6. List only the inferred rules in Markdown bullet points. Do not include explanations, summaries, or conversational filler.

**Crucially, AVOID generating rules that are:**
- Overly specific to the files, functions, or variables discussed (e.g., "Always check for null in the 'processUserData' function"). Instead, generalize (e.g., "Always validate data from external sources before processing").
- Merely restatements of the task requirements.
- Too narrow to be useful outside the immediate context.
- Related to minor typos or formatting preferences unless they represent a consistent pattern requested by the user.

**Good General Rule Examples:**
<examples>
- Always ask for clarification if the user's request is ambiguous.
- Never make assumptions about file paths without confirmation.
- Always follow the user's explicitly stated formatting preferences.
- Never provide incomplete code snippets without indicating they are partial.
- Always check for potential null or undefined values before accessing properties.
</examples>

**Bad Specific Rule Examples (Avoid These):**
<bad-examples>
- Always use 'const' instead of 'let' for the 'userId' variable in 'auth.ts'.
- Never forget to pass the 'config' object to the 'initializeDb' function.
- Always add a try-catch block around the 'api.fetchData()' call in 'dataService.ts'.
</bad-examples>

This is the original system prompt the agent operated under:
<systemPrompt>
${await systemPrompt()}
</systemPrompt>`;

async function analyzeConversation({
  modelManager,
  messages,
  tokenTracker,
}: {
  modelManager: ModelManager;
  messages: ModelMessage[];
  terminal?: Terminal | undefined;
  tokenTracker: TokenTracker;
}): Promise<string[]> {
  const learnedRules = await config.readCachedLearnedRulesFile();
  // Modified User Message within analyzeConversation
  messages.push(
    createUserMessage([
      `Analyze this conversation based on the system instructions. Identify points where the user made significant corrections revealing general principles for agent improvement. Infer concise, broadly applicable rules (Always/Never) based *only* on these corrections.

**Key Requirements:**
- Focus on *generalizable* rules applicable to future, different tasks.
- Avoid rules tied to the specifics of *this* conversation.
- Ensure rules don't already exist in <existing-rules>.
- If no *new, general* rules can be inferred, return an empty list or response.
- Return *only* the Markdown list of rules, with no preamble or explanation.

<existing-rules>
${learnedRules}
</existing-rules>`,
    ]),
  );
  const { text, usage } = await generateText({
    model: modelManager.getModel("conversation-analyzer"),
    maxOutputTokens: 8192,
    system: await system(),
    messages: messages,
  });

  tokenTracker.trackUsage("conversation-analyzer", usage);

  // Trim whitespace and check if the response is effectively empty or just whitespace
  const potentialRulesText = text.trim();

  // Basic check to prevent adding empty lines or just formatting
  if (!potentialRulesText || potentialRulesText.length === 0) {
    return []; // Return empty array if no valid rules generated
  }

  // Split into individual rules, filter out empty lines
  const potentialRulesList = potentialRulesText
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  if (potentialRulesList.length === 0) {
    return []; // Return empty array if splitting results in no rules
  }

  // Further validation could be added here (e.g., check if it starts with '- ', etc.)
  // before writing to the file.

  // Append only if there are non-empty potential rules
  const updatedRules =
    learnedRules.endsWith("\n") || learnedRules.length === 0
      ? `${learnedRules}${potentialRulesList.join("\n")}`
      : `${learnedRules}\n${potentialRulesList.join("\n")}`;

  await config.writeCachedLearnedRulesFile(updatedRules);

  return potentialRulesList; // Return the list of rules that were added
}

function hideRuleSelector(
  editorContainer: Container,
  editor: Editor,
  tui: TUI,
): void {
  // Replace selector with editor in the container
  editorContainer.clear();
  editorContainer.addChild(editor);
  tui.setFocus(editor);
}

/**
 * Component that renders a rule selector with search and multi-selection
 */
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

    // Load all rules
    this.allRules = rules;
    this.filteredRules = rules;

    const { columns } = getTerminalSize();

    // Add top border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    // Create search input
    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      // Enter on search input toggles selection of current item
      this.toggleSelection(this.selectedIndex);
    };
    this.addChild(this.searchInput);

    this.addChild(new Spacer(1));

    // Create list container
    this.listContainer = new Container();
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));

    // Add instructions
    this.addChild(
      new Text(
        style.dim("Space: toggle selection, Enter: confirm, Escape: cancel"),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    // Add bottom border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));

    // Initial render
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

    // Show visible slice of filtered rules
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

    // Add scroll indicator if needed
    if (startIndex > 0 || endIndex < this.filteredRules.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredRules.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    // Show "no results" if empty
    if (this.filteredRules.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching rules"), 0, 0),
      );
    }
  }

  handleInput(keyData: string): void {
    // Up arrow
    if (keyData === "\x1b[A") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateList();
    }
    // Down arrow
    else if (keyData === "\x1b[B") {
      this.selectedIndex = Math.min(
        this.filteredRules.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    }
    // Space - toggle selection
    else if (keyData === " ") {
      this.toggleSelection(this.selectedIndex);
    }
    // Enter - confirm selection
    else if (keyData === "\r") {
      this.handleConfirm();
    }
    // Escape
    else if (keyData === "\x1b") {
      this.onCancelCallback();
    }
    // Pass everything else to search input
    else {
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
