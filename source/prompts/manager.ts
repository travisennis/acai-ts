import { isString } from "@travisennis/stdlib/typeguards";
import type { CoreUserMessage, TextPart } from "ai"; // Corrected import
import { createUserMessage } from "../messages.ts";
import type { TokenCounter } from "../token-utils.ts";

export class PromptManager {
  private prompt: string | undefined;
  private context: string[];
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

  getUserMessage(): CoreUserMessage {
    // Added return type
    const prompt = this.prompt;
    if (isString(prompt) && prompt.trim().length > 0) {
      let userMessage: CoreUserMessage;
      if (this.hasContext()) {
        const context = this.getContext();
        userMessage = createUserMessage(context, prompt);
        this.clearAll(); // Clear context after using
      } else {
        userMessage = createUserMessage(prompt);
        this.prompt = undefined;
      }

      if (Array.isArray(userMessage.content)) {
        for (const part of userMessage.content) {
          if (
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "text"
          ) {
            // part is now known to be at least { type: "text" }, but we need .text and to add providerOptions
            // We'll cast to TextPart from 'ai' and add providerOptions capability
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
    throw new Error("No prompt available.");
  }

  isPending() {
    return isString(this.prompt) && this.prompt.trim().length > 0;
  }

  // Renamed from addPendingContent to addContext
  addContext(content: string): void {
    this.context.push(content);
  }

  hasContext() {
    return this.context.length > 0;
  }

  getContext() {
    return this.context.join("\n\n");
  }

  clearContext() {
    this.context.length = 0;
  }

  clearAll() {
    this.clearContext();
    this.prompt = undefined;
  }
}
