import type { LanguageModelV2Middleware } from "@ai-sdk/provider";

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
      for (const msg of msgs) {
        if (msg.role === "system") {
          msg.providerOptions = {
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
      }
      const tools = params.tools;
      if (tools) {
        const lastTool = tools.at(-1);
        if (lastTool?.type === "function") {
          lastTool.providerOptions = {
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
      }
    }
    return params;
  },
};
