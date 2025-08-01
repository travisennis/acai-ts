import EventEmitter from "node:events";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isString } from "@travisennis/stdlib/typeguards";
import {
  type AssistantModelMessage,
  generateText,
  type ImagePart, // Added ImagePart
  type ModelMessage,
  type TextPart,
  type ToolModelMessage,
  type UserModelMessage,
} from "ai";
import type { ModelManager } from "./models/manager.ts";
import type { TokenTracker } from "./token-tracker.ts";

// Define a type for the items that can be passed in the first argument
export type UserMessageContentItem = string | ImagePart;

export function createUserMessage(
  contentItems: UserMessageContentItem[],
  prompt?: string,
): UserModelMessage {
  const messageParts: (TextPart | ImagePart)[] = [];

  // Process content items (images and pre-defined texts)
  for (const item of contentItems) {
    if (typeof item === "string") {
      if (item.trim().length > 0) {
        messageParts.push({ type: "text", text: item });
      }
    } else if (item.type === "image") {
      messageParts.push(item);
    }
  }

  // Add the main prompt text if provided
  if (prompt && prompt.trim().length > 0) {
    messageParts.push({ type: "text", text: prompt });
  }

  return {
    role: "user",
    content: messageParts,
  };
}

export function createAssistantMessage(content: string): AssistantModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
  };
}

/**
A message that was generated during the generation process.
It can be either an assistant message or a tool message.
 */
type ResponseMessage = AssistantModelMessage | ToolModelMessage;

export type SavedMessageHistory = {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
};

type RawMessageHistory = Omit<
  SavedMessageHistory,
  "createdAt" | "updatedAt"
> & {
  createdAt?: string;
  updatedAt?: string;
};

interface MessageHistoryEvents {
  "update-title": [string];
  "clear-history": [];
}

export class MessageHistory extends EventEmitter<MessageHistoryEvents> {
  private history: ModelMessage[];
  private title: string;
  private createdAt: Date;
  private updatedAt: Date;
  private stateDir: string;
  private modelManager: ModelManager;
  private tokenTracker: TokenTracker;

  constructor({
    stateDir,
    modelManager,
    tokenTracker,
  }: {
    stateDir: string;
    modelManager: ModelManager;
    tokenTracker: TokenTracker;
  }) {
    super();
    this.history = [];
    this.title = "";
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.stateDir = stateDir;
    this.modelManager = modelManager;
    this.tokenTracker = tokenTracker;
  }

  private validMessage(msg: ModelMessage) {
    // Filter out messages with empty content arrays
    if (Array.isArray(msg.content) && msg.content.length === 0) {
      return false;
    }

    // Filter out assistant messages with empty text fields
    if (
      msg.role === "assistant" &&
      Array.isArray(msg.content) &&
      msg.content.length === 1 &&
      msg.content[0]?.type === "text" &&
      msg.content[0]?.text === ""
    ) {
      return false;
    }

    return true;
  }

  get() {
    return [...this.history].filter(this.validMessage);
  }

  clear() {
    this.history.length = 0;
    this.emit("clear-history");
  }

  appendUserMessage(msg: string): void;
  appendUserMessage(msg: UserModelMessage): void;
  appendUserMessage(msg: string | UserModelMessage) {
    const now = new Date();
    const msgObj = isString(msg) ? createUserMessage([], msg) : msg;
    if (
      this.history.length === 0 &&
      msgObj.content &&
      msgObj.content.length > 0
    ) {
      const textPart = msgObj.content.at(-1) as TextPart;
      if (textPart?.text && textPart.text.trim() !== "") {
        this.generateTitle(textPart.text);
      }
      this.createdAt = now;
    }
    this.updatedAt = now;
    this.history.push(msgObj);
  }

  appendAssistantMessage(msg: string): void;
  appendAssistantMessage(msg: AssistantModelMessage): void;
  appendAssistantMessage(msg: string | AssistantModelMessage) {
    this.updatedAt = new Date();
    const msgObj = isString(msg) ? createAssistantMessage(msg) : msg;
    this.history.push(msgObj);
  }

  appendResponseMessages(responseMessages: ResponseMessage[]) {
    this.updatedAt = new Date();
    // Filter out messages with empty content arrays
    const validMessages = responseMessages.filter(this.validMessage);
    this.history.push(...validMessages);
  }

  isEmpty() {
    return this.history.length === 0;
  }

  async save() {
    const msgHistoryDir = this.stateDir;
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const fileName = `message-history-${timestamp}.json`;
    const filePath = join(msgHistoryDir, fileName);

    const output: SavedMessageHistory = {
      title: this.title,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: this.history,
    };

    await writeFile(filePath, JSON.stringify(output, null, 2));
  }

