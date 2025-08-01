import { isString } from "@travisennis/stdlib/typeguards";
import type { TextPart, UserModelMessage } from "ai"; // Corrected import
import { createUserMessage, type UserMessageContentItem } from "../messages.ts";
import type { TokenCounter } from "../token-utils.ts";

export type ContextItem = UserMessageContentItem;

export class PromptManager {
  private prompt: string | undefined;
  private context: ContextItem[];
  private tokenCounter: TokenCounter;

  constructor(tokenCounter: TokenCounter) {
    this.prompt = undefined;
    this.context = [];
    this.tokenCounter = tokenCounter;
  }

  set(prompt: string) {
    this.prompt = prompt;
  }

  get() {
    const prompt = this.prompt;
    if (isString(prompt) && prompt.trim().length > 0) {
      return prompt;
    }
    throw new Error("No prompt available.");
  }

  getUserMessage(): UserModelMessage {
    const currentPrompt = this.prompt;
    if (isString(currentPrompt) && currentPrompt.trim().length > 0) {
      let userMessage: UserModelMessage;
      if (this.hasContext()) {
        // Pass context items and the prompt string to createUserMessage
        userMessage = createUserMessage([...this.context], currentPrompt);
        this.clearAll(); // Clear context and prompt after using
      } else {
        // Pass an empty array for context items if no context
        userMessage = createUserMessage([], currentPrompt);
        this.prompt = undefined; // Clear only prompt if no context was used
      }

      return this._applyProviderOptionsToMessage(userMessage);
    }
    throw new Error("No prompt available.");
  }

  private _applyProviderOptionsToMessage(
    userMessage: UserModelMessage,
  ): UserModelMessage {
    if (Array.isArray(userMessage.content)) {
      for (const part of userMessage.content) {
        if (typeof part === "object" && part !== null && part.type === "text") {
          const textPart = part as TextPart & {
            providerOptions?: Record<string, unknown>;
          };
          if (this.tokenCounter.count(textPart.text) > 4096) {
            textPart.providerOptions = {
              anthropic: { cacheControl: { type: "ephemeral" } },
            };
          }
        }
      }
    }
    return userMessage;
  }

  isPending() {
    return isString(this.prompt) && this.prompt.trim().length > 0;
  }

  addContext(item: ContextItem): void {
    this.context.push(item);
  }

  hasContext() {
    return this.context.length > 0;
  }

  clearContext() {
    this.context.length = 0;
  }

  clearAll() {
    this.clearContext();
    this.prompt = undefined;
  }
}
