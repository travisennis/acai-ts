# Model Switching Implementation Plan

## Overview
This document outlines a concrete implementation plan for adding model switching capability to the acai CLI tool. This will allow users to change the language model during an active REPL session without restarting the application.

## Current Implementation

- Models are defined in `source/models/providers.ts` with metadata for each model:
  - Provider (anthropic, openai, google, deepseek, etc.)
  - Context window size
  - Maximum output tokens
  - Tool calling support
  - Reasoning support
  - Performance category (fast, balanced, powerful)
  - Prompt format (xml, markdown, bracket)

- The ModelManager class in `source/models/manager.ts` manages model initialization
- Models are set at startup in `source/index.ts`
- The main model used in `source/repl.ts` is initialized and used for the REPL session

## Implementation Steps

### 1. Add Model Command to ReplCommands

In `source/replCommands.ts`, add a new command:

```typescript
const modelCommand = {
  command: "/model",
  description: "List available models or switch to a different model. Usage: /model [provider:model-name|category|provider]",
};
```

Implement the command handler to support:
- `/model` - Display current model and list all available models by category
- `/model [provider:model-name]` - Switch to specified model
- `/model [category]` - List models in a category (fast/balanced/powerful)
- `/model [provider]` - List models from a specific provider

### 2. Update Repl Class to Support Model Switching

In `source/repl.ts`, add model switching functionality:

```typescript
async switchModel(newModelName: ModelName): Promise<void> {
  try {
    this.terminal.info(`Switching to model: ${newModelName}...`);
    
    // Get current and new model configs
    const currentModelConfig = this.modelManager.getModelMetadata("repl");
    const newModelConfig = modelRegistry[newModelName];
    
    // Check for capability differences
    if (currentModelConfig.supportsToolCalling && !newModelConfig.supportsToolCalling) {
      this.terminal.warn("The new model doesn't support tool calling, which may limit functionality.");
    }
    if (currentModelConfig.supportsReasoning && !newModelConfig.supportsReasoning) {
      this.terminal.warn("The new model doesn't support reasoning, which may change response quality.");
    }
    
    // Update model in ModelManager
    this.modelManager.setModel("repl", newModelName);
    
    // Update the langModel reference
    const langModel = this.modelManager.getModel("repl");
    const modelConfig = this.modelManager.getModelMetadata("repl");
    
    // Update display
    this.terminal.success(`Successfully switched to ${newModelName}`);
    this.terminal.box(
      "State:",
      `Model:          ${langModel.modelId}\nContext Window: ${this.tokenTracker.getTotalUsage().totalTokens} tokens`,
    );
  } catch (error) {
    this.terminal.error(`Failed to switch model: ${(error as Error).message}`);
  }
}
```

### 3. Add Helper Functions for Model Selection

Update or add to `source/models/providers.ts`:

```typescript
// Get models by category
export function getModelsByCategory(category: "fast" | "balanced" | "powerful"): ModelMetadata[] {
  return Object.values(modelRegistry).filter((model) => model.category === category);
}

// Format model information for display
export function formatModelInfo(model: ModelMetadata): string {
  return `${model.id} [${model.category}] - Tools: ${model.supportsToolCalling ? "✓" : "✗"}, Reasoning: ${model.supportsReasoning ? "✓" : "✗"}`;
}
```

### 4. Update ReplCommands Implementation

Implement the model command handler in `source/replCommands.ts`:

```typescript
// Handle /model command
if (userInput.trim().startsWith("/model")) {
  const args = userInput.trim().substring("/model".length).trim();
  
  // No args - display current model and list available models by category
  if (!args) {
    const currentModel = modelConfig.id;
    terminal.header(`Current model: ${currentModel}`);
    terminal.header("Available models by category:");
    
    // Fast models
    terminal.writeln("\nFast models:");
    for (const model of getModelsByCategory("fast")) {
      terminal.writeln(formatModelInfo(model));
    }
    
    // Balanced models
    terminal.writeln("\nBalanced models:");
    for (const model of getModelsByCategory("balanced")) {
      terminal.writeln(formatModelInfo(model));
    }
    
    // Powerful models
    terminal.writeln("\nPowerful models:");
    for (const model of getModelsByCategory("powerful")) {
      terminal.writeln(formatModelInfo(model));
    }
    
    return { break: false, continue: true };
  }
  
  // Switch to a specific model
  if (isValidModel(args)) {
    await repl.switchModel(args);
    return { break: false, continue: true };
  }
  
  // Display models by category
  if (["fast", "balanced", "powerful"].includes(args)) {
    terminal.header(`${args.charAt(0).toUpperCase() + args.slice(1)} models:`);
    for (const model of getModelsByCategory(args as "fast" | "balanced" | "powerful")) {
      terminal.writeln(formatModelInfo(model));
    }
    return { break: false, continue: true };
  }
  
  // Display models by provider
  const providers = ["anthropic", "openai", "google", "deepseek", "azure", "openrouter", "ollama"];
  if (providers.includes(args)) {
    terminal.header(`Models from ${args}:`);
    for (const model of Object.values(modelRegistry).filter(m => m.provider === args)) {
      terminal.writeln(formatModelInfo(model));
    }
    return { break: false, continue: true };
  }
  
  // Invalid model name
  terminal.error(`Invalid model name or category: ${args}`);
  terminal.info("Usage: /model [provider:model-name|category|provider]");
  return { break: false, continue: true };
}
```

### 5. Pass Repl Instance to ReplCommands

Update the ReplCommands constructor to accept a reference to the Repl instance:

```typescript
constructor({
  terminal,
  messageHistory,
  tokenTracker,
  fileManager,
  repl,
}: {
  terminal: Terminal;
  messageHistory: MessageHistory;
  tokenTracker: TokenTracker;
  fileManager: FileManager;
  repl: Repl;
}) {
  this.terminal = terminal;
  this.messageHistory = messageHistory;
  this.tokenTracker = tokenTracker;
  this.fileManager = fileManager;
  this.repl = repl;
}
```

### 6. Configuration Persistence

In `source/config.ts`, add functions to persist model preferences:

```typescript
export async function savePreferredModel(modelName: ModelName): Promise<void> {
  const config = await readAppConfig("acai");
  config.preferredModel = modelName;
  await writeAppConfig("acai", config);
}

export async function getPreferredModel(): Promise<ModelName | undefined> {
  const config = await readAppConfig("acai");
  return isSupportedModel(config.preferredModel) 
    ? config.preferredModel 
    : undefined;
}
```

### 7. Modify index.ts to Use Preferred Model

Update model initialization in `source/index.ts` to check for preferred model:

```typescript
const preferredModel = await getPreferredModel();
const chosenModel: ModelName = isSupportedModel(cli.flags.model)
  ? cli.flags.model
  : preferredModel ?? "anthropic:sonnet-token-efficient-tools";
```

## Testing Plan

1. Test basic model switching between different providers
2. Verify history preservation after switching models
3. Test error handling for invalid models
4. Test configuration persistence
5. Verify token tracking after model switching
6. Test switching between models with different capabilities

## Implementation Notes

- Ensure compatibility checking when switching between models with different capabilities
- Consider token usage differences between models
- Update terminal UI to reflect current model
- Add proper error handling for API key issues
