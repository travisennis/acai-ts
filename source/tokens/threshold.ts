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

export class TokenLimitExceededError extends Error {
  constructor(
    toolName: string,
    tokenCount: number,
    maxTokens: number,
    guidance?: string,
  ) {
    super(
      `${toolName}: Content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). ${
        guidance || "Please adjust parameters to reduce content size."
      }`,
    );
    this.name = "TokenLimitExceededError";
  }
}

/**
 * Check if content exceeds token limit
 * @param content - The content to check
 * @param tokenCounter - Token counter instance
 * @param toolName - Name of the tool for messages
 * @param additionalGuidance - Optional tool-specific guidance
 * @param encoding - Optional encoding type for non-text file handling
 * @returns Content with token count if under limit
 * @throws TokenLimitExceededError if content exceeds token limit
 */
export async function manageTokenLimit<T extends string>(
  content: T,
  tokenCounter: TokenCounter,
  toolName: string,
  additionalGuidance?: string,
  encoding?: string,
): Promise<{ content: T; tokenCount: number }> {
  // For non-text files, return content directly without token management
  if (encoding && !encoding.startsWith("utf")) {
    return { content, tokenCount: 0 };
  }

  let tokenCount = 0;
  try {
    tokenCount = tokenCounter.count(content);
  } catch (tokenError) {
    console.info("Error calculating token count:", tokenError);
    // Return content if token counting fails
    return { content, tokenCount: 0 };
  }

  const maxTokens = await getMaxTokens();

  if (tokenCount <= maxTokens) {
    return { content, tokenCount };
  }

  throw new TokenLimitExceededError(
    toolName,
    tokenCount,
    maxTokens,
    additionalGuidance,
  );
}
