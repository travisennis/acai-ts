import { type CoreMessage, generateText } from "ai";
import { createUserMessage } from "./messages.ts";
import type { ModelManager } from "./models/manager.ts";
import { systemPrompt } from "./prompts.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";
import { logger } from "./logger.ts";

export const system =
  async () => `You are a helpful AI-assistant that is tasked with identifying the knowledge, context, or background information that would helpful to know in order to complete a task. You will do this by analyzing a conversation. You are trying to find what knowledge would be important to add to the system prompt so that when future agents like yourelf start a task they know everything they need to know to successfully complete that task as efficiently as possible.

This is the original system prompt for this converation:
<systemPrompt>
${await systemPrompt()}
</systemPrompt>`;

export async function analyzeConversation({
  modelManager,
  messages,
  tokenTracker,
}: {
  modelManager: ModelManager;
  messages: CoreMessage[];
  terminal?: Terminal | undefined;
  tokenTracker: TokenTracker;
}) {
  messages.push(
    createUserMessage(
      "Analyze the conversation and identify two or three pieces of knowledge, context, or background that would have been important to know at the beginning of the conversation to help with the task. If there is nothing, indicate that.",
    ),
  );
  const { text, usage } = await generateText({
    model: modelManager.getModel("meta-prompt"),
    maxTokens: 8192,
    system: await system(),
    messages: messages,
  });

  // terminal.info("Turn Analyzed");

  tokenTracker.trackUsage("meta-prompt", usage);

  logger.debug("Analyze turn:");
  logger.debug(text);

  return text;
}
