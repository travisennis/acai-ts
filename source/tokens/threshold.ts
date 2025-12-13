import { config } from "../config.ts";
import type { TokenCounter } from "./counter.ts";

// Cache for maxTokens config to avoid repeated async calls
let maxTokensCache: number | null = null;
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Export cache management for testing
export function clearTokenCache() {
  maxTokensCache = null;
  cacheExpiry = 0;
}

/**
 * Get maxTokens from config with caching
 */
async function getMaxTokens(): Promise<number> {
  const now = Date.now();

  if (maxTokensCache !== null && now < cacheExpiry) {
    return maxTokensCache;
  }

  try {
    const projectConfig = await config.getConfig();
    maxTokensCache = projectConfig.tools.maxTokens;
    cacheExpiry = now + CACHE_DURATION;
    return maxTokensCache;
  } catch (error) {
    console.info("Failed to read config for maxTokens, using default:", error);
    maxTokensCache = 8000; // Default fallback
    cacheExpiry = now + CACHE_DURATION;
    return maxTokensCache;
  }
}

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
 * @param encoding - Optional encoding type for non-text file handling
 * @returns Either the original content or token limit message
 */
export async function manageTokenLimit<T extends string>(
  content: T,
  tokenCounter: TokenCounter,
  toolName: string,
  additionalGuidance?: string,
  encoding?: string,
): Promise<{ content: T | string; tokenCount: number; truncated: boolean }> {
  // For non-text files, return content directly without token management
  if (encoding && !encoding.startsWith("utf")) {
    return { content, tokenCount: 0, truncated: false };
  }

  let tokenCount = 0;
  try {
    tokenCount = tokenCounter.count(content);
  } catch (tokenError) {
    console.info("Error calculating token count:", tokenError);
    // Return content if token counting fails
    return { content, tokenCount: 0, truncated: false };
  }

  const maxTokens = await getMaxTokens();

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
