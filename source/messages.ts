import { randomUUID } from "node:crypto";
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
import type { TokenTracker } from "./tokens/tracker.ts";

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

function createAssistantMessage(content: string): AssistantModelMessage {
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

type SavedMessageHistory = {
  sessionId: string;
  modelId: string;
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
  private sessionId: string;
  private modelId: string;
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
    this.sessionId = randomUUID();
    this.modelId = "";
    this.title = "";
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.stateDir = stateDir;
    this.modelManager = modelManager;
    this.tokenTracker = tokenTracker;
  }

  create(modelId: string) {
    this.history = [];
    this.modelId = modelId;
    this.sessionId = randomUUID();
    this.title = "";
    this.createdAt = new Date();
    this.updatedAt = new Date();
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

  appendToolMessages(toolResultMessages: ToolModelMessage[]) {
    this.updatedAt = new Date();
    this.history.push(...toolResultMessages);
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
    const fileName = `message-history-${this.sessionId}.json`;
    const filePath = join(msgHistoryDir, fileName);

    const output: SavedMessageHistory = {
      sessionId: this.sessionId,
      modelId: this.modelId,
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

  getLastUserMessage(): UserModelMessage | undefined {
    const userMsg = this.history.findLast(
      (value): value is UserModelMessage => value.role === "user",
    );
    return userMsg;
  }

  /**
   * Extracts the last message from the conversation history for display purposes.
   * Prioritizes assistant messages, falls back to user messages if no assistant messages exist.
   */
  getLastMessage(): string | null {
    const messages = this.get();
    if (messages.length === 0) {
      return null;
    }

    // Find the last assistant message, or fall back to last user message
    const reversedMessages = [...messages].reverse();
    const lastAssistant = reversedMessages.find(
      (msg): msg is AssistantModelMessage => msg.role === "assistant",
    );
    const lastUser = reversedMessages.find(
      (msg): msg is UserModelMessage => msg.role === "user",
    );

    const targetMessage = lastAssistant || lastUser;
    if (!targetMessage) {
      return null;
    }

    // Extract text content from the message
    if (Array.isArray(targetMessage.content)) {
      const textParts = targetMessage.content.filter(
        (part): part is TextPart =>
          part.type === "text" && part.text.trim().length > 0,
      );
      if (textParts.length === 0) {
        return null;
      }
      return textParts.map((part) => part.text).join("\n");
    }

    // Handle string content (though this should be rare with current implementation)
    if (
      typeof targetMessage.content === "string" &&
      targetMessage.content.trim().length > 0
    ) {
      return targetMessage.content;
    }

    return null;
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
