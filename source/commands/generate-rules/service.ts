import { generateText, type ModelMessage } from "ai";
import type { ConfigManager } from "../../config.ts";
import type { WorkspaceContext } from "../../index.ts";
import type { ModelManager } from "../../models/manager.ts";
import { systemPrompt } from "../../prompts.ts";
import { createUserMessage } from "../../sessions/manager.ts";
import type { TokenTracker } from "../../tokens/tracker.ts";
import type { CompleteToolNames } from "../../tools/index.ts";

export interface GenerateRulesOptions {
  modelManager: ModelManager;
  messages: ModelMessage[];
  tokenTracker: TokenTracker;
  config: ConfigManager;
  workspace: WorkspaceContext;
}

export interface GenerateRulesResult {
  rules: string[];
  savedToProject: boolean;
}

/**
 * Analyzes conversation and generates rules without UI interaction.
 * Returns the list of generated rules and whether they were saved to project rules.
 */
export async function generateRulesFromSession(
  options: GenerateRulesOptions,
): Promise<GenerateRulesResult> {
  const { modelManager, messages, tokenTracker, config, workspace } = options;

  // Read existing learned rules to avoid duplicates
  const existingRules = await config.readCachedLearnedRulesFile();

  // Add analysis prompt to messages (clone to avoid side effects)
  const analysisMessages: ModelMessage[] = [...messages];
  analysisMessages.push(
    createUserMessage([
      `Analyze this conversation based on the system instructions. Identify points where the user made significant corrections revealing general principles for agent improvement. Infer concise, broadly applicable rules (Always/Never) based *only* on these corrections.

**Key Requirements:**
- Focus on *generalizable* rules applicable to future, different tasks.
- Avoid rules tied to the specifics of *this* conversation.
- Ensure rules don't already exist in <existing-rules>.
- If no *new, general* rules can be inferred, return an empty list or response.
- Return *only* the Markdown list of rules, with no preamble or explanation.

<existing-rules>
${existingRules}
</existing-rules>`,
    ]),
  );

  const systemPromptText = await createAnalysisSystemPrompt(config, workspace);
  const { text, usage } = await generateText({
    model: modelManager.getModel("conversation-analyzer"),
    maxOutputTokens: 8192,
    system: systemPromptText,
    messages: analysisMessages,
  });

  tokenTracker.trackUsage("conversation-analyzer", usage);

  const potentialRulesText = text.trim();

  if (!potentialRulesText || potentialRulesText.length === 0) {
    return { rules: [], savedToProject: false };
  }

  const potentialRulesList = potentialRulesText
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  if (potentialRulesList.length === 0) {
    return { rules: [], savedToProject: false };
  }

  // Update cached rules file to avoid duplicates in future analysis
  const updatedCachedRules =
    existingRules.endsWith("\n") || existingRules.length === 0
      ? `${existingRules}${potentialRulesList.join("\n")}`
      : `${existingRules}\n${potentialRulesList.join("\n")}`;

  await config.writeCachedLearnedRulesFile(updatedCachedRules);

  // Save to project rules file if project directory exists
  let savedToProject = false;
  try {
    const existingProjectRules = await config.readProjectLearnedRulesFile();
    const projectRulesToAdd = potentialRulesList.join("\n");
    const updatedProjectRules =
      existingProjectRules.endsWith("\n") || existingProjectRules.length === 0
        ? `${existingProjectRules}${projectRulesToAdd}`
        : `${existingProjectRules}\n${projectRulesToAdd}`;

    await config.writeProjectLearnedRulesFile(updatedProjectRules);
    savedToProject = true;
  } catch {
    // Silently fail if project directory doesn't exist
    // (e.g., running outside a project)
  }

  return { rules: potentialRulesList, savedToProject };
}

async function createAnalysisSystemPrompt(
  configManager: ConfigManager,
  workspace: WorkspaceContext,
): Promise<string> {
  const projectConfig = await configManager.getConfig();

  const sysResult = await systemPrompt({
    activeTools: projectConfig.tools.activeTools as
      | CompleteToolNames[]
      | undefined,
    includeRules: true,
    allowedDirs: workspace.allowedDirs,
  });
  const sys = sysResult.prompt;

  return `You are an expert analyst reviewing conversations between a coding agent and a software engineer. Your goal is to identify instances where the engineer corrected the agent's approach or understanding in a way that reveals a *generalizable principle* for improving the agent's future behavior across *different* tasks.

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
${sys}
</systemPrompt>`;
}
