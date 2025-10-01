import type { TokenCounter } from "./counter.ts";

/**
 * Interface for options when managing output
 */
interface ManageOutputOptions {
  tokenCounter: TokenCounter;
  threshold?: number; // Default 8000 tokens
  truncate?: boolean; // Whether to truncate if exceeded (default: true)
}

/**
 * Interface for the result of managing output
 */
interface TruncatedOutput {
  content: string;
  tokenCount: number;
  truncated: true;
  warning: string;
}

interface Output {
  content: string;
  tokenCount: number;
  truncated: false;
  warning?: string;
}

type ManagedOutput = Output | TruncatedOutput;

/**
 * Manages output by counting tokens and optionally truncating if over threshold.
 * @param input - The input string to manage
 * @param options - Configuration for management
 * @returns Managed output details
 */
export function manageOutput(
  input: string,
  options: ManageOutputOptions,
): ManagedOutput {
  const { threshold = 8000, truncate = true } = options;

  if (!input) {
    return { content: input, tokenCount: 0, truncated: false };
  }

  let tokenCount: number;
  try {
    tokenCount = options.tokenCounter.count(input);
  } catch (error) {
    console.warn(`Token counting failed: ${error}. Using fallback.`);
    // Fallback: Rough estimate (4 chars ~1 token)
    tokenCount = Math.ceil(input.length / 4);
  }

  if (tokenCount <= threshold) {
    return { content: input, tokenCount, truncated: false };
  }

  const _exceededBy = tokenCount - threshold;
  let truncatedContent = input;
  let truncated = false;

  if (truncate) {
    // Simple truncation: Cut to approx threshold tokens, add ellipsis
    // For better UX, could be smarter (e.g., by lines for grep, preserve JSON)
    // But keep general for now
    const targetLength = threshold * 4; // Rough char estimate
    truncatedContent = `${input.slice(0, targetLength)}\n\n[Output truncated at ~${threshold} tokens (${_exceededBy} tokens omitted)]`;
    truncated = true;
  }

  const warning = truncated
    ? `Warning: Output exceeds token threshold (${threshold}). Tokens: ${tokenCount}. ${truncate ? "Truncated." : "Full output returned—consider summarizing."}`
    : undefined;

  return {
    content: truncatedContent,
    tokenCount,
    truncated,
    warning,
  } as ManagedOutput;
}
