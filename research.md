# Provider Implementation Research

## Research Question

How is the OpenRouter provider implemented in the acai-ts codebase, and how are providers registered/configured?

## Overview

This research covers the provider implementation in the acai-ts codebase, focusing on:
1. OpenRouter provider implementation
2. Provider registration and configuration
3. Provider implementation structure
4. Model metadata and registry

## Key Findings

### 1. OpenRouter Provider Implementation

**File**: `source/models/openrouter-provider.ts`

The OpenRouter provider is implemented using the `@ai-sdk/openai-compatible` package with a custom provider setup:

```typescript
// source/models/openrouter-provider.ts:6-17
const openRouterClient = createOpenAICompatible({
  name: "openrouter",
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://openrouter.ai/api/v1",
  headers: {
    "HTTP-Referer": "https://github.com/travisennis/acai-ts",
    "X-Title": "acai",
  },
});
```

**Model Definitions** (lines 20-38):
- Uses an `openrouterModels` object with model IDs as keys
- Each model is created using `openRouterClient("provider/model-id")` format
- Example: `deepseek-v3-2` maps to `openRouterClient("deepseek/deepseek-v3.2")`

**Provider Export** (lines 51-55):
```typescript
export const openrouterProvider = {
  openrouter: customProvider({
    languageModels: openrouterModels,
    fallbackProvider: openRouterClient as unknown as ProviderV2,
  }),
};
```

**Model Registry** (lines 57-260):
Each model has metadata including:
- `id`: Full model identifier (e.g., "openrouter:deepseek-v3-2")
- `provider`: "openrouter"
- `contextWindow`: Token context window size
- `maxOutputTokens`: Maximum output tokens
- `defaultTemperature`: Default temperature setting
- `promptFormat`: "xml" | "markdown" | "bracket"
- `supportsReasoning`: Boolean for reasoning support
- `supportsToolCalling`: Boolean for tool calling support
- `costPerInputToken` / `costPerOutputToken`: Pricing information

---

### 2. Provider Registration/Configuration

**File**: `source/models/providers.ts`

Providers are registered in a centralized location:

```typescript
// source/models/providers.ts:64-76
const registry = createProviderRegistry({
  ...anthropicProvider,
  ...deepseekProvider,
  ...googleProvider,
  ...groqProvider,
  ...openaiProvider,
  ...openrouterProvider,
  ...xaiProvider,
  ...opencodeZenProvider,
});
```

**Supported Providers** (lines 41-49):
```typescript
const providers = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "deepseek",
  "openrouter",
  "xai",
  "opencode",
] as const;
```

**Model Name Exports** (lines 79-87):
```typescript
export const models = [
  ...anthropicModelNames,
  ...openaiModelNames,
  ...googleModelNames,
  ...groqModelNames,
  ...deepseekModelNames,
  ...openrouterModelNames,
  ...xaiModelNames,
  ...opencodeZenModelNames,
] as const;
```

**Type Definitions** (lines 89-101):
```typescript
export type ModelName =
  | (typeof models)[number]
  | (`xai:${string}` & {})
  | (`openai:${string}` & {})
  | (`anthropic:${string}` & {})
  | (`google:${string}` & {})
  | (`groq:${string}` & {})
  | (`deepseek:${string}` & {})
  | (`openrouter:${string}` & {})
  | (`opencode:${string}` & {});
```

---

### 3. Provider Implementation Structure

Each provider follows a consistent pattern. Example structure:

**File**: `source/models/anthropic-provider.ts`

