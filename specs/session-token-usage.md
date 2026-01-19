# Task: Track and Save Session Token Usage (Per-Turn Breakdown)

## Objective

Implement comprehensive token usage tracking for sessions using a per-turn breakdown that persists to message-history files, enabling auditing, billing, and session resumption capabilities.

## Background

Currently, the application tracks token usage through the `TokenTracker` and displays it in the footer component. However, this usage data is not persisted to the message-history files. We need to save the **per-turn token usage** which enables:

- **Auditing**: See exactly which turn used how many tokens
- **Resumption**: Restore session state including the last turn's context window size
- **Billing**: Calculate total session cost by summing all turns
- **Debugging**: Identify unusual usage patterns across turns

## Key Distinction

**Context Window** vs **Total Usage** are two different things:

- **Context Window**: Size of the last turn only (used by progress bar)
- **Total Usage**: Accumulated across ALL turns (used for billing/auditing)

## Requirements

### 1. Data Structure

Add a `tokenUsage` field to the `SavedMessageHistory` type in `source/sessions/manager.ts`:

```typescript
type TokenUsageTurn = {
  stepIndex: number;                    // 0-based step within the session
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;                  // THIS VALUE = context window for next turn
  cachedInputTokens: number;            // from inputTokenDetails.cacheReadTokens
  reasoningTokens: number;              // from outputTokenDetails.reasoningTokens
  inputTokenDetails: {
    noCacheTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  outputTokenDetails: {
    textTokens: number;
    reasoningTokens: number;
  };
  timestamp: number;                    // performance.now() from when turn completed
  estimatedCost: number;                // calculated from model pricing for this turn
};

type SavedMessageHistory = {
  project: string;
  sessionId: string;
  modelId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  tokenUsage: TokenUsageTurn[];         // Per-turn array
};
```

### 2. SessionManager Updates

Add to `SessionManager` class:

- Private property: `private tokenUsage: TokenUsageTurn[] = []`
- Method: `recordTurnUsage(usage: AgentState['totalUsage'])`
  - Called after each agent turn completes
  - Creates a `TokenUsageTurn` entry with current usage data
  - Calculates cost using `this.modelManager.getModelMetadata("repl")`
  - Stores timestamp from the agent state
- Method: `getTokenUsage(): TokenUsageTurn[]` - returns all turns
- Method: `getTotalTokenUsage()` - calculates and returns aggregated totals
- Method: `getLastTurnContextWindow(): number` - returns `totalTokens` from last turn
- Method: `clearTokenUsage()` - clears usage when session is reset

Update methods:

- `save()`: Include `tokenUsage` array in the output JSON
- `restore(savedHistory: SavedMessageHistory)`: Restore `tokenUsage` from saved data
- `clear()`: Call `this.tokenUsage = []` when clearing session

### 3. Integration Points

In `source/agent/index.ts`:

- After agent turn completes (when `agent-stop` event is about to be yielded)
- Extract `this._state.totalUsage` (accumulated across all steps in this turn)
- Call `sessionManager.recordTurnUsage(this._state.totalUsage)`
- This should happen AFTER `tokenTracker.trackUsage("repl", this._state.totalUsage)`

```typescript
// After accumulating usage in the agent loop:
const turnUsage: TokenUsageTurn = {
  stepIndex: this._state.steps.length - 1,
  inputTokens: this._state.totalUsage.inputTokens,
  outputTokens: this._state.totalUsage.outputTokens,
  totalTokens: this._state.totalUsage.totalTokens,
  cachedInputTokens: this._state.totalUsage.cachedInputTokens,
  reasoningTokens: this._state.totalUsage.reasoningTokens,
  inputTokenDetails: { ...this._state.totalUsage.inputTokenDetails },
  outputTokenDetails: { ...this._state.totalUsage.outputTokenDetails },
  timestamp: performance.now(),
  estimatedCost: calculateTurnCost(this._state.totalUsage, modelConfig),
};

sessionManager.recordTurnUsage(turnUsage);
```

