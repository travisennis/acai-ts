import {
  isValidModel,
  type ModelName,
  modelRegistry,
  models,
} from "../models/providers.ts";
import { getTerminalSize } from "../terminal/formatting.ts";
import style from "../terminal/style.ts";
import {
  Container,
  type Editor,
  Input,
  Spacer,
  Text,
  type TUI,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function modelCommand(options: CommandOptions): ReplCommand {
  const { modelManager } = options;

  return {
    command: "/model",
    description:
      "List available models or switch to a different model. Usage: /model [provider:model-name|category|provider]",

    getSubCommands: () => Promise.resolve(models as unknown as string[]),
    async handle(
      args: string[],
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
      const arg = args.join(" ").trim();
      const modelConfig = modelManager.getModelMetadata("repl");

      // No args - display current model and list available models by category
      if (!arg) {
        // Create model selector with current model
        const modelSelector = new ModelSelectorComponent(
          modelConfig.id,
          (model) => {
            // Apply the selected model
            modelManager.setModel("repl", model);

            // Hide selector and show editor again
            hideModelSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
          () => {
            // Just hide the selector
            hideModelSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
        );

        // Replace editor with selector
        inputContainer.clear();
        inputContainer.addChild(modelSelector);
        tui.setFocus(modelSelector);
        tui.requestRender();
        return "continue";
      }

      // Switch to a specific model
      if (isValidModel(arg)) {
        try {
          // Get current and new model configs
          const currentModelConfig = modelManager.getModelMetadata("repl");
          const newModelConfig = modelRegistry[arg as ModelName];

          if (!newModelConfig) {
            container.addChild(
              new Text(
                style.red(`Model configuration not found for: ${arg}`),
                1,
                0,
              ),
            );
            tui.requestRender();
            editor.setText("");
            return "continue";
          }

          // Check for capability differences
          if (
            currentModelConfig.supportsToolCalling &&
            !newModelConfig.supportsToolCalling
          ) {
            container.addChild(
              new Text(
                style.yellow(
                  "The new model doesn't support tool calling, which may limit functionality.",
                ),
                1,
                0,
              ),
            );
          }
          if (
            currentModelConfig.supportsReasoning &&
            !newModelConfig.supportsReasoning
          ) {
            container.addChild(
              new Text(
                style.yellow(
                  "The new model doesn't support reasoning, which may change response quality.",
                ),
                2,
                0,
              ),
            );
          }

          // Update model in ModelManager
          modelManager.setModel("repl", arg as ModelName);

          // container.addChild(
          //   new Text(style.green(`Model set to ${arg}.`), 3, 0),
          // );
          tui.requestRender();
          editor.setText("");
          return "continue";
        } catch (error) {
          container.addChild(
            new Text(
              style.red(`Failed to switch model: ${(error as Error).message}`),
              0,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }
      }

      // // Display models by category
      // const categories = ["fast", "balanced", "powerful"];
      // if (categories.includes(arg)) {
      //   container.addChild(
      //     new Text(
      //       `${arg.charAt(0).toUpperCase() + arg.slice(1)} models:`,
      //       1,
      //       0,
      //     ),
      //   );
      //   let lineIndex = 2;
      //   for (const model of getModelsByCategory(
      //     arg as "fast" | "balanced" | "powerful",
      //   )) {
      //     container.addChild(new Text(formatModelInfo(model), lineIndex, 0));
      //     lineIndex++;
      //   }
      //   tui.requestRender();
      //   editor.setText("");
      //   return "continue";
      // }

      // // Display models by provider
      // if (providers.includes(arg as ModelProvider)) {
      //   container.addChild(new Text(`Models from ${arg}:`, 0, 1));
      //   let lineIndex = 2;
      //   for (const model of Object.values(modelRegistry).filter(
      //     (m) => m.provider === arg,
      //   )) {
      //     container.addChild(new Text(formatModelInfo(model), lineIndex, 0));
      //     lineIndex++;
      //   }
      //   tui.requestRender();
      //   editor.setText("");
      //   return "continue";
      // }

      // // Invalid model name
      // container.addChild(
      //   new Text(style.red(`Invalid model name or category: ${arg}`), 0, 1),
      // );
      // container.addChild(
      //   new Text(
      //     style.dim("Usage: /model [provider:model-name|category|provider]"),
      //     2,
      //     0,
      //   ),
      // );
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}

function hideModelSelector(
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
 * Component that renders a model selector with search
 */
export class ModelSelectorComponent extends Container {
  private searchInput: Input;
  private listContainer: Container;
  private allModels: ModelName[] = [];
  private filteredModels: ModelName[] = [];
  private selectedIndex = 0;
  private currentModel: ModelName;
  private onSelectCallback: (model: ModelName) => void;
  private onCancelCallback: () => void;

  constructor(
    currentModel: ModelName,
    onSelect: (model: ModelName) => void,
    onCancel: () => void,
  ) {
    super();

    this.currentModel = currentModel;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    // Load all models
    this.loadModels();

    const { columns } = getTerminalSize();

    // Add top border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    // Create search input
    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      // Enter on search input selects the first filtered item
      if (this.filteredModels[this.selectedIndex]) {
        this.handleSelect(this.filteredModels[this.selectedIndex]);
      }
    };
    this.addChild(this.searchInput);

    this.addChild(new Spacer(1));

    // Create list container
    this.listContainer = new Container();
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));

    // Add bottom border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));

    // Initial render
    this.updateList();
  }

  private loadModels(): void {
    this.allModels = models as ModelName[];
    this.filteredModels = models as ModelName[];
  }

  private filterModels(query: string): void {
    if (!query.trim()) {
      this.filteredModels = this.allModels;
    } else {
      const searchTokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t);
      this.filteredModels = this.allModels.filter((model) => {
        const searchText = `${model}`.toLowerCase();
        return searchTokens.every((token) => searchText.includes(token));
      });
    }

    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredModels.length - 1),
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
        this.filteredModels.length - maxVisible,
      ),
    );
    const endIndex = Math.min(
      startIndex + maxVisible,
      this.filteredModels.length,
    );

    // Show visible slice of filtered models
    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredModels[i];
      if (!item) continue;

      const isSelected = i === this.selectedIndex;
      const isCurrent = this.currentModel === item;

      let line = "";
      if (isSelected) {
        const prefix = style.blue("→ ");
        const modelText = `${item}`;
        // const providerBadge = style.gray(`[${item.provider}]`);
        const checkmark = isCurrent ? style.green(" ✓") : "";
        line = `${prefix + style.blue(modelText)} ${checkmark}`;
      } else {
        const modelText = `  ${item}`;
        // const providerBadge = style.gray(`[${item.provider}]`);
        const checkmark = isCurrent ? style.green(" ✓") : "";
        line = `${modelText} ${checkmark}`;
      }

      this.listContainer.addChild(new Text(line, 0, 0));
    }

    // Add scroll indicator if needed
    if (startIndex > 0 || endIndex < this.filteredModels.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredModels.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    // Show "no results" if empty
    if (this.filteredModels.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching models"), 0, 0),
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
        this.filteredModels.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    }
    // Enter
    else if (keyData === "\r") {
      const selectedModel = this.filteredModels[this.selectedIndex];
      if (selectedModel) {
        this.handleSelect(selectedModel);
      }
    }
    // Escape
    else if (keyData === "\x1b") {
      this.onCancelCallback();
    }
    // Pass everything else to search input
    else {
      this.searchInput.handleInput(keyData);
      this.filterModels(this.searchInput.getValue());
    }
  }

  private handleSelect(model: ModelName): void {
    this.onSelectCallback(model);
  }

  getSearchInput(): Input {
    return this.searchInput;
  }
}