```typescript
// 1. Create the AI SDK client
const anthropicModels = {
  opus: createAnthropic()("claude-opus-4-6"),
  sonnet: createAnthropic()("claude-sonnet-4-5"),
  haiku: originalAnthropic("claude-haiku-4-5"),
} as const;

// 2. Define model name type
type ModelName = `anthropic:${keyof typeof anthropicModels>`;

// 3. Export model names array
export const anthropicModelNames: ModelName[] = objectKeys(anthropicModels).map(
  (key) => `anthropic:${key}` as const,
);

// 4. Create and export provider
export const anthropicProvider = {
  anthropic: customProvider({
    languageModels: anthropicModels,
    fallbackProvider: originalAnthropic,
  }),
};

// 5. Export model registry with metadata
export const anthropicModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  // ... metadata for each model
};
```

---

### 4. Model Selection and Initialization

**File**: `source/index.ts:311-336`

```typescript
async function initializeModelManager(
  appDir: DirectoryProvider,
): Promise<ModelManager> {
  const chosenModel: ModelName = isSupportedModel(flags.model)
    ? flags.model
    : "opencode:minimax-m2.5-free";

  const projectConfig = await config.getConfig();
  const devtoolsEnabled = projectConfig.devtools?.enabled ?? false;

  const modelManager = new ModelManager({
    stateDir: await appDir.ensurePath("audit"),
    devtoolsEnabled,
  });

  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("cli", chosenModel);
  modelManager.setModel("title-conversation", chosenModel);
  // ... other apps
}
```

---

### 5. AiConfig for Provider Options

**File**: `source/models/ai-config.ts`

Handles provider-specific configuration options including reasoning/thinking support:

```typescript
// source/models/ai-config.ts:63-95
providerOptions(): SharedV2ProviderMetadata {
  const modelConfig = this.modelMetadata;
  const thinkingLevel = this.thinkingLevel;

  const meta: SharedV2ProviderMetadata = {
    [modelConfig.provider]: {},
  };

  if (modelConfig.supportsReasoning && thinkingLevel.effort !== "none") {
    switch (modelConfig.provider) {
      case "anthropic":
        Object.assign(meta["anthropic"], {
          thinking: { type: "enabled", budgetTokens: thinkingLevel.tokenBudget },
        });
        break;
      case "openai":
        Object.assign(meta["openai"], { reasoningEffort: thinkingLevel.effort });
        break;
      case "google":
        Object.assign(meta["google"], { thinkingConfig: { thinkingBudget: thinkingLevel.tokenBudget } });
        break;
      case "openrouter":
        Object.assign(meta["openrouter"], { reasoning: { enabled: true, effort: thinkingLevel.effort } });
        break;
      // ...
    }
  }
}
```

---

## Architecture & Design Patterns

### Pattern 1: Custom Provider with Fallback

**Description**: Each provider uses the `customProvider` from the `ai` package with a fallback provider.
**Example**: `source/models/openrouter-provider.ts:51-55`
**When Used**: All provider implementations use this pattern.

### Pattern 2: Model Registry Pattern

**Description**: Models are defined in a registry object with metadata for each model.
**Example**: `source/models/providers.ts:103-112`
```typescript
export const modelRegistry: Record<ModelName, ModelMetadata> = {
  ...anthropicModelRegistry,
  ...openaiModelRegistry,
  // ... all provider registries
};
```
**When Used**: Used for model validation, metadata lookup, and pricing calculations.

### Pattern 3: Type-Safe Model Names

**Description**: Model names are typed with provider prefix (e.g., `openrouter:deepseek-v3-2`).
**Example**: `source/models/providers.ts:89-101`
**When Used**: Ensures type safety for model selection.

### Pattern 4: Provider Registry with Spread

**Description**: All providers are merged into a single registry using spread operator.
**Example**: `source/models/providers.ts:64-76`
**When Used**: Centralized provider registration.

---

## Data Flow

1. **CLI/REPL starts** → `source/index.ts:initializeModelManager()`
2. **Model selected from flags** → Falls back to default `"opencode:minimax-m2.5-free"`
3. **ModelManager created** → `source/models/manager.ts:ModelManager`
4. **Models set per app** → `modelManager.setModel("repl", chosenModel)`
5. **Language model retrieved** → `languageModel(model)` from registry
6. **Middleware applied** → Cache, rate limiting, audit messages
7. **Model used for requests** → Through Vercel AI SDK

---

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| OpenRouter Provider | `source/models/openrouter-provider.ts` | Defines OpenRouter models, provider, and metadata |
| Provider Registry | `source/models/providers.ts` | Central registry for all providers and model names |
| Model Manager | `source/models/manager.ts` | Manages models per application context |
| AiConfig | `source/models/ai-config.ts` | Handles provider-specific configuration |
| CLI Entry | `source/index.ts` | Initializes model manager with CLI flags |

### Configuration Files

- **`source/config/index.ts`**: General app configuration (not model-specific)
- **Environment Variables**: `OPENROUTER_API_KEY` (required for OpenRouter)
- **CLI Flags**: `--model` flag to specify model

---

## Integration Points

### Dependencies
- `@ai-sdk/openai-compatible` - For OpenRouter API compatibility
- `@ai-sdk/provider` - For ProviderV2 type
- `ai` - For customProvider and createProviderRegistry
- `vercel/ai` - Core SDK

### Consumers
- `source/index.ts` - Main entry point
- `source/models/manager.ts` - Uses providers for LLM calls
- `source/sessions/manager.ts` - Uses model metadata for token tracking
- `source/agent/index.ts` - Uses models for agent execution

---

## Edge Cases & Error Handling

### Edge Cases
1. **Unsupported model**: Falls back to default `"opencode:minimax-m2.5-free"` (source/index.ts:314-316)
2. **Missing API key**: Uses empty string which will fail at runtime
3. **Provider-specific features**: Model metadata determines reasoning/tool calling support

### Error Handling
1. **Model not initialized**: Throws error with "Model not initialized" message (source/models/manager.ts:87, 94)
2. **Invalid model name**: Checked via `isSupportedModel()` and `isValidModel()` functions

---

## Known Limitations

1. **Hardcoded API keys in environment**: OpenRouter API key must be set via `OPENROUTER_API_KEY` environment variable
2. **No dynamic model addition**: Models are hardcoded in provider files, no runtime registration
3. **Limited provider options**: Only supports 8 providers (anthropic, openai, google, groq, deepseek, openrouter, xai, opencode)

---

## Testing Coverage

### Existing Tests
- Provider type exports are validated through TypeScript compilation
- Model metadata structure validated through type system
- No explicit provider unit tests found in the codebase

### Test Gaps
- No integration tests for provider API calls
- No unit tests for model metadata validation
- No tests for provider-specific configuration options

---

## References

### Source Files
- `source/models/openrouter-provider.ts` - OpenRouter implementation
- `source/models/providers.ts` - Central provider registry
- `source/models/manager.ts` - Model manager
- `source/models/ai-config.ts` - AI configuration with provider options
- `source/models/anthropic-provider.ts` - Example provider implementation
- `source/models/openai-provider.ts` - Another example provider
- `source/index.ts` - Main entry point with model initialization
