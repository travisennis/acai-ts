# Model Switching Architecture

## Overview
This document outlines the implementation of dynamically switching between different AI models within the acai CLI tool. The ability to switch between models during a session provides flexibility for users to select the most appropriate model for their specific tasks, balancing capabilities, speed, and cost.

## Current Implementation

### Available Models
Models are defined in `source/models/providers.ts` and organized by provider (anthropic, openai, google, deepseek, azure, openrouter, ollama). Each model has metadata including:

- **Provider**: The model's provider (anthropic, openai, google, etc.)
- **Context Window**: Maximum context length the model supports
- **Max Output Tokens**: Maximum tokens the model can generate
- **Supports Tool Calling**: Whether the model supports function/tool calling
- **Supports Reasoning**: Whether the model supports reasoning/thinking steps
- **Category**: Performance category (fast, balanced, powerful)
- **Prompt Format**: Required format for prompts (xml, markdown, bracket)

### Command Line Usage
Models can be specified via the `--model` or `-m` flag when running acai:

```bash
$ acai --model anthropic:sonnet
$ acai -m openai:gpt-4o
```

The default model is "anthropic:sonnet-token-efficient-tools".

### Model Registry
The `modelRegistry` in `source/models/providers.ts` stores metadata for all supported models:

```typescript
export const modelRegistry: Record<ModelName, ModelMetadata> = {
  "anthropic:sonnet": {
    id: "anthropic:sonnet",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 64_000,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  // Other models...
}
```

### Language Model Initialization
The `getLanguageModel` function initializes a language model with appropriate middleware:

```typescript
export function getLanguageModel({
  model,
  app,
  stateDir,
}: {
  model: ModelName;
  app: string;
  stateDir: string;
}) {
  const langModel = wrapLanguageModel(
    languageModel(model),
    auditMessage({ filePath: stateDir, app }),
  );

  return langModel;
}
```

### Helper Functions
The model registry includes utility functions:

- `isSupportedModel`: Checks if a model name is valid
- `getModelsByProvider`: Groups models by their provider
- `getModelInfo`: Returns detailed information about a specific model
- `isValidModel`: Validates if a given string is a valid model name
- `getRecommendedModels`: Suggests models based on task requirements

## Future Enhancements

### Command Interface
Implement the following commands in the `ReplCommands` class:

```typescript
// Model-related commands
const modelListCommand = {
  command: "/model list",
  description: "Display available models with details",
};

const modelUseCommand = {
  command: "/model use <model-name>",
  description: "Switch to specified model",
};

const modelInfoCommand = {
  command: "/model info <model-name>",
  description: "Show detailed information about a model",
};

const modelDefaultCommand = {
  command: "/model default <model-name>",
  description: "Set default model for future sessions",
};
```

### Configuration Persistence
Use the existing `readAppConfig`/`writeAppConfig` in `config.ts` to store user preferences:

```typescript
interface ModelPreferences {
  defaultModel: ModelName;
  recentModels: ModelName[];
  modelUsage: Record<ModelName, {
    lastUsed: string;
    totalTokens: number;
    totalCalls: number;
  }>;
}
```

### Runtime Model Switching
Implement model switching in the `Repl` class:

```typescript
async switchModel(newModelName: ModelName): Promise<void> {
  try {
    this.terminal.info(`Switching to model: ${newModelName}...`);
    
    // Get current and new model configs
    const currentModelConfig = modelRegistry[this.currentModelName];
    const newModelConfig = modelRegistry[newModelName];
    
    // Check for compatibility issues
    if (currentModelConfig.supportsToolCalling && !newModelConfig.supportsToolCalling) {
      this.terminal.warn("The new model doesn't support tool calling, which may limit functionality.");
    }
    
    // Initialize new model
    this.langModel = await this.initializeModel(newModelName);
    this.currentModelName = newModelName;
    
    // Update model preferences
    const modelPrefs = await getModelPreferences();
    const recentModels = [newModelName, ...modelPrefs.recentModels.filter(m => m !== newModelName)].slice(0, 5);
    await updateModelPreferences({ recentModels });
    
    this.terminal.success(`Successfully switched to ${newModelName}`);
  } catch (error) {
    this.terminal.error(`Failed to switch model: ${(error as Error).message}`);
  }
}
```

### UI Improvements
Enhance the display of model information:

- Model listing table with capabilities and performance characteristics
- Detailed model info display with all metadata
- Visual indicators for current model in the prompt

### Error Handling and Fallbacks

- Authentication error detection and helpful messaging
- Model fallback logic for unavailable models
- Provider-specific troubleshooting information

## Migration Strategy

### Backward Compatibility
- Support older model naming formats
- Migrate existing configurations to new format
- Provide deprecation warnings for legacy usage

## Implementation Phases

1. **Core Model Registry Enhancement**:
   - Complete metadata for all models
   - Add cost information and performance metrics

2. **Command Interface Implementation**:
   - Add model-related commands to `ReplCommands`
   - Implement model switching functionality

3. **UI and UX Improvements**:
   - Enhance terminal display with model information
   - Implement error handling and fallbacks

4. **Configuration Persistence**:
   - Store and manage user model preferences
   - Track usage statistics for models