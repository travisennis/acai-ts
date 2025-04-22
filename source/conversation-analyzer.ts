import { type CoreMessage, generateText } from "ai";
import { config } from "./config.ts";
import { createUserMessage } from "./messages.ts";
import type { ModelManager } from "./models/manager.ts";
import { systemPrompt } from "./prompts.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";

const system =
  // Suggestions to make the system prompt more effective:
  // 1. Clarify the roles and goals within the prompt, specifying what counts as a correction or redirection, and emphasize evidence-based conclusions.
  // 2. Add explicit instructions to only infer rules that are clearly supported by the user's corrections or redirections in the conversation.
  // 3. Request that each proposed rule is accompanied by a brief example or a quote from the conversation, to improve traceability of each rule to its evidence.
  // 4. Encourage concise and actionable phrasing for each rule, and remind the assistant to avoid speculative or generalized advice not present in the observed data.
  // 5. Specify preferred output format more precisely (e.g., always use a numbered or bulleted Markdown list starting each rule with "Always" or "Never", and avoid other content).
  // 6. Consider asking the assistant to ignore minor corrections like typos or formatting unless they indicate a broader actionable rule for agent behavior.
  // 7. If the conversation may include multiple topics, explicit instruction to group rules by theme or topic could aid clarity.
  // 8. Example revision (for context, not code replacement):
  //    "You are to analyze the following conversation between a coding agent and a software engineer. Identify each point where the engineer corrected or redirected the agent. For each, infer a single, concise, actionable rule (starting with 'Always' or 'Never') that would have prevented the issue. Use only evidence from the conversation. For each rule, provide a brief supporting quote or example from the conversation in parentheses. List the rules in Markdown; do not include explanations, summaries, or unrelated content. Ignore corrections that are minor or do not indicate a systemic improvement for agent behavior."
  async () => `You are a helpful AI-assistant that is tasked with analyzing a conversation between a coding agent and a software engineer. You are trying to find instances where the software engineer corrected or redirected the agent via a user message in the converation. From these instances you will help construct rules that can be given to future coding agents so that doesn't repeat the same mistakes. Not every conversation will have instances of these corrections or redirections.

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
      `Analyze this conversation for any points where the user corrected or redirected the agent. For each instance, infer a concise, actionable rule that would have prevented the correction or redirection. Return a markdown list of rules, each starting with 'Always' or 'Never'. For example:

- Always ask for clarification if the user's request is ambiguous.
- Never make assumptions about file paths without confirmation.
- Always follow the user's formatting preferences.
- Never provide incomplete code snippets.
- Never use the \`any\` type when writing code.

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

  await config.writeLearnedRulesFile(`${learnedRules}\n${text}`);

  return text;
}
