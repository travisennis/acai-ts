import { writeFile } from "node:fs/promises";
import type { ModelMessage, TextPart } from "ai";
import { generateText } from "ai";
import { MessageHistory } from "../messages.ts";
import { select } from "../terminal/select-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

interface ConversationHistory {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  sessionId: string;
  modelId: string;
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
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const appDir = config.app;
      const messageHistoryDir = await appDir.ensurePath("message-history");

      // Load all histories (use a large number to get all)
      const histories = await MessageHistory.load(messageHistoryDir, 1000);

      if (histories.length === 0) {
        container.addChild(
          new Text(style.yellow("No previous conversations found."), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      // For TUI mode, we'll just show the available conversations
      container.addChild(new Text("Available conversations:", 1, 0));
      histories.forEach((history, index) => {
        container.addChild(
          new Text(
            `${index + 1}: ${history.title} (${history.updatedAt.toLocaleString()}) - ${history.messages.length} messages`,
            2 + index,
            0,
          ),
        );
      });
      container.addChild(
        new Text(
          style.dim("Note: Conversation selection not available in TUI mode"),
          2 + histories.length,
          0,
        ),
      );

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
