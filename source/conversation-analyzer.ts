import { type CoreMessage, generateText } from "ai";
import { config } from "./config.ts";
import { createUserMessage } from "./messages.ts";
import type { ModelManager } from "./models/manager.ts";
import { systemPrompt } from "./prompts.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./token-tracker.ts";

// Modified System Prompt
const system =
  async () => `You are an expert analyst reviewing conversations between a coding agent and a software engineer. Your goal is to identify instances where the engineer corrected the agent's approach or understanding in a way that reveals a *generalizable principle* for improving the agent's future behavior across *different* tasks.

**Your Task:**
1. Analyze the conversation provided.
2. Identify significant corrections or redirections from the engineer. Ignore minor clarifications or task-specific adjustments.
3. For each significant correction, infer a *single, concise, broadly applicable, actionable rule* (starting with 'Always' or 'Never') that captures the underlying principle the agent should follow in the future.
4. Ensure the rule is general enough to be useful in various scenarios, not just the specific context of this conversation.
5. Provide a brief, illustrative quote or example from the conversation in parentheses after the rule.
6. List only the inferred rules in Markdown bullet points. Do not include explanations, summaries, or conversational filler.

**Crucially, AVOID generating rules that are:**
- Overly specific to the files, functions, or variables discussed (e.g., "Always check for null in the 'processUserData' function"). Instead, generalize (e.g., "Always validate data from external sources before processing").
- Merely restatements of the task requirements.
- Too narrow to be useful outside the immediate context.
- Related to minor typos or formatting preferences unless they represent a consistent pattern requested by the user.

**Good General Rule Examples:**
<examples>
- Always ask for clarification if the user's request is ambiguous.
- Never make assumptions about file paths without confirmation.
- Always follow the user's explicitly stated formatting preferences.
- Never provide incomplete code snippets without indicating they are partial.
- Always check for potential null or undefined values before accessing properties.
</examples>

**Bad Specific Rule Examples (Avoid These):**
<bad-examples>
- Always use 'const' instead of 'let' for the 'userId' variable in 'auth.ts'.
- Never forget to pass the 'config' object to the 'initializeDb' function.
- Always add a try-catch block around the 'api.fetchData()' call in 'dataService.ts'.
</bad-examples>

This is the original system prompt the agent operated under:
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
}): Promise<string[]> {
  const learnedRules = await config.readCachedLearnedRulesFile();
  // Modified User Message within analyzeConversation
  messages.push(
    createUserMessage(
      `Analyze this conversation based on the system instructions. Identify points where the user made significant corrections revealing general principles for agent improvement. Infer concise, broadly applicable rules (Always/Never) based *only* on these corrections.

**Key Requirements:**
- Focus on *generalizable* rules applicable to future, different tasks.
- Avoid rules tied to the specifics of *this* conversation.
- Ensure rules don't already exist in <existing-rules>.
- If no *new, general* rules can be inferred, return an empty list or response.
- Return *only* the Markdown list of rules, with no preamble or explanation.

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

  // Trim whitespace and check if the response is effectively empty or just whitespace
  const potentialRulesText = text.trim();

  // Basic check to prevent adding empty lines or just formatting
  if (!potentialRulesText || potentialRulesText.length === 0) {
    return []; // Return empty array if no valid rules generated
  }

  // Split into individual rules, filter out empty lines
  const potentialRulesList = potentialRulesText
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  if (potentialRulesList.length === 0) {
    return []; // Return empty array if splitting results in no rules
  }

  // Further validation could be added here (e.g., check if it starts with '- ', etc.)
  // before writing to the file.

  // Append only if there are non-empty potential rules
  const updatedRules =
    learnedRules.endsWith("\n") || learnedRules.length === 0
      ? `${learnedRules}${potentialRulesList.join("\n")}`
      : `${learnedRules}\n${potentialRulesList.join("\n")}`;

  await config.writeCachedLearnedRulesFile(updatedRules);

  return potentialRulesList; // Return the list of rules that were added
}
