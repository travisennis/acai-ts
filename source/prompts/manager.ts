import { isString } from "@travisennis/stdlib/typeguards";
import { createUserMessage } from "../messages.ts";

export class PromptManager {
  private prompt: string | undefined;
  private context: string[];

  constructor() {
    this.prompt = undefined;
    this.context = [];
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

  getUserMessage() {
    const prompt = this.prompt;
    if (isString(prompt) && prompt.trim().length > 0) {
      if (this.hasContext()) {
        const context = this.getContext();
        const msg = createUserMessage(context, prompt);
        this.clearAll(); // Clear context after using
        return msg;
      }
      this.prompt = undefined;
      return createUserMessage(prompt);
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
