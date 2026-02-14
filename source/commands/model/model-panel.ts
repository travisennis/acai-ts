import type { ModelManager } from "../../models/manager.ts";
import type { ModelName } from "../../models/providers.ts";
import { models } from "../../models/providers.ts";
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
import { hideModelSelector } from "./utils.ts";

export function showModelSelector(
  tui: TUI,
  inputContainer: Container,
  editor: Editor,
  modelManager: ModelManager,
): void {
  const modelConfig = modelManager.getModelMetadata("repl");

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
