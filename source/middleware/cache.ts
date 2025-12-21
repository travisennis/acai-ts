import { createHash } from "node:crypto";
import type {
  LanguageModelV2Middleware,
  SharedV2ProviderOptions,
} from "@ai-sdk/provider";
import { logger } from "../logger.ts";

interface CacheOptions {
  ttl?: string;
  retention?: string;
}

function applyCaching(
  input: {
    providerOptions?: SharedV2ProviderOptions | undefined;
  },
  options: CacheOptions = {},
) {
  const { ttl } = options;

  input.providerOptions = {
    anthropic: {
      cacheControl: ttl ? { type: "ephemeral", ttl } : { type: "ephemeral" },
    },
    openrouter: {
      // biome-ignore lint/style/useNamingConvention: third-party
      cache_control: { type: "ephemeral" },
      cacheControl: { type: "ephemeral" },
    },
    bedrock: {
      cachePoint: { type: "ephemeral" },
    },
    openaiCompatible: {
      // biome-ignore lint/style/useNamingConvention: third-party
      cache_control: { type: "ephemeral" },
    },
  };
}

function generateCacheKey(text: string, salt?: string): string {
  const content = salt ? `${text}|${salt}` : text;
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getMinTokenThreshold(provider: string, modelId?: string): number {
  if (provider === "anthropic") {
    if (modelId?.includes("haiku")) return 2048;
    if (modelId?.includes("opus")) return 1024;
    return 1024; // Default for Claude models
  }
  return 1024; // Default threshold
}

function isEligibleForCaching(
  text: string,
  provider: string,
  modelId?: string,
): boolean {
  const tokenCount = estimateTokens(text);
  const minThreshold = getMinTokenThreshold(provider, modelId);

  if (tokenCount < minThreshold) {
    logger.info(
      `[Cache] Ineligible: ${tokenCount} tokens < ${minThreshold} threshold`,
    );
    return false;
  }

  return true;
}

function detectProvider(providerId: string, modelId: string): string {
  if (
    providerId === "anthropic" ||
    modelId.includes("anthropic") ||
    modelId.includes("claude")
  ) {
    return "anthropic";
  }
  if (providerId === "openai" || modelId.includes("gpt-")) {
    return "openai";
  }
  if (
    providerId === "bedrock" ||
    modelId.includes("bedrock") ||
    modelId.includes("amazon")
  ) {
    return "bedrock";
  }
  if (modelId.includes("openrouter")) {
    return "openrouter";
  }
  return "unknown";
}

export const cacheMiddleware: LanguageModelV2Middleware = {
  transformParams: async ({ params, model }) => {
    const providerId = model.provider;
    const modelId = model.modelId;
    const provider = detectProvider(providerId, modelId);

    logger.info(`[Cache] Detected provider: ${provider}, model: ${modelId}`);

    if (provider === "unknown") {
      logger.info("[Cache] Unknown provider, skipping caching");
      return params;
    }

    const msgs = params.prompt;

    // Extract system messages for cache key generation
    const systemMessages = msgs.filter((msg) => msg.role === "system");
    const systemText = systemMessages
      .map((msg) =>
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as Array<{ text: string }>)
                .map((c) => c.text)
                .join(" ")
            : "",
      )
      .join("\n");

    // Check if system prompt is eligible for caching
    const isEligible = isEligibleForCaching(systemText, provider, modelId);

    if (!isEligible) {
      logger.info("[Cache] System prompt not eligible for caching");
      return params;
    }

    // Generate deterministic cache key
    const cacheKey = generateCacheKey(systemText, provider);
    logger.info(`[Cache] Generated cache key: ${cacheKey.substring(0, 8)}...`);

    // Apply caching to system messages
    for (const systemMsg of systemMessages) {
      applyCaching(systemMsg, { ttl: "1h" });
    }

    // Get the last two user messages for caching
    const userMessages = msgs.filter((msg) => msg.role === "user");
    const lastTwoUserMessages = userMessages.slice(-2);

    // Mark both the latest and second-to-last user messages as ephemeral
    for (const userMessage of lastTwoUserMessages) {
      const content = userMessage.content;
      if (Array.isArray(content)) {
        const finalContent = content.at(-1);
        if (finalContent) {
          applyCaching(finalContent, { ttl: "1h" });
        }
      }
    }

    const tools = params.tools;
    if (tools) {
      const lastTool = tools.at(-1);
      if (lastTool?.type === "function") {
        applyCaching(lastTool, { ttl: "1h" });
      }
    }

    // Add cache metadata for observability
    params.providerOptions = params.providerOptions || {};
    params.providerOptions["__cacheMetadata"] = {
      cacheKey,
      provider,
      eligible: isEligible,
      systemTokens: estimateTokens(systemText),
      threshold: getMinTokenThreshold(provider, modelId),
      timestamp: Date.now(),
    };

    logger.info(`[Cache] Applied caching for ${provider} model`);

    return params;
  },
};
