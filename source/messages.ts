import EventEmitter from "node:events";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isString } from "@travisennis/stdlib/typeguards";
import {
  type CoreAssistantMessage,
  type CoreMessage,
  type CoreToolMessage,
  type CoreUserMessage,
  type TextPart,
  generateObject,
  generateText,
} from "ai";
import { z } from "zod";
import type { ModelManager } from "./models/manager.ts";
import type { TokenTracker } from "./tokenTracker.ts";

export function createUserMessage(content: string): CoreUserMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
  };
}

export function createAssistantMessage(content: string): CoreAssistantMessage {
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
type ResponseMessage = (CoreAssistantMessage | CoreToolMessage) & {
  /**
Message ID generated by the AI SDK.
 */
  id: string;
};

export interface MessageHistoryEvents {
  "update-title": [string];
}

export class MessageHistory extends EventEmitter<MessageHistoryEvents> {
  private history: CoreMessage[];
  private title: string;
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
    this.stateDir = stateDir;
    this.modelManager = modelManager;
    this.tokenTracker = tokenTracker;
  }

  get() {
    return [...this.history].filter((msg) => {
      // Filter out messages with empty content arrays
      return !Array.isArray(msg.content) || msg.content.length > 0;
    });
  }

  clear() {
    this.history.length = 0;
  }

  appendUserMessage(msg: string): void;
  appendUserMessage(msg: CoreUserMessage): void;
  appendUserMessage(msg: string | CoreUserMessage) {
    const msgObj = isString(msg) ? createUserMessage(msg) : msg;
    if (this.history.length > 0) {
      this.generateTitle((msgObj.content.at(0) as TextPart).text);
    }
    this.history.push(msgObj);
  }

  appendAssistantMessage(msg: string): void;
  appendAssistantMessage(msg: CoreAssistantMessage): void;
  appendAssistantMessage(msg: string | CoreAssistantMessage) {
    const msgObj = isString(msg) ? createAssistantMessage(msg) : msg;
    this.history.push(msgObj);
  }

  appendResponseMessages(responseMessages: ResponseMessage[]) {
    // Filter out messages with empty content arrays
    const validMessages = responseMessages.filter((msg) => {
      return !Array.isArray(msg.content) || msg.content.length > 0;
    });
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

    const output = {
      title: this.title,
      messages: this.history,
    };

    await writeFile(filePath, JSON.stringify(output, null, 2));
  }

  async generateTitle(message: string) {
    const app = "title-conversation";

    const systemPrompt =
      "Analyze this message to generate a conversation topic. Extract a 4-7 word title that captures the topic. Format your response as a JSON object with one field: 'title' (string). Only include this field, no other text.";

    const { object, usage } = await generateObject({
      model: this.modelManager.getModel(app),
      system: systemPrompt,
      schema: z.object({
        title: z.string().optional(),
      }),
      prompt: message,
    });

    this.tokenTracker.trackUsage(app, usage);

    if (object.title) {
      this.title = object.title;
      this.emit("update-title", this.title);
    }
  }

  async summarizeAndReset() {
    const app = "conversation-summarizer";

    // save existing message history
    await this.save();

    // summarize message history
    this.appendUserMessage(
      createUserMessage(
        "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.",
      ),
    );
    const { text, usage } = await generateText({
      model: this.modelManager.getModel(app),
      system:
        "You are a helpful AI assistant tasked with summarizing conversations.",
      messages: this.get(),
    });

    this.tokenTracker.trackUsage(app, usage);

    // update token counts with new message history
    this.tokenTracker.reset();
    this.tokenTracker.trackUsage(app, {
      promptTokens: 0,
      completionTokens: usage.completionTokens,
      totalTokens: usage.completionTokens,
    });

    //clear messages
    this.clear();

    // reset messages with the summary
    this.appendAssistantMessage(createAssistantMessage(text));
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
  messages: CoreMessage[],
): CoreMessage[] {
  const result: CoreMessage[] = [];
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
          content: [...lastMessage.content, ...message.content] as any,
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