### 4. Cost Calculation

- Use current turn's usage values and model pricing
- Formula: `(inputTokens * costPerInputToken) + (outputTokens * costPerOutputToken)`
- Store per-turn cost for detailed billing

### 5. Session Resumption Support

When loading existing sessions via `SessionManager.load()`:

- Restore the `tokenUsage` array via `restore()` method
- The progress bar should use `getLastTurnContextWindow()` for the context window display
- The footer should display `getTotalTokenUsage()` for billing/auditing display
- When resuming, users see their accumulated usage history

### 6. REPL Display Updates

In `source/repl.ts`, when setting footer state:

- `currentContextWindow`: Use `messageHistory.getLastTurnContextWindow()`
- `usage`: Use `messageHistory.getTotalTokenUsage()` or keep using `tokenTracker` for current session

### 7. Testing

Create tests in `test/sessions/`:

- Test that `recordTurnUsage()` correctly appends to the array
- Test that multiple turns accumulate correctly
- Test `getTotalTokenUsage()` returns correct summed values
- Test `getLastTurnContextWindow()` returns correct last turn value
- Test save/restore preserves the full array
- Test cost calculation accuracy
- Test resumption behavior (loading old sessions shows previous usage)

## Implementation Location

- **Primary**: `source/sessions/manager.ts` - Add token usage tracking
- **Integration**: `source/agent/index.ts` - Call `recordTurnUsage()` after each turn
- **Display**: `source/repl.ts` - Use session manager methods for footer display

## Success Criteria

- [ ] Each agent turn's token usage is recorded as a separate entry
- [ ] Token usage array is persisted to `message-history-{sessionId}.json` files
- [ ] `getLastTurnContextWindow()` correctly returns the last turn's `totalTokens`
- [ ] `getTotalTokenUsage()` correctly sums all turns for billing/auditing
- [ ] Loading existing sessions restores the full token usage history
- [ ] Progress bar displays correct context window for resumed sessions
- [ ] Footer displays accumulated usage for resumed sessions
- [ ] All existing tests pass
- [ ] New tests verify per-turn tracking and resumption behavior

## Example Output

**Message-history file with token usage:**

```json
{
  "project": "acai-ts",
  "sessionId": "01ac3376-75d4-4a2d-8090-4a3af90bf411",
  "modelId": "gpt-4",
  "title": "Code Review Session",
  "createdAt": "2026-01-17T16:42:09.038Z",
  "updatedAt": "2026-01-17T17:15:22.123Z",
  "messages": [...],
  "tokenUsage": [
    {
      "stepIndex": 0,
      "inputTokens": 5200,
      "outputTokens": 890,
      "totalTokens": 6090,
      "cachedInputTokens": 1200,
      "reasoningTokens": 340,
      "inputTokenDetails": {
        "noCacheTokens": 4000,
        "cacheReadTokens": 1200,
        "cacheWriteTokens": 150
      },
      "outputTokenDetails": {
        "textTokens": 550,
        "reasoningTokens": 340
      },
      "timestamp": 1737123729000,
      "estimatedCost": 0.082
    },
    {
      "stepIndex": 1,
      "inputTokens": 8900,
      "outputTokens": 2100,
      "totalTokens": 11000,
      "cachedInputTokens": 3500,
      "reasoningTokens": 890,
      "inputTokenDetails": {
        "noCacheTokens": 5400,
        "cacheReadTokens": 3500,
        "cacheWriteTokens": 420
      },
      "outputTokenDetails": {
        "textTokens": 1210,
        "reasoningTokens": 890
      },
      "timestamp": 1737124035000,
      "estimatedCost": 0.185
    }
  ]
}
```

**Derived Values:**

- Total Usage: `5200 + 890 = 6090` + `8900 + 2100 = 11000` = **16,900 tokens**
- Last Turn Context Window: **11,000 tokens** (from stepIndex 1)
- Total Cost: `$0.082 + $0.185 = $0.267`
