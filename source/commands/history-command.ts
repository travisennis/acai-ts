import { writeFile } from "node:fs/promises";
import type { ModelMessage, TextPart } from "ai";
import { generateText } from "ai";
import { MessageHistory } from "../messages.ts";
import { getTerminalSize } from "../terminal/formatting.ts";
import { select } from "../terminal/select-prompt.ts";
import style from "../terminal/style.ts";
import type { Editor, TUI } from "../tui/index.ts";
import { Container, Input, Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

interface ConversationHistory {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  sessionId: string;
  modelId: string;
  project: string;
}

async function exportConversation(
  history: ConversationHistory,
  terminal: CommandOptions["terminal"],
): Promise<void> {
  const sanitizedTitle = history.title
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const filename = `${sanitizedTitle}_${timestamp}.md`;

  const markdownContent = generateMarkdown(history);

  try {
    await writeFile(filename, markdownContent);
    terminal.info(`Conversation exported to: ${filename}`);
  } catch (error) {
    terminal.error(`Failed to export conversation: ${error}`);
    throw error;
  }
}

function generateMarkdown(history: ConversationHistory): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${history.title}`);
  lines.push("");
  lines.push("## Conversation Metadata");
  lines.push(`- **Session ID**: ${history.sessionId}`);
  lines.push(`- **Model**: ${history.modelId}`);
  lines.push(`- **Created**: ${history.createdAt.toISOString()}`);
  lines.push(`- **Last Updated**: ${history.updatedAt.toISOString()}`);
  lines.push(`- **Total Messages**: ${history.messages.length}`);
  lines.push("");

  // Messages
  lines.push("## Conversation History");
  lines.push("");

  history.messages.forEach((message: ModelMessage, index: number) => {
    const role = message.role.toUpperCase();
    lines.push(`### ${role} (Message ${index + 1})`);
    lines.push("");

    if (Array.isArray(message.content)) {
      message.content.forEach(
        (
          part:
            | TextPart
            | {
                type: string;
                text?: string;
                toolCallId?: string;
                toolName?: string;
                input?: unknown;
                output?: unknown;
              },
        ) => {
          if (part.type === "text" && part.text?.trim()) {
            lines.push(part.text);
            lines.push("");
          } else if (part.type === "tool-call") {
            lines.push(`**Tool Call**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Input**:");
            lines.push("```json");
            lines.push(JSON.stringify(part.input, null, 2));
            lines.push("```");
            lines.push("");
          } else if (part.type === "tool-result") {
            lines.push(`**Tool Result**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Output**:");
            if (
              typeof part.output === "object" &&
              part.output !== null &&
              "type" in part.output &&
              part.output.type === "text" &&
              "text" in part.output
            ) {
              lines.push("```");
              lines.push(String((part.output as { text: string }).text));
              lines.push("```");
            } else {
              lines.push("```json");
              lines.push(JSON.stringify(part.output, null, 2));
              lines.push("```");
            }
            lines.push("");
          } else if (part.type === "tool-error") {
            lines.push(`**Tool Error**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Error**:");
            lines.push("```");
            lines.push(String(part.output));
            lines.push("```");
            lines.push("");
          }
        },
      );
    } else if (typeof message.content === "string" && message.content.trim()) {
      lines.push(message.content);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

async function summarizeConversation(
  history: { title: string; messages: ModelMessage[] },
  terminal: CommandOptions["terminal"],
  modelManager: CommandOptions["modelManager"],
  tokenTracker: CommandOptions["tokenTracker"],
): Promise<void> {
  const systemPrompt = `You are an expert at summarizing conversations between a coding assistant and a user. Your task is to provide a clear, concise summary of the conversation that captures:

1. The main topic and objectives
2. Key decisions and solutions discussed
3. Tools and techniques used
4. Overall outcome or current status

Keep the summary focused and informative, around 3-5 paragraphs. Use plain text without markdown formatting.`;

  const conversationText = history.messages
    .map((message: ModelMessage) => {
      const role = message.role.toUpperCase();
      let content = "";

      if (Array.isArray(message.content)) {
        content = message.content
          .filter(
            (part: TextPart | { type: string; text?: string }) =>
              part.type === "text" && part.text?.trim(),
          )
          .map((part: TextPart | { type: string; text?: string }) => part.text)
          .join("\n");
      } else if (typeof message.content === "string") {
        content = message.content;
      }

      return `${role}: ${content}`;
    })
    .filter((text: string | undefined) => text?.trim())
    .join("\n\n");

  try {
    const { text, usage } = await generateText({
      model: modelManager.getModel("conversation-summarizer"),
      system: systemPrompt,
      prompt: `Please summarize this conversation:\n\n${conversationText}`,
    });

    tokenTracker.trackUsage("conversation-summarizer", usage);

    terminal.writeln(`Summary of "${history.title}":`);
    terminal.lineBreak();
    terminal.display(text);
    terminal.lineBreak();
  } catch (error) {
    terminal.error(`Failed to generate summary: ${error}`);
    throw error;
  }
}

export const historyCommand = ({
  messageHistory,
  terminal,
  config,
  modelManager,
  tokenTracker,
}: CommandOptions): ReplCommand => {
  return {
    command: "/history",
    description: "Browse and manage previous conversations.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      const appDir = config.app;
      const messageHistoryDir = await appDir.ensurePath("message-history");

      // Load all histories (use a large number to get all)
      const histories = await MessageHistory.load(messageHistoryDir, 1000);

      if (histories.length === 0) {
        terminal.info("No previous conversations found.");
        return "continue";
      }

      try {
        // Step 1: Select conversation
        const conversationChoice = await select({
          message: "Select a conversation:",
          choices: histories.map(
            (
              h: { title: string; updatedAt: Date; messages: unknown[] },
              index: number,
            ) => ({
              name: `${index + 1}: ${h.title} (${h.updatedAt.toLocaleString()})`,
              value: index,
              description: `${h.messages.length} messages`,
            }),
          ),
          pageSize: 15,
        });

        const selectedHistory = histories.at(conversationChoice);
        if (!selectedHistory) {
          terminal.error("Selected history index out of bounds.");
          return "continue";
        }

        // Step 2: Select action
        const actionChoice = await select({
          message: `What would you like to do with "${selectedHistory.title}"?`,
          choices: [
            {
              name: "Resume - Continue this conversation",
              value: "resume",
            },
            {
              name: "Export - Save as markdown file",
              value: "export",
            },
            {
              name: "Summarize - Generate AI summary of conversation",
              value: "summarize",
            },
          ],
          pageSize: 5,
        });

        switch (actionChoice) {
          case "resume":
            messageHistory.restore(selectedHistory);
            terminal.info(`Resuming conversation: ${selectedHistory.title}`);
            terminal.setTitle(
              selectedHistory.title || `acai: ${process.cwd()}`,
            );
            break;

          case "export":
            await exportConversation(selectedHistory, terminal);
            break;

          case "summarize":
            await summarizeConversation(
              selectedHistory,
              terminal,
              modelManager,
              tokenTracker,
            );
            break;
        }
      } catch (error) {
        // Handle Ctrl-C cancellation
        if (
          error instanceof Error &&
          "isCanceled" in error &&
          error.isCanceled === true
        ) {
          terminal.info("Operation cancelled.");
          return "continue";
        }
        // Re-throw other errors
        throw error;
      }

      return "continue";
    },
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
      const appDir = config.app;
      const messageHistoryDir = await appDir.ensurePath("message-history");

      // Load all histories (use a large number to get all)
      const histories = await MessageHistory.load(messageHistoryDir, 1000);

      if (histories.length === 0) {
        container.addChild(
          new Text(style.yellow("No previous conversations found."), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      // Create conversation selector
      const conversationSelector = new ConversationSelectorComponent(
        histories,
        async (conversation) => {
          // Handle conversation selection
          const actionSelector = new ActionSelectorComponent(
            conversation,
            async (action) => {
              // Handle action selection
              switch (action) {
                case "resume":
                  messageHistory.restore(conversation);
                  container.addChild(
                    new Text(
                      style.green(
                        `Resuming conversation: ${conversation.title}`,
                      ),
                      0,
                      1,
                    ),
                  );
                  terminal.setTitle(
                    conversation.title || `acai: ${process.cwd()}`,
                  );
                  break;

                case "export":
                  try {
                    await exportConversation(conversation, terminal);
                    container.addChild(
                      new Text(
                        style.green("Conversation exported successfully"),
                        1,
                        0,
                      ),
                    );
                  } catch (error) {
                    container.addChild(
                      new Text(
                        style.red(`Failed to export conversation: ${error}`),
                        1,
                        0,
                      ),
                    );
                  }
                  break;

                case "summarize":
                  try {
                    await summarizeConversation(
                      conversation,
                      terminal,
                      modelManager,
                      tokenTracker,
                    );
                    container.addChild(
                      new Text(style.green("Conversation summarized"), 0, 1),
                    );
                  } catch (error) {
                    container.addChild(
                      new Text(
                        style.red(`Failed to summarize conversation: ${error}`),
                        1,
                        0,
                      ),
                    );
                  }
                  break;
              }

              // Hide selectors and show editor again
              hideHistorySelectors(inputContainer, editor, tui);
              tui.requestRender();
            },
            () => {
              // Cancel action selection - go back to conversation selection
              hideHistorySelectors(inputContainer, editor, tui);
              inputContainer.addChild(conversationSelector);
              tui.setFocus(conversationSelector);
              tui.requestRender();
            },
          );

          // Replace conversation selector with action selector
          inputContainer.clear();
          inputContainer.addChild(actionSelector);
          tui.setFocus(actionSelector);
          tui.requestRender();
        },
        () => {
          // Cancel conversation selection - just hide selector
          hideHistorySelectors(inputContainer, editor, tui);
          tui.requestRender();
        },
      );

      // Replace editor with conversation selector
      inputContainer.clear();
      inputContainer.addChild(conversationSelector);
      tui.setFocus(conversationSelector);
      tui.requestRender();
      return "continue";
    },
  };
};

function hideHistorySelectors(
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
 * Component that renders a conversation selector with search
 */
class ConversationSelectorComponent extends Container {
  private searchInput: Input;
  private listContainer: Container;
  private allConversations: ConversationHistory[] = [];
  private filteredConversations: ConversationHistory[] = [];
  private selectedIndex = 0;
  private onSelectCallback: (conversation: ConversationHistory) => void;
  private onCancelCallback: () => void;

  constructor(
    conversations: ConversationHistory[],
    onSelect: (conversation: ConversationHistory) => void,
    onCancel: () => void,
  ) {
    super();

    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    // Load all conversations
    this.allConversations = conversations;
    this.filteredConversations = conversations;

    const { columns } = getTerminalSize();

    // Add top border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    // Create search input
    this.searchInput = new Input();
    // Note: setPlaceholder not available on Input component
    this.searchInput.onSubmit = () => {
      // Enter on search input selects the first filtered item
      if (this.filteredConversations[this.selectedIndex]) {
        this.handleSelect(this.filteredConversations[this.selectedIndex]);
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

  private filterConversations(query: string): void {
    if (!query.trim()) {
      this.filteredConversations = this.allConversations;
    } else {
      const searchTokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t);
      this.filteredConversations = this.allConversations.filter(
        (conversation) => {
          const searchText =
            `${conversation.title} ${conversation.sessionId}`.toLowerCase();
          return searchTokens.every((token) => searchText.includes(token));
        },
      );
    }

    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredConversations.length - 1),
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
        this.filteredConversations.length - maxVisible,
      ),
    );
    const endIndex = Math.min(
      startIndex + maxVisible,
      this.filteredConversations.length,
    );

    // Show visible slice of filtered conversations
    for (let i = startIndex; i < endIndex; i++) {
      const conversation = this.filteredConversations[i];
      if (!conversation) continue;

      const isSelected = i === this.selectedIndex;

      let line = "";
      if (isSelected) {
        const prefix = style.blue("→ ");
        const title = conversation.title;
        const date = conversation.updatedAt.toLocaleString();
        const messages = conversation.messages.length;
        line = `${prefix + style.blue(title)} ${style.gray(`(${date}) - ${messages} messages`)}`;
      } else {
        const title = `  ${conversation.title}`;
        const date = conversation.updatedAt.toLocaleString();
        const messages = conversation.messages.length;
        line = `${title} ${style.gray(`(${date}) - ${messages} messages`)}`;
      }

      this.listContainer.addChild(new Text(line, 0, 0));
    }

    // Add scroll indicator if needed
    if (startIndex > 0 || endIndex < this.filteredConversations.length) {
      const scrollInfo = style.gray(
        `  (${this.selectedIndex + 1}/${this.filteredConversations.length})`,
      );
      this.listContainer.addChild(new Text(scrollInfo, 0, 0));
    }

    // Show "no results" if empty
    if (this.filteredConversations.length === 0) {
      this.listContainer.addChild(
        new Text(style.gray("  No matching conversations"), 0, 0),
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
        this.filteredConversations.length - 1,
        this.selectedIndex + 1,
      );
      this.updateList();
    }
    // Enter
    else if (keyData === "\r") {
      const selectedConversation =
        this.filteredConversations[this.selectedIndex];
      if (selectedConversation) {
        this.handleSelect(selectedConversation);
      }
    }
    // Escape
    else if (keyData === "\x1b") {
      this.onCancelCallback();
    }
    // Pass everything else to search input
    else {
      this.searchInput.handleInput(keyData);
      this.filterConversations(this.searchInput.getValue());
    }
  }

  private handleSelect(conversation: ConversationHistory): void {
    this.onSelectCallback(conversation);
  }

  getSearchInput(): Input {
    return this.searchInput;
  }
}

/**
 * Component that renders an action selector for a conversation
 */
class ActionSelectorComponent extends Container {
  private selectedIndex = 0;
  private conversationTitle: string;
  private onSelectCallback: (action: "resume" | "export" | "summarize") => void;
  private onCancelCallback: () => void;

  constructor(
    conversation: ConversationHistory,
    onSelect: (action: "resume" | "export" | "summarize") => void,
    onCancel: () => void,
  ) {
    super();

    this.conversationTitle = conversation.title;
    this.onSelectCallback = onSelect;
    this.onCancelCallback = onCancel;

    const { columns } = getTerminalSize();

    // Add top border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    // Show conversation title
    this.addChild(new Text(`Selected: ${conversation.title}`, 0, 0));
    this.addChild(new Spacer(1));

    // Create action list
    this.addChild(new Text("Choose an action:", 0, 0));
    this.addChild(new Spacer(1));

    const actions = [
      { name: "Resume - Continue this conversation", value: "resume" },
      { name: "Export - Save as markdown file", value: "export" },
      {
        name: "Summarize - Generate AI summary of conversation",
        value: "summarize",
      },
    ];

    actions.forEach((action, index) => {
      const isSelected = index === this.selectedIndex;
      let line = "";
      if (isSelected) {
        line = `${style.blue("→ ") + style.blue(action.name)}`;
      } else {
        line = `  ${action.name}`;
      }
      this.addChild(new Text(line, 0, 0));
    });

    this.addChild(new Spacer(1));

    // Add bottom border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
  }

  handleInput(keyData: string): void {
    // Up arrow
    if (keyData === "\x1b[A") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateList();
    }
    // Down arrow
    else if (keyData === "\x1b[B") {
      this.selectedIndex = Math.min(2, this.selectedIndex + 1);
      this.updateList();
    }
    // Enter
    else if (keyData === "\r") {
      const actions = ["resume", "export", "summarize"] as const;
      const selectedAction = actions[this.selectedIndex];
      if (selectedAction) {
        this.handleSelect(selectedAction);
      }
    }
    // Escape
    else if (keyData === "\x1b") {
      this.onCancelCallback();
    }
  }

  private updateList(): void {
    // Clear and rebuild the action list
    this.clear();

    const { columns } = getTerminalSize();

    // Add top border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
    this.addChild(new Spacer(1));

    // Show conversation title
    this.addChild(new Text(`Selected: ${this.conversationTitle}`, 0, 0));
    this.addChild(new Spacer(1));

    // Create action list
    this.addChild(new Text("Choose an action:", 0, 0));
    this.addChild(new Spacer(1));

    const actions = [
      { name: "Resume - Continue this conversation", value: "resume" },
      { name: "Export - Save as markdown file", value: "export" },
      {
        name: "Summarize - Generate AI summary of conversation",
        value: "summarize",
      },
    ];

    actions.forEach((action, index) => {
      const isSelected = index === this.selectedIndex;
      let line = "";
      if (isSelected) {
        line = `${style.blue("→ ") + style.blue(action.name)}`;
      } else {
        line = `  ${action.name}`;
      }
      this.addChild(new Text(line, 0, 0));
    });

    this.addChild(new Spacer(1));

    // Add bottom border
    this.addChild(new Text(style.blue("─".repeat(columns)), 0, 0));
  }

  private handleSelect(action: "resume" | "export" | "summarize"): void {
    this.onSelectCallback(action);
  }
}
