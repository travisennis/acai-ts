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

      const final = msgs.filter((msg) => msg.role === "user").at(-1);
      if (final) {
        const content = final.content;
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
