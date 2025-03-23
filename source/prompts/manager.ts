import { isString } from "@travisennis/stdlib/typeguards";

export class PromptManager {
  private prompt: string | undefined;
  private context: string[];

  constructor() {
    this.prompt = undefined;
    this.context = [];
  }

  add(prompt: string) {
    this.prompt = prompt;
  }

  get() {
    const prompt = this.prompt;
    if (isString(prompt)) {
      if (this.hasContext()) {
        const fullPrompt = `${this.getContext()}\n\n${prompt}`;
        this.clearAll(); // Clear context after using
        return fullPrompt;
      }
      this.prompt = "";
      return prompt;
    }
    throw new Error("No prompt available.");
  }

  isPending() {
    return isString(this.prompt);
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
