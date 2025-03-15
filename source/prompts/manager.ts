export class PromptManager {
  private prompts: string[];
  constructor() {
    this.prompts = [];
  }

  push(prompt: string) {
    this.prompts.push(prompt);
  }

  pop() {
    if (this.prompts.length > 0) {
      const queuedPrompt = this.prompts.pop();
      if (queuedPrompt) {
        return queuedPrompt;
      }
    }
    throw new Error("No prompt queued.");
  }

  isPending() {
    return this.prompts.length > 0;
  }
}
