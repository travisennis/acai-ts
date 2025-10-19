import type {
  LanguageModelV2Middleware,
  SharedV2ProviderOptions,
} from "@ai-sdk/provider";

function applyCaching(input: {
  providerOptions?: SharedV2ProviderOptions | undefined;
}) {
  input.providerOptions = {
    anthropic: { cacheControl: { type: "ephemeral" } },
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

export const cacheMiddleware: LanguageModelV2Middleware = {
  transformParams: async ({ params, model }) => {
    const providerId = model.provider;
    const modelId = model.modelId;
    if (
      providerId === "anthropic" ||
      modelId.includes("anthropic") ||
      modelId.includes("claude")
    ) {
      const msgs = params.prompt;

      const system = msgs.filter((msg) => msg.role === "system").at(0);
      if (system) {
        applyCaching(system);
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
            applyCaching(finalContent);
          }
        }
      }

      const tools = params.tools;
      if (tools) {
        const lastTool = tools.at(-1);
        if (lastTool?.type === "function") {
          applyCaching(lastTool);
        }
      }
    }
    return params;
  },
};
