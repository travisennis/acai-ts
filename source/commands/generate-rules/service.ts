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
}

/**
 * Analyzes conversation and generates rules without UI interaction.
 * Returns the list of generated rules.
 */
export async function generateRulesFromSession(
  options: GenerateRulesOptions,
): Promise<GenerateRulesResult> {
  const { modelManager, messages, tokenTracker, config, workspace } = options;

  // Read existing learned rules to avoid duplicates
  const existingRules = await config.readLearnedRulesFile();

  // Add analysis prompt to messages (clone to avoid side effects)
  const analysisMessages: ModelMessage[] = [...messages];
  analysisMessages.push(
    createUserMessage([
      `Analyze this conversation and identify ONLY rules that are broadly applicable to FUTURE, UNRELATED tasks.

**Critical: Most conversations will NOT yield useful generalizable rules.** Only extract a rule if it represents a genuine, reusable principle that would help the agent in completely different contexts.

**Key Requirements:**
- A rule must be *universally* applicable, not just to this project or similar tasks
- If you're uncertain whether a rule is broadly applicable, DO NOT include it
- Rules about specific files, functions, or variables are NEVER acceptable
- Return an EMPTY list if no broadly applicable rules can be inferred
- Return *only* the Markdown list of rules, with no preamble or explanation

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
    return { rules: [] };
  }

  const potentialRulesList = potentialRulesText
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  if (potentialRulesList.length === 0) {
    return { rules: [] };
  }

  // Update learned rules file to avoid duplicates in future analysis
  const updatedRules =
    existingRules.endsWith("\n") || existingRules.length === 0
      ? `${existingRules}${potentialRulesList.join("\n")}`
      : `${existingRules}\n${potentialRulesList.join("\n")}`;

  await config.writeLearnedRulesFile(updatedRules);

  return { rules: potentialRulesList };
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

  return `You are an expert analyst reviewing conversations between a coding agent and a software engineer.

**YOUR PRIMARY DIRECTIVE: Be extremely conservative. Most conversations do NOT contain useful generalizable rules.** Your job is to identify ONLY those rare, genuinely universal principles that would help the agent in completely unrelated future tasks.

**Your Task:**
1. Analyze the conversation provided.
2. Identify corrections or redirections that reveal principles TRUE ACROSS ALMOST ANY CONTEXT.
3. For each correction, ask yourself: "Would this principle be useful if I were working on a completely different project, with different files, different languages, and different requirements?" If not, DO NOT create a rule.
4. List only rules that pass this high bar in Markdown bullet points. No preamble.

**RULES ABOUT RULES:**
- When in doubt, EXCLUDE. It is better to generate no rules than to generate specific ones.
- If a rule references any specific file name, function name, variable name, or project-specific detail, it is INVALID.
- If a rule is specific to a particular language, framework, or tool without broader applicability, it is INVALID.
- If the user simply clarified requirements (not corrected a flawed approach), it is NOT a rule-worthy correction.

**Valid General Rule Examples:**
<examples>
- Always ask for clarification if the user's request is ambiguous.
- Never make assumptions about file paths without confirmation.
- Always follow the user's explicitly stated formatting preferences.
- Never provide incomplete code snippets without indicating they are partial.
- Always check for potential null or undefined values before accessing properties.
</examples>

**INVALID Examples (Do NOT generate these):**
<bad-examples>
- Always use 'const' instead of 'let' for variables (too specific - depends on mutability needs)
- Never forget to pass the 'config' object to functions (specific to this codebase)
- Always add a try-catch block around API calls (too specific - depends on error handling strategy)
- Always run tests after making changes (task-specific workflow, not a general principle)
- Never modify the .env file (project-specific)
</bad-examples>

This is the original system prompt the agent operated under:
<systemPrompt>
${sys}
</systemPrompt>`;
}
