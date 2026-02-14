import {
  isValidModel,
  type ModelName,
  modelRegistry,
  models,
} from "../../models/providers.ts";
import {
  getTerminalSize,
  isArrowDown,
  isArrowUp,
  isEnter,
  isEscape,
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
import { hideModelSelector } from "./utils.ts";

export function modelCommand(options: CommandOptions): ReplCommand {
  const { modelManager } = options;

  return {
    command: "/model",
    description:
      "List available models or switch to a different model. Usage: /model [provider:model-name|provider]",

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

      if (!arg) {
        const modelSelector = new ModelSelectorComponent(
          modelConfig.id,
          (model) => {
            modelManager.setModel("repl", model);
            hideModelSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
          () => {
            hideModelSelector(inputContainer, editor, tui);
            tui.requestRender();
          },
        );

        inputContainer.clear();
        inputContainer.addChild(modelSelector);
        tui.setFocus(modelSelector);
        tui.requestRender();
        return "continue";
      }

      if (isValidModel(arg)) {
        try {
          const currentModelConfig = modelManager.getModelMetadata("repl");
          const newModelConfig = modelRegistry[arg as ModelName];

          if (newModelConfig === undefined) {
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

          modelManager.setModel("repl", arg as ModelName);
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

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}

class ModelSelectorComponent extends Container {
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

    this.loadModels();

    const { columns } = getTerminalSize();

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      const model = this.filteredModels[this.selectedIndex];
      if (model !== undefined) {
        this.handleSelect(model);
      }
    };
    this.addChild(this.searchInput);

    this.addChild(new Spacer(1));

    this.listContainer = new Container();
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));

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

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredModels[i];
      if (item === undefined) continue;

      const isSelected = i === this.selectedIndex;
      const isCurrent = this.currentModel === item;

      let line = "";
      if (isSelected) {
        const prefix = style.blue("→ ");
        const modelText = `${item}`;
        const checkmark = isCurrent ? style.green(" ✓") : "";
        line = `${prefix + style.blue(modelText)} ${checkmark}`;
      } else {
        const modelText = `  ${item}`;
        const checkmark = isCurrent ? style.green(" ✓") : "";
        line = `${modelText} ${checkmark}`;
      }

      this.listContainer.addChild(new Text(line, 0, 0));
    }

    if (startIndex > 0 || endIndex < this.filteredModels.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredModels.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    if (this.filteredModels.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching models"), 0, 0),
      );
    }
  }

  handleInput(keyData: string): void {
    // Handle Enter first - check multiple formats for compatibility
    const enterKeyCodes = ["\r", "\n", "\x1b[13u", "\x0d"];
    const isEnterKey = enterKeyCodes.includes(keyData) || isEnter(keyData);
    if (isEnterKey) {
      const selectedModel = this.filteredModels[this.selectedIndex];
      if (selectedModel !== undefined) {
        this.handleSelect(selectedModel);
      }
      return;
    }
    if (isArrowUp(keyData)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateList();
    } else if (isArrowDown(keyData)) {
      this.selectedIndex = Math.min(
        this.filteredModels.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    } else if (isEscape(keyData)) {
      this.onCancelCallback();
    } else {
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
