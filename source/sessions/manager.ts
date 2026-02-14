import { randomUUID } from "node:crypto";
import EventEmitter from "node:events";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
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
import { dedent } from "../dedent.ts";
import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.ts";
import type { TokenTracker } from "../tokens/tracker.ts";

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

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function sanitizeToolCallInput(input: unknown): Record<string, unknown> {
  if (isPlainObject(input)) {
    return input;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch {
      // JSON parsing failed, fall through to return empty object
    }
  }

  logger.warn(
    { originalInput: typeof input === "string" ? input.slice(0, 100) : input },
    "Sanitized malformed tool call input to empty object",
  );
  return {};
}

function sanitizeResponseMessages(
  messages: ResponseMessage[],
): ResponseMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      return msg;
    }

    const content = msg.content.map((part) => {
      if (part.type === "tool-call") {
        const sanitizedInput = sanitizeToolCallInput(part.input);
        if (sanitizedInput !== part.input) {
          return { ...part, input: sanitizedInput };
        }
      }
      return part;
    });

    return { ...msg, content } as AssistantModelMessage;
  });
}

/**
A message that was generated during the generation process.
It can be either an assistant message or a tool message.
 */
type ResponseMessage = AssistantModelMessage | ToolModelMessage;

export type TokenUsageTurn = {
  stepIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  inputTokenDetails: {
    noCacheTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  outputTokenDetails: {
    textTokens: number;
    reasoningTokens: number;
  };
  timestamp: number;
  estimatedCost: number;
};

export type SavedMessageHistory = {
  project: string;
  sessionId: string;
  modelId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  tokenUsage?: TokenUsageTurn[];
  metadata?: Record<string, unknown>;
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

export class SessionManager extends EventEmitter<MessageHistoryEvents> {
  private history: ModelMessage[];
  private sessionId: string;
  private modelId: string;
  private title: string;
  private createdAt: Date;
  private updatedAt: Date;
  private stateDir: string;
  private contextWindow: number;
  private modelManager: ModelManager;
  private tokenTracker: TokenTracker;
  private tokenUsage: TokenUsageTurn[];
  private transientMessages: UserModelMessage[] = [];
  private metadata: Record<string, unknown> = {};

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
    this.modelId = modelManager.getModel("repl").modelId;
    this.title = "";
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.stateDir = stateDir;
    this.contextWindow = 0;
    this.modelManager = modelManager;
    this.tokenTracker = tokenTracker;
    this.tokenUsage = [];
  }

  create(modelId: string) {
    this.clear();
    this.modelId = modelId;
    this.sessionId = randomUUID();
    this.title = "";
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  setModelId(modelId: string) {
    this.modelId = modelId;
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
    const history = [...this.history].filter(this.validMessage);
    if (this.transientMessages.length > 0) {
      const lastIndex = history.length - 1;
      return [
        ...history.slice(0, lastIndex),
        ...this.transientMessages,
        history[lastIndex] as ModelMessage,
      ];
    }
    return history;
  }

  setTransientMessages(messages: UserModelMessage[]): void {
    this.transientMessages = messages;
  }

  clearTransientMessages(): void {
    this.transientMessages = [];
  }

  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  getMetadata(key: string): unknown {
    return this.metadata[key];
  }

  clear() {
    this.history.length = 0;
    this.transientMessages = [];
    this.metadata = {};
    this.contextWindow = 0;
    this.tokenUsage = [];
    this.emit("clear-history");
  }

  setContextWindow(contextWindow: number) {
    if (contextWindow < 0) {
      throw new Error("Context window cannot be negative");
    }
    this.contextWindow = contextWindow;
  }

  getContextWindow() {
    return this.contextWindow;
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
        void this.generateTitle(textPart.text);
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
    // Sanitize tool call inputs to prevent malformed JSON from poisoning history
    const sanitizedMessages = sanitizeResponseMessages(responseMessages);
    // Filter out messages with empty content arrays
    const validMessages = sanitizedMessages.filter(this.validMessage);
    this.history.push(...validMessages);
  }

  isEmpty() {
    return this.history.length === 0;
  }

  async save() {
    const msgHistoryDir = this.stateDir;
    const fileName = this.getSessionFileName();
    const filePath = join(msgHistoryDir, fileName);
    const tempFilePath = `${filePath}.tmp`;

    // Validate data before writing
    if (!this.sessionId || this.sessionId.trim() === "") {
      throw new Error("Cannot save: sessionId is empty");
    }

    if (!Array.isArray(this.history)) {
      throw new Error("Cannot save: history is not an array");
    }

    const project = basename(process.cwd());

    const output: SavedMessageHistory = {
      project,
      sessionId: this.sessionId,
      modelId: this.modelId,
      title: this.title,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: this.history,
      tokenUsage: this.tokenUsage,
      metadata:
        Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
    };

    try {
      // Ensure directory exists
      await mkdir(msgHistoryDir, { recursive: true });

      // Write to temporary file first
      await writeFile(tempFilePath, JSON.stringify(output, null, 2));

      // Atomically rename to final file
      await rename(tempFilePath, filePath);

      logger.info(`Message history saved to ${filePath}`);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await unlink(tempFilePath);
      } catch (_cleanupError) {
        // Ignore cleanup errors
      }

      // Check if it's an ENOENT error from rename (temp file doesn't exist)
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        logger.warn(
          `Temp file missing during save for ${filePath}, write may have been interrupted`,
        );
      } else {
        logger.error(error, `Failed to save message history to ${filePath}:`);
        // Don't throw - just log. This is called from interrupt handlers
        // and we don't want to crash the program on save failure.
      }
    }
  }

  private async generateTitle(message: string) {
    // Skip title generation if message is empty
    if (!message || message.trim() === "") {
      return;
    }

    const app = "title-conversation";

    const systemPrompt = dedent`
You are an assistant who is tasked to analyze messages to generate a conversation topic that can be used as a conversation title. For each message, generate a short title that captures the topic. Return only the title with no other text.

## Examples:

<example>
Message:
How do I implement authentication in my Express app?

Title:
Express Authentication Implementation
</example>

<example>
Message:
Can you help me debug this React component that isn't rendering correctly?

Title:
React Component Rendering Debug";
</example>
`;

    let title = "";

    try {
      const model = this.modelManager.getModel(app);

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Message:\n${message}\n\nTitle:`,
      });

      this.tokenTracker.trackUsage(app, result.usage);

      if (result.text && result.text.length > 0) {
        title = result.text;
        this.title = title;
      }
    } catch (error) {
      logger.error(
        error,
        "[generateTitle] Failed to generate conversation title:",
      );
    }

    if (title.length === 0) {
      this.title =
        message.slice(0, 50).trim() + (message.length > 50 ? "..." : "");
    }
    this.emit("update-title", this.title);
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

  // Getter methods for session information
  getSessionId(): string {
    return this.sessionId;
  }

  getModelId(): string {
    return this.modelId;
  }

  getTitle(): string {
    return this.title;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getSessionFileName(): string {
    return `session-${this.sessionId}.json`;
  }

  getSessionFilePath(): string {
    return join(this.stateDir, this.getSessionFileName());
  }

  static async load(
    stateDir: string,
    count = 10, // Add count parameter with default
  ): Promise<SavedMessageHistory[]> {
    try {
      const files = await readdir(stateDir);
      const sessionFiles = files.filter(
        (file) => file.startsWith("session-") && file.endsWith(".json"),
      );

      // Get file stats and sort by modification time (newest first)
      const fileStatsPromises = sessionFiles.map(async (fileName) => {
        const filePath = join(stateDir, fileName);
        try {
          const fileStat = await stat(filePath);
          return {
            fileName,
            filePath,
            modifiedTime: fileStat.mtime,
          };
        } catch (error) {
          console.error(`Error getting stats for file ${filePath}:`, error);
          return null;
        }
      });

      const fileStats = await Promise.all(fileStatsPromises);

      // Filter out null results and sort by modification time (newest first)
      const sortedFiles = fileStats
        .filter(
          (
            stat,
          ): stat is {
            fileName: string;
            filePath: string;
            modifiedTime: Date;
          } => stat !== null,
        )
        .sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime())
        .slice(0, count)
        .map((stat) => stat.fileName);

      const fileReadPromises = sortedFiles.map(async (fileName) => {
        const filePath = join(stateDir, fileName);
        try {
          // Check file stats first to avoid reading empty files
          const stats = await stat(filePath);
          if (stats.size === 0) {
            // Silently skip empty files - they're likely from interrupted saves
            return null;
          }

          const content = await readFile(filePath, "utf-8");

          // Skip files that only contain whitespace
          if (content.trim().length === 0) {
            return null;
          }

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
          // Only log unexpected errors, not empty/malformed JSON files
          // which are common from interrupted saves
          if (
            !(error instanceof SyntaxError) ||
            !error.message.includes("Unexpected end of JSON input")
          ) {
            console.error(`Error reading or parsing file ${filePath}:`, error);
          }
        }
        return null; // Return null for failed reads/parses
      });

      const results = await Promise.all(fileReadPromises);

      // Filter out null results and return them (already sorted by file modification time)
      return results.filter(
        (result): result is SavedMessageHistory => result !== null,
      );
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
    this.sessionId = savedHistory.sessionId;
    this.modelId = savedHistory.modelId;
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
    // Sanitize messages while preserving original order
    // Only sanitize assistant and tool messages (not user or system messages)
    const sanitizedMessages = savedHistory.messages.map((msg) => {
      if (msg.role === "assistant" || msg.role === "tool") {
        const [sanitized] = sanitizeResponseMessages([msg as ResponseMessage]);
        return sanitized;
      }
      return msg;
    });
    // Filter out messages with empty content arrays
    const validMessages = sanitizedMessages.filter(this.validMessage);
    this.history = [...validMessages];
    this.tokenUsage = savedHistory.tokenUsage
      ? [...savedHistory.tokenUsage]
      : [];
    this.metadata = savedHistory.metadata ?? {};
  }

  // Token usage tracking methods
  recordTurnUsage(usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    inputTokenDetails: {
      noCacheTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };
    outputTokenDetails: {
      textTokens: number;
      reasoningTokens: number;
    };
  }): void {
    const modelConfig = this.modelManager.getModelMetadata("repl");
    const estimatedCost =
      usage.inputTokens * modelConfig.costPerInputToken +
      usage.outputTokens * modelConfig.costPerOutputToken;

    const turnUsage: TokenUsageTurn = {
      stepIndex: this.tokenUsage.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cachedInputTokens: usage.cachedInputTokens,
      reasoningTokens: usage.reasoningTokens,
      inputTokenDetails: { ...usage.inputTokenDetails },
      outputTokenDetails: { ...usage.outputTokenDetails },
      timestamp: Date.now(),
      estimatedCost,
    };

    this.tokenUsage.push(turnUsage);
  }

  getTokenUsage(): TokenUsageTurn[] {
    return [...this.tokenUsage];
  }

  getTotalTokenUsage(): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    estimatedCost: number;
  } {
    return this.tokenUsage.reduce(
      (acc, turn) => {
        acc.inputTokens += turn.inputTokens;
        acc.outputTokens += turn.outputTokens;
        acc.totalTokens += turn.totalTokens;
        acc.cachedInputTokens += turn.cachedInputTokens;
        acc.reasoningTokens += turn.reasoningTokens;
        acc.estimatedCost += turn.estimatedCost;
        return acc;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        estimatedCost: 0,
      },
    );
  }

  getLastTurnContextWindow(): number {
    if (this.tokenUsage.length === 0) {
      return 0;
    }
    return this.tokenUsage[this.tokenUsage.length - 1].totalTokens;
  }

  clearTokenUsage(): void {
    this.tokenUsage = [];
  }
}
