import { getTerminalSize } from "../../terminal/control.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import {
  Input,
  Spacer,
  Text,
  Container as TuiContainer,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import type { HandoffFile } from "./types.ts";
import {
  getAvailableHandoffFiles,
  hidePickupSelector,
  loadHandoff,
} from "./utils";

export const pickupCommand = (options: CommandOptions): ReplCommand => {
  return {
    command: "/pickup",
    description:
      "Loads a handoff file into a new session to continue previous work. Usage: /pickup",

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
      const handoffs = await getAvailableHandoffFiles();

      if (handoffs.length === 0) {
        container.addChild(
          new Text(style.yellow("No handoff files found."), 0, 1),
        );
        container.addChild(
          new Text(
            "Create a handoff file first using /handoff <purpose>",
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const handoffSelector = new HandoffSelectorComponent(
        handoffs,
        async (handoff) => {
          await loadHandoff(handoff, options, container, tui, editor);
          hidePickupSelector(inputContainer, editor, tui);
        },
        () => {
          hidePickupSelector(inputContainer, editor, tui);
        },
      );

      inputContainer.clear();
      inputContainer.addChild(handoffSelector);
      tui.setFocus(handoffSelector);
      tui.requestRender();
      return "continue";
    },
  };
};

class HandoffSelectorComponent extends TuiContainer {
  private searchInput: Input;
  private listContainer: TuiContainer;
  private allHandoffs: HandoffFile[] = [];
  private filteredHandoffs: HandoffFile[] = [];
  private selectedIndex = 0;
  private onSelectCallback: (handoff: HandoffFile) => void;
  private onCancelCallback: () => void;

  constructor(
    handoffs: HandoffFile[],
    onSelect: (handoff: HandoffFile) => void,
    onCancel: () => void,
  ) {
    super();

    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    this.allHandoffs = handoffs;
    this.filteredHandoffs = handoffs;

    const { columns } = getTerminalSize();

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      if (this.filteredHandoffs[this.selectedIndex]) {
        this.handleSelect(this.filteredHandoffs[this.selectedIndex]);
      }
    };
    this.addChild(this.searchInput);

    this.addChild(new Spacer(1));

    this.listContainer = new TuiContainer();
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));

    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));

    this.updateList();
  }

  private filterHandoffs(query: string): void {
    if (!query.trim()) {
      this.filteredHandoffs = this.allHandoffs;
    } else {
      const searchTokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t);
      this.filteredHandoffs = this.allHandoffs.filter((handoff) => {
        const searchText = handoff.name.toLowerCase();
        return searchTokens.every((token) => searchText.includes(token));
      });
    }

    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredHandoffs.length - 1),
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
        this.filteredHandoffs.length - maxVisible,
      ),
    );
    const endIndex = Math.min(
      startIndex + maxVisible,
      this.filteredHandoffs.length,
    );

    for (let i = startIndex; i < endIndex; i++) {
      const handoff = this.filteredHandoffs[i];
      if (!handoff) continue;

      const isSelected = i === this.selectedIndex;

      let line = "";
      if (isSelected) {
        const prefix = style.blue("→ ");
        const date = handoff.createdAt.toLocaleString();
        line = `${prefix + style.blue(handoff.name)} ${style.gray(`(${date})`)}`;
      } else {
        const date = handoff.createdAt.toLocaleString();
        line = `  ${handoff.name} ${style.gray(`(${date})`)}`;
      }

      this.listContainer.addChild(new Text(line, 0, 0));
    }

    if (startIndex > 0 || endIndex < this.filteredHandoffs.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredHandoffs.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    if (this.filteredHandoffs.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching handoffs"), 0, 0),
      );
    }
  }

  handleInput(keyData: string): void {
    if (keyData === "\x1b[A") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateList();
    } else if (keyData === "\x1b[B") {
      this.selectedIndex = Math.min(
        this.filteredHandoffs.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    } else if (keyData === "\r") {
      const selectedHandoff = this.filteredHandoffs[this.selectedIndex];
      if (selectedHandoff) {
        this.handleSelect(selectedHandoff);
      }
    } else if (keyData === "\x1b") {
      this.onCancelCallback();
    } else {
      this.searchInput.handleInput(keyData);
      this.filterHandoffs(this.searchInput.getValue());
    }
  }

  private handleSelect(handoff: HandoffFile): void {
    this.onSelectCallback(handoff);
  }
}
