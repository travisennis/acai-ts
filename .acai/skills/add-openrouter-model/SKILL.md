---
name: add-openrouter-model
description: Add a new OpenRouter model to the acai-ts project by fetching model details from OpenRouter API and updating the provider configuration.
---

# Add OpenRouter Model

Adds a new model to `source/models/openrouter-provider.ts` by fetching model details from the OpenRouter API and following the project's existing patterns.

## Usage

```bash
# Add a specific model by ID
{baseDir}/add-model.js google/gemini-3-flash-preview

# Search for models (interactive)
{baseDir}/add-model.js --search "gemini"

# Dry run - show what would be added
{baseDir}/add-model.js google/gemini-3-flash-preview --dry-run

# Specify custom output file
{baseDir}/add-model.js google/gemini-3-flash-preview --file ./custom-provider.ts
```

## How It Works

1. **Fetches model data** from `https://openrouter.ai/api/v1/models`
2. **Filters** for the specified model ID or searches interactively
3. **Extracts key information**:
   - Context window length (`context_length`)
   - Max output tokens (`top_provider.max_completion_tokens`)
   - Pricing (`pricing.prompt`, `pricing.completion`)
   - Supported features (checks `supported_parameters` for reasoning/tool calling)
4. **Updates** `openrouter-provider.ts`:
   - Adds model to `openrouterModels` object (alphabetically sorted)
   - Adds metadata to `openrouterModelRegistry`
   - Maintains TypeScript type safety with `as LanguageModelV2` casting
5. **Validates** changes with project tooling:
   - TypeScript compilation (`npm run typecheck`)
   - Linting (`npm run lint`)
   - Formatting (`npm run format`)

## Model Information Mapping

| API Field | Registry Field | Notes |
|-----------|----------------|-------|
| `id` | Used in `openRouterClient()` call | Full OpenRouter ID |
| `context_length` | `contextWindow` | Direct mapping |
| `top_provider.max_completion_tokens` | `maxOutputTokens` | Defaults to `context_length` if missing |
| `pricing.prompt` | `costPerInputToken` | Converted to number |
| `pricing.completion` | `costPerOutputToken` | Converted to number |
| `supported_parameters` | `supportsReasoning`/`supportsToolCalling` | Checks for `include_reasoning` and `tools` |

## Default Values

When API data is incomplete, the script uses sensible defaults:

- `defaultTemperature`: 0.5 (or -1 for code models)
- `promptFormat`: Inferred from model family (Gemini → "markdown", GPT → "xml", etc.)
- `supportsReasoning`: `true` if model supports `include_reasoning` parameter
- `supportsToolCalling`: `true` if model supports `tools` parameter

## Error Handling

- Validates model ID exists in OpenRouter API
- Checks for duplicate entries in provider file
- Validates TypeScript compilation after changes
- Creates backup of original file (`*.backup`)
- Provides clear error messages with suggestions

## Integration with Project

- Follows existing alphabetical ordering in model objects
- Uses project's TypeScript patterns and casting
- Respects Biome formatting rules
- Runs project validation commands
- Compatible with ESM module system

## When to Use

- Adding new OpenRouter models to the project
- Updating existing model metadata from API changes
- Batch adding multiple models
- Validating model configuration against API data
- Maintaining consistency across model definitions

## Examples

```bash
# Add Gemini 3 Flash Preview (as we just did)
{baseDir}/add-model.js google/gemini-3-flash-preview

# See what would change without modifying files
{baseDir}/add-model.js anthropic/claude-3-5-sonnet --dry-run

# Search for models containing "flash"
{baseDir}/add-model.js --search flash
```