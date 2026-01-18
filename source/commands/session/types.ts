import type { ModelMessage } from "ai";

export type Breakdown = {
  systemPrompt: number;
  systemPromptBreakdown: {
    core: number;
    userAgentsMd: number;
    cwdAgentsMd: number;
    learnedRules: number;
    skills: number;
  };
  tools: number;
  messages: number;
  totalUsed: number;
  window: number;
  free: number;
};

export function countMessageTokens(
  messages: ModelMessage[],
  counter: { count: (s: string) => number },
): number {
  if (messages.length === 0) {
    return 0;
  }

  const serializedMessages = JSON.stringify(messages);
  return counter.count(serializedMessages);
}
