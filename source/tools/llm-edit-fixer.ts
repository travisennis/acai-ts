import { z } from "zod";
import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.ts";

const GENERATE_JSON_TIMEOUT_MS = 40000; // 40 seconds

const EDIT_SYS_PROMPT = `
You are an expert code-editing assistant specializing in debugging and correcting failed search-and-replace operations.

# Primary Goal
Your task is to analyze a failed edit attempt and provide a corrected \`search\` string that will match the text in the file precisely. The correction should be as minimal as possible, staying very close to the original, failed \`search\` string. Do NOT invent a completely new edit based on the instruction; your job is to fix the provided parameters.

It is important that you do no try to figure out if the instruction is correct. DO NOT GIVE ADVICE. Your only goal here is to do your best to perform the search and replace task! 

# Input Context
You will be given:
1. The high-level instruction for the original edit.
2. The exact \`search\` and \`replace\` strings that failed.
3. The error message that was produced.
4. The full content of the latest version of the source file.

# Rules for Correction
1.  **Minimal Correction:** Your new \`search\` string must be a close variation of the original. Focus on fixing issues like whitespace, indentation, line endings, or small contextual differences.
2.  **Explain the Fix:** Your \`explanation\` MUST state exactly why the original \`search\` failed and how your new \`search\` string resolves that specific failure. (e.g., "The original search failed due to incorrect indentation; the new search corrects the indentation to match the source file.").
3.  **Preserve the \`replace\` String:** Do NOT modify the \`replace\` string unless the instruction explicitly requires it and it was the source of the error. Do not escape any characters in \`replace\`. Your primary focus is fixing the \`search\` string.
4.  **No Changes Case:** CRUCIAL: if the change is already present in the file,  set \`noChangesRequired\` to True and explain why in the \`explanation\`. It is crucial that you only do this if the changes outline in \`replace\` are already in the file and suits the instruction.
5.  **Exactness:** The final \`search\` field must be the EXACT literal text from the file. Do not escape characters.
`;

const EDIT_USER_PROMPT = `
# Goal of the Original Edit
<instruction>
{instruction}
</instruction>

# Failed Attempt Details
- **Original \`search\` parameter (failed):**
<search>
{old_string}
</search>
- **Original \`replace\` parameter:**
<replace>
{new_string}
</replace>
- **Error Encountered:**
<error>
{error}
</error>

# Full File Content
<file_content>
{current_content}
</file_content>

# Your Task
Based on the error and the file content, provide a corrected \`search\` string that will succeed. Remember to keep your correction minimal and explain the precise reason for the failure in your \`explanation\`.
`;

// Zod schema for the LLM response
const SearchReplaceEditSchema = z.object({
  search: z.string(),
  replace: z.string(),
  noChangesRequired: z.boolean(),
  explanation: z.string(),
});

type SearchReplaceEdit = z.infer<typeof SearchReplaceEditSchema>;

/**
 * Auto-generates an instruction based on edit parameters when none is provided
 */
function autoGenerateInstruction(oldString: string, newString: string): string {
  // Create a natural language description of the edit intent
  const oldPreview =
    oldString.length > 50 ? `${oldString.slice(0, 47)}...` : oldString;
  const newPreview =
    newString.length > 50 ? `${newString.slice(0, 47)}...` : newString;

  return `Replace "${oldPreview}" with "${newPreview}"`;
}

/**
 * Generates JSON with timeout and proper error handling
 */
async function generateJsonWithTimeout<T>(
  modelManager: ModelManager | undefined,
  params: {
    system: string;
    prompt: string;
    abortSignal?: AbortSignal;
  },
  timeoutMs: number,
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    // Combine abort signals
    const combinedSignal = AbortSignal.any([
      params.abortSignal ?? new AbortController().signal,
      timeoutSignal,
      controller.signal,
    ]);

    if (!modelManager) {
      throw new Error("Edit-fix model not available");
    }

    const { text } = await modelManager.getText(
      "edit-fix",
      params.system,
      params.prompt,
      combinedSignal,
    );

    // Parse the JSON response
    try {
      const parsed = JSON.parse(text) as T;
      return parsed;
    } catch (error) {
      logger.error(error, "Failed to parse LLM response as JSON.");
      logger.info(`Response preview: ${text.slice(0, 500)}`);
      return null;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn(`LLM edit fix operation timed out. Timeout: ${timeoutMs}ms`);
      return null;
    }

    logger.error(
      `LLM edit fix operation failed. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

/**
 * Attempts to fix a failed edit by using an LLM to generate a new search and replace pair.
 *
 * @param instruction The instruction for what needs to be done. If not provided, will auto-generate from oldString/newString
 * @param oldString The original string to be replaced
 * @param newString The original replacement string
 * @param error The error that occurred during the initial edit
 * @param currentContent The current content of the file
 * @param modelManager The model manager for accessing LLM models
 * @param tokenTracker The token tracker for usage monitoring
 * @param abortSignal An abort signal to cancel the operation
 * @returns A corrected search and replace pair, or null if fixing failed
 */
export async function fixLlmEditWithInstruction(
  instruction: string | undefined,
  oldString: string,
  newString: string,
  error: string,
  currentContent: string,
  modelManager: ModelManager | undefined,
  abortSignal?: AbortSignal,
): Promise<SearchReplaceEdit | null> {
  // If no modelManager is available, return null (LLM fix not available)
  if (!modelManager) {
    return null;
  }

  const finalInstruction =
    instruction || autoGenerateInstruction(oldString, newString);

  // Generate the user prompt with substitutions
  const userPrompt = EDIT_USER_PROMPT.replace("{instruction}", finalInstruction)
    .replace("{old_string}", oldString)
    .replace("{new_string}", newString)
    .replace("{error}", error)
    .replace("{current_content}", currentContent);

  const result = await generateJsonWithTimeout<SearchReplaceEdit>(
    modelManager,
    {
      system: EDIT_SYS_PROMPT,
      prompt: userPrompt,
      abortSignal,
    },
    GENERATE_JSON_TIMEOUT_MS,
  );

  // Validate the result with Zod schema
  if (result) {
    try {
      const validatedResult = SearchReplaceEditSchema.parse(result);
      logger.info("LLM edit fix successful.");
      return validatedResult;
    } catch (validationError) {
      logger.error(
        `LLM edit fix response validation failed. Error: ${validationError instanceof Error ? validationError.message : "Unknown validation error"}`,
      );
      console.info("Response:", result);
    }
  }

  return null;
}
