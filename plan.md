# Reduce Cache Middleware Logging Noise

## Summary
Remove excessive logging from `source/middleware/cache.ts` since only Anthropic models (sonnet, opus, haiku) require explicit caching - whether accessed directly or via OpenRouter/OpenCode Zen. Logging "skipping" for other providers is unnecessary noise.

## Key Architectural Change

**Change caching detection from provider-based to model-based:**

Currently, the cache middleware:
- Detects by provider name (anthropic, openrouter, bedrock, etc.)
- Applies caching to multiple providers
- Logs "Unknown provider, skipping" for non-Anthropic models

**Proposed approach:**
- Detect by model name (sonnet, opus, haiku) regardless of provider
- Only apply caching to those specific models
- Only log when caching is actually applied

## Changes

- [x] All phases completed

### `source/middleware/cache.ts`

**1. Update `detectProvider()` (lines 75-96)**
- Detect based on modelId containing "sonnet", "opus", or "haiku"
- Return "anthropic" for these models regardless of provider (openrouter, opencode-zen, etc.)
- Return "unknown" for all other models

**2. Update `getMinTokenThreshold()` (lines 49-55)**
- Current (incorrect): haiku=2048, opus=1024
- New: haiku=4096, opus=4096, sonnet=1024
- Apply based on modelId keywords, not provider name

**3. Remove unnecessary logs:**
| Line | Remove |
|------|--------|
| 107 | `[Cache] Detected provider: ${provider}, model: ${modelId}` |
| 110 | `[Cache] Unknown provider, skipping caching` |
| 69 | `[Cache] Ineligible: ${tokenCount} tokens < ${minThreshold} threshold` |
| 113 | `[Cache] System prompt not eligible for caching` |
| 118 | `[Cache] Generated cache key: ${cacheKey.substring(0, 8)}...` |

**4. Keep only one log (line 155):**
- `[Cache] Applied caching for ${provider} model` - only fires when caching is actually applied

### `improvements.md`

Update or remove the "Fix cache for unknown providers" entry since:
- Unknown providers don't need fixing - they correctly skip caching
- Only Anthropic models (sonnet, opus, haiku) require explicit caching
- This is working as intended, not a bug

## Token Thresholds

| Model | Threshold |
|-------|-----------|
| opus | 4096 |
| haiku | 4096 |
| sonnet | 1024 |

## Affected Models

Caching will apply to these models regardless of provider:

| Model | Direct | OpenRouter | OpenCode Zen |
|-------|--------|------------|--------------|
| sonnet | ✅ anthropic:sonnet | ✅ openrouter:sonnet-4.5 | ❌ |
| opus | ✅ anthropic:opus | ✅ openrouter:opus-4.6 | ✅ opencode:opus-4-6 |
| haiku | ✅ anthropic:haiku | ✅ openrouter:haiku-4.5 | ❌ |

## Success Criteria

**Automated verification:**
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` passes

**Manual verification:**
- Run with Anthropic model (sonnet/opus/haiku) - see cache applied log
- Run with OpenRouter Anthropic model (sonnet-4.5, opus-4.6, haiku-4.5) - see cache applied log
- Run with OpenCode Zen opus-4-6 - see cache applied log
- Run with any other model (kimi, qwen, glm, etc.) - **no cache logs appear**

## Out of Scope
- Changes to caching TTL or other parameters
- Adding new caching providers
- Performance optimization of cache middleware
- Changes to other logging in the codebase