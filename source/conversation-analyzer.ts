import { type CoreMessage, generateText } from "ai";
import { config } from "./config.ts";
import { createUserMessage } from "./messages.ts";
import type { ModelManager } from "./models/manager.ts";
import { systemPrompt } from "./prompts.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";

const system =
  async () => `You are to analyze the following conversation between a coding agent and a software engineer. Identify each point where the engineer corrected or redirected the agent. For each, infer a single, concise, actionable rule (starting with 'Always' or 'Never') that would have prevented the issue. Use only evidence from the conversation. For each rule, provide a brief supporting quote or example from the conversation in parentheses. List the rules in Markdown; do not include explanations, summaries, or unrelated content. Ignore corrections that are minor or do not indicate a systemic improvement for agent behavior. Not every conversation will have instances of these corrections or redirections.

Example rules:
<examples>
- Always ask for clarification if the user's request is ambiguous.
- Never make assumptions about file paths without confirmation.
- Always follow the user's formatting preferences.
- Never provide incomplete code snippets.
- Never use the \`any\` type when writing code.
</examples>

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
  const learnedRules = await config.readLearnedRulesFile();
  messages.push(
    createUserMessage(
      `Analyze this conversation for any points where the user corrected or redirected the agent. For each instance, infer a concise, actionable rule that would have prevented the correction or redirection. Return a markdown list of rules, each starting with 'Always' or 'Never'.

Only include rules that are directly supported by evidence from the conversation. Only return rules that don't already exist in <existing-rules>. If the converation doens't support the creation of new rules, then return an empty list. Only return the list with no preamble.

<existing-rules>
${learnedRules}
</existing-rules>`,
    ),
  );
  const { text, usage } = await generateText({
    model: modelManager.getModel("conversation-analyzer"),
    maxTokens: 8192,
    system: await system(),
    messages: messages,
  });

  tokenTracker.trackUsage("conversation-analyzer", usage);

  await config.writeLearnedRulesFile(
    learnedRules.endsWith("\n")
      ? `${learnedRules}${text}`
      : `${learnedRules}\n${text}`,
  );

  return text;
}
