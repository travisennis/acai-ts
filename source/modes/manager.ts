import type { UserModelMessage } from "ai";
import { createUserMessage } from "../sessions/manager.ts";

export type Mode = "normal" | "planning" | "research";

interface ModeDefinition {
  name: Mode;
  displayName: string;
  initialPrompt: string;
  reminderPrompt: string;
}

const MODE_DEFINITIONS: Record<Mode, ModeDefinition> = {
  normal: {
    name: "normal",
    displayName: "Normal",
    initialPrompt: "",
    reminderPrompt: "",
  },
  planning: {
    name: "planning",
    displayName: "Planning",
    initialPrompt:
      "You are in PLANNING MODE. Before writing any code:\n\n1. First, understand the requirements fully\n2. Identify the core problem and constraints\n3. Design the solution architecture\n4. Consider edge cases\n5. Plan implementation\n6. Identify dependencies",
    reminderPrompt:
      "Remember: You are still in PLANNING MODE. Continue focusing on architectural design, systematic planning, and high-level considerations.",
  },
  research: {
    name: "research",
    displayName: "Research",
    initialPrompt:
      "You are in RESEARCH MODE. Your goal is to thoroughly investigate:\n\n1. Current state and context\n2. Existing solutions\n3. Best practices\n4. Trade-offs\n5. Potential pitfalls",
    reminderPrompt:
      "Remember: You are still in RESEARCH MODE. Continue investigating thoroughly. Synthesize findings.",
  },
};

const ALL_MODES: Mode[] = ["normal", "planning", "research"];

export class ModeManager {
  private currentMode: Mode = "normal";
  private firstMessageInMode = true;

  getCurrentMode(): Mode {
    return this.currentMode;
  }

  getDisplayName(): string {
    return MODE_DEFINITIONS[this.currentMode].displayName;
  }

  cycleMode(): void {
    const currentIndex = ALL_MODES.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % ALL_MODES.length;
    this.currentMode = ALL_MODES[nextIndex] as Mode;
    this.firstMessageInMode = true;
  }

  getInitialPrompt(): string {
    return MODE_DEFINITIONS[this.currentMode].initialPrompt;
  }

  getReminderPrompt(): string {
    return MODE_DEFINITIONS[this.currentMode].reminderPrompt;
  }

  isNormal(): boolean {
    return this.currentMode === "normal";
  }

  isFirstMessage(): boolean {
    return this.firstMessageInMode;
  }

  markFirstMessageSent(): void {
    this.firstMessageInMode = false;
  }

  getReminderMessage(): UserModelMessage | undefined {
    if (this.isNormal() || this.firstMessageInMode) {
      return undefined;
    }
    const reminder = this.getReminderPrompt();
    if (!reminder) {
      return undefined;
    }
    return createUserMessage([], reminder);
  }

  reset(): void {
    this.currentMode = "normal";
    this.firstMessageInMode = true;
  }

  toJson(): { mode: Mode } {
    return { mode: this.currentMode };
  }

  fromJson(data: { mode?: string }): void {
    if (data.mode && ALL_MODES.includes(data.mode as Mode)) {
      this.currentMode = data.mode as Mode;
    }
    this.firstMessageInMode = false;
  }
}
