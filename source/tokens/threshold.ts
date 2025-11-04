import { config } from "../config.ts";
import type { TokenCounter } from "./counter.ts";

/**
 * Standardized result when token limit is exceeded
 */
interface TokenLimitResult {
  content: string;
  tokenCount: number;
  truncated: boolean;
}

/**
 * Generates a standardized token limit message for LLM tools
 * @param toolName - Name of the tool (e.g., "ReadFile", "Bash")
 * @param tokenCount - Actual token count of content
 * @param maxTokens - Maximum allowed tokens
 * @param additionalGuidance - Optional specific guidance for this tool
 * @returns TokenLimitResult with message and metadata
 */
export function createTokenLimitResult(
  toolName: string,
  tokenCount: number,
  additionalGuidance?: string,
): TokenLimitResult {
  const truncated = true;

  const baseMessage = `${toolName}: Content (${tokenCount} tokens) exceeds maximum allowed tokens`;

  const guidance =
    additionalGuidance ??
    "Please adjust your parameters to reduce content size";

  const content = `${baseMessage}. ${guidance}`;

  return {
    content,
    tokenCount,
    truncated,
  };
}

/**
 * Check if content should be truncated and return appropriate result
 * @param content - The content to check
 * @param tokenCounter - Token counter instance
 * @param toolName - Name of the tool for messages
 * @param additionalGuidance - Optional tool-specific guidance
 * @returns Either the original content or token limit message
 */
export async function manageTokenLimit<T extends string>(
  content: T,
  tokenCounter: TokenCounter,
  toolName: string,
  additionalGuidance?: string,
): Promise<{ content: T | string; tokenCount: number; truncated: boolean }> {
  let tokenCount = 0;
  try {
    tokenCount = tokenCounter.count(content);
  } catch (tokenError) {
    console.info("Error calculating token count:", tokenError);
    // Return content if token counting fails
    return { content, tokenCount: 0, truncated: false };
  }

  const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

  if (tokenCount <= maxTokens) {
    return { content, tokenCount, truncated: false };
  }

  const limitResult = createTokenLimitResult(
    toolName,
    tokenCount,
    additionalGuidance,
  );
  return {
    content: limitResult.content as string,
    tokenCount,
    truncated: true,
  };
}