  private async generateTitle(message: string) {
    // Skip title generation if message is empty
    if (!message || message.trim() === "") {
      return;
    }

    const app = "title-conversation";

    const systemPrompt =
      "You are an assistant who task is to analyze messages to generate a conversation topic that can be used as a conversation title. For each message, generate a 4-7 word title that captures the topic. Return only the title with no other text.\n\nExamples:\nMessage:\nHow do I implement authentication in my Express app?\nTitle: Express Authentication Implementation\n\nMessage:\nCan you help me debug this React component that isn't rendering correctly?\nTitle:React Component Rendering Debug";
    try {
      const { text, usage } = await generateText({
        model: this.modelManager.getModel(app),
        system: systemPrompt,
        prompt: `Request:\n${message}\nTitle:`,
      });

      this.tokenTracker.trackUsage(app, usage);

      if (text && text.split(" ").length < 10) {
        this.title = text;
        this.emit("update-title", this.title);
      }
    } catch (error) {
      console.error(error);
    }
  }

  getFirstUserMessage(): UserModelMessage | undefined {
    const firstUser = this.get().find(
      (msg): msg is UserModelMessage => msg.role === "user",
    );
    return firstUser;
  }

  static async load(
    stateDir: string,
    count = 10, // Add count parameter with default
  ): Promise<SavedMessageHistory[]> {
    try {
      const files = await readdir(stateDir);
      const messageHistoryFiles = files
        .filter(
          (file) =>
            file.startsWith("message-history-") && file.endsWith(".json"),
        )
        .sort((a, b) => {
          // Extract timestamps and compare in reverse order (newest first)
          const timeA = a.replace("message-history-", "").replace(".json", "");
          const timeB = b.replace("message-history-", "").replace(".json", "");
          return timeB.localeCompare(timeA); // Newest first
        })
        .slice(0, count); // Use the count parameter here

      const fileReadPromises = messageHistoryFiles.map(async (fileName) => {
        const filePath = join(stateDir, fileName);
        try {
          const content = await readFile(filePath, "utf-8");
          const parsed = JSON.parse(content) as RawMessageHistory;
          const result: SavedMessageHistory =
            parsed as unknown as SavedMessageHistory;
          // Basic validation - ensure messages array exists
          if (parsed && Array.isArray(parsed.messages)) {
            // Convert date strings back to Date objects
            result.createdAt = new Date(parsed.createdAt ?? 0);
            result.updatedAt = new Date(parsed.updatedAt ?? 0);
            return result;
          }
        } catch (error) {
          console.error(`Error reading or parsing file ${filePath}:`, error);
        }
        return null; // Return null for failed reads/parses
      });

      const results = await Promise.all(fileReadPromises);
      // Filter out null results (failed reads/parses)
      //sort results by result.updatedAt which is a Date
      return results
        .filter((result): result is SavedMessageHistory => result !== null)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      // Handle cases where the directory might not exist or other readdir errors
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error loading message history from ${stateDir}:`, error);
      }
      // Return empty array if directory doesn't exist or other read errors occur
      return [];
    }
  }

  // Method to restore state from a SavedMessageHistory object
  restore(savedHistory: SavedMessageHistory): void {
    this.title = savedHistory.title;
    // Ensure dates are Date objects, though load should handle this
    this.createdAt =
      typeof savedHistory.createdAt === "string"
        ? new Date(savedHistory.createdAt)
        : savedHistory.createdAt;
    this.updatedAt =
      typeof savedHistory.updatedAt === "string"
        ? new Date(savedHistory.updatedAt)
        : savedHistory.updatedAt;
    this.history = [...savedHistory.messages]; // Use the correct internal property name and create a copy
  }
}

/**
 * Normalizes an array of messages for API consumption by:
 * 1. Filtering out progress-type messages
 * 2. Processing user and assistant messages
 * 3. Handling tool results by either:
 *    - Adding them as new messages if they're the first tool result
 *    - Adding them as new messages if the previous message wasn't a tool result
 *    - Merging them with the previous message if it was also a tool result
 *
 * This consolidation of sequential tool results into a single message
 * ensures proper formatting for API consumption while maintaining the
 * logical flow of the conversation.
 *
 * @param messages - Array of messages to normalize
 * @returns Normalized array of user and assistant messages ready for API
 */
export function normalizeMessagesForApi(
  messages: ModelMessage[],
): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    switch (message.role) {
      case "user": {
        result.push(message);
        continue;
      }
      case "tool": {
        // If the last message is not a tool result, add it to the result
        const lastMessage = result.at(-1);
        if (
          !lastMessage ||
          lastMessage.role === "assistant" ||
          !Array.isArray(lastMessage.content) ||
          lastMessage.content[0]?.type !== "tool-result"
        ) {
          result.push(message);
          continue;
        }

        // Otherwise, merge the current message with the last message
        result[result.indexOf(lastMessage)] = {
          ...lastMessage,
          // biome-ignore lint/suspicious/noExplicitAny: can't figure out type
          content: [...lastMessage.content, ...message.content] as any, // #FIXME figure out what type this should be
        };
        continue;
      }
      case "assistant": {
        result.push(message);
        continue;
      }
      default:
        continue;
    }
  }
  return result;
}
