# Hooks System Implementation

## Research Question

How should hooks be implemented for agent events in acai-ts? Hooks are spawned processes that communicate over stdio using JSON (similar to dynamic tools). They run before or after defined stages and can observe, block, or modify behavior. First implementation will support agent events.

## Overview

This research analyzes the codebase to identify all areas that need modification to implement a hooks system for agent events. The hooks system will allow users to register external processes that can observe, block, or modify agent behavior at specific event points during the agent loop execution.

## Key Findings

### 1. Agent Event System

**Description**: The agent loop uses an async generator to yield events at key points during execution. Events are consumed by the REPL for display and can be intercepted by hooks.

**Evidence**:
- `source/agent/index.ts:157` - Async generator `run()` yields AgentEvent types
- `source/agent/index.ts:189-548` - Event yield points throughout agent loop
- `source/repl.ts:281` - Events consumed by REPL for display

**Implications**: The event system is already in place and well-structured. Hooks can be integrated by intercepting events before they are yielded to the consumer.

### 2. Dynamic Tool Pattern

**Description**: The existing dynamic tool loader provides a proven pattern for spawning child processes with stdio communication.

**Evidence**:
- `source/tools/dynamic-tool-loader.ts` - Complete stdio communication pattern
- Lines 81-132: `getMetadata()` spawns process for description
- Lines 137-219: `spawnChildProcess()` spawns process for execution
- Uses `TOOL_ACTION` environment variable for mode selection
- JSON communication over stdin/stdout with 30-second timeout

**Implications**: This pattern can be adapted for hooks with minimal changes. The hook loader will follow the same spawn → write stdin → read stdout → close pattern.

### 3. Configuration System

**Description**: The configuration system uses zod schemas and a ConfigManager for reading/writing settings.

**Evidence**:
- `source/config.ts` - ProjectConfigSchema with zod validation
- ConfigManager class for configuration access
- DirectoryProvider for managing project and app directories

**Implications**: Hooks configuration should be added to ProjectConfigSchema following the existing pattern for tools, skills, etc.

### 4. Middleware Pattern

**Description**: The codebase has a middleware system for wrapping language model operations.

**Evidence**:
- `source/middleware/index.ts` - Exports cacheMiddleware, rateLimitMiddleware, auditMessage
- `source/middleware/cache.ts` - Example of LanguageModelV3Middleware implementation
- Uses `wrapGenerate` and `wrapStream` hooks

**Implications**: While middleware is for language models, the pattern of wrapping execution can inform hook implementation. However, hooks will be more direct event interception rather than wrapping.

## Architecture & Design Patterns

### Pattern 1: Async Generator Event Streaming

**Description**: The agent uses an async generator to yield events, allowing consumers to iterate over events as they occur.

**Example**: `source/agent/index.ts:157` - `async *run(args: RunOptions): AsyncGenerator<AgentEvent>`

**When Used**: This pattern is ideal for hooks because it allows hooks to intercept events before they reach the consumer (REPL).

### Pattern 2: Child Process Spawning with stdio

**Description**: Spawning child processes with JSON communication over stdin/stdout.

**Example**: `source/tools/dynamic-tool-loader.ts:137-219` - `spawnChildProcess()` function

**When Used**: This pattern will be used for hook execution, allowing hooks to receive event data and respond with actions.

### Pattern 3: Schema Validation with zod

**Description**: Using zod schemas for type-safe configuration and metadata validation.

**Example**: `source/config.ts:13-72` - ProjectConfigSchema definition

**When Used**: Hook metadata and configuration should use zod schemas for validation.

## Data Flow

1. **Agent Loop Starts** (`source/agent/index.ts:192`)
   - Agent.run() is called with system prompt, input, tools, etc.
   - Agent initializes state and begins loop

2. **Event Generation** (`source/agent/index.ts:264-543`)
   - For each iteration, agent yields events:
     - `agent-start` (line 189)
     - `step-start` (line 207)
     - `tool-call-start` (line 305)
     - `tool-call-end` (line 374)
     - `agent-stop` (line 476)

3. **Hook Interception** (NEW - to be implemented)
   - Before yielding event, check for registered hooks
   - Execute hooks with timing matching event (before/after)
   - Pass event data to hook via stdin as JSON
   - Read hook response from stdout as JSON
   - Handle hook response (continue/block/modify)

4. **Event Consumption** (`source/repl.ts:281`)
   - REPL receives events and updates UI
   - Hooks have already processed/modified events

5. **Hook Execution Flow** (NEW - to be implemented)
   - Load hooks from `.acai/hooks` directory at startup
   - For each event, execute matching hooks
   - Handle timeout (30 seconds default)
   - Handle errors gracefully
   - Support abort signal propagation

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| Agent Event System | `source/agent/index.ts` | Generates events during agent loop execution |
| Dynamic Tool Pattern | `source/tools/dynamic-tool-loader.ts` | Provides stdio communication pattern to adapt |
| Configuration System | `source/config.ts` | Manages project and app configuration |
| REPL | `source/repl.ts` | Consumes and displays events |
| **Hook Loader** | **NEW: `source/hooks/loader.ts`** | Load and execute hook scripts |
| **Hook Executor** | **NEW: `source/hooks/executor.ts`** | Execute hooks and handle responses |
| **Hook Types** | **NEW: `source/hooks/types.ts`** | Type definitions for hooks |

### Configuration

- **Config files**: `source/config.ts` - ProjectConfigSchema
- **Environment variables**: None specific to hooks (will use process environment)
- **Flags**: None (hooks configured via config file)

### New Files Needed

| File | Purpose |
|------|---------|
| `source/hooks/loader.ts` | Load hook scripts from `.acai/hooks` directory |
| `source/hooks/executor.ts` | Execute hooks and handle responses |
| `source/hooks/types.ts` | Type definitions for hooks |
| `test/hooks/loader.test.ts` | Tests for hook loader |
| `test/hooks/executor.test.ts` | Tests for hook executor |
| `test/hooks/integration.test.ts` | Integration tests for hooks in agent loop |

## Integration Points

### Dependencies

- **Agent Loop**: Hooks will intercept events before they are yielded
- **Configuration**: Hooks configuration added to ProjectConfigSchema
- **Dynamic Tool Pattern**: Adapted stdio communication pattern
- **DirectoryProvider**: Add hooks directory management

### Consumers

- **Agent Loop**: Will call hook executor before yielding events
- **REPL**: Will receive potentially modified events from hooks
- **Configuration**: Will read hooks settings

### External Systems

- **Hook Scripts**: External processes in `.acai/hooks` directory
- **File System**: Loading hook scripts from disk
- **Process Management**: Spawning and managing hook processes

## Edge Cases & Error Handling

### Edge Cases

- **Hook Timeout**: Hook doesn't respond within timeout (default 30 seconds)
  - **Handling**: Kill process, log warning, continue with original event
- **Hook Error**: Hook exits with non-zero code
  - **Handling**: Log error, continue with original event
- **Hook Returns Invalid JSON**: Hook returns malformed JSON response
  - **Handling**: Parse error, log warning, continue with original event
- **Hook Returns Invalid Action**: Hook returns unsupported action
  - **Handling**: Log warning, treat as "continue"
- **Multiple Hooks for Same Event**: Multiple hooks registered for same event
  - **Handling**: Execute in order, stop if any hook blocks
- **Hook Blocks Event**: Hook returns "block" action
  - **Handling**: Stop execution, yield agent-error event
- **Hook Modifies Event**: Hook returns "modify" action with modifications
  - **Handling**: Apply modifications, yield modified event
- **Abort Signal During Hook Execution**: User aborts during hook execution
  - **Handling**: Kill hook process, propagate abort signal

### Error Handling

- **Hook Not Found**: Hook script doesn't exist
  - **Handling**: Log warning, skip hook
- **Hook Metadata Invalid**: Hook returns invalid metadata
  - **Handling**: Log warning, skip hook
- **Hook Directory Missing**: `.acai/hooks` directory doesn't exist
  - **Handling**: Create directory or skip gracefully
- **Hook Process Spawn Fails**: Cannot spawn hook process
  - **Handling**: Log error, skip hook
- **Hook Exceeds Max Hooks**: Too many hooks registered
  - **Handling**: Log warning, load only first N hooks

## Known Limitations

- **First Implementation**: Only supports agent events, not tool events or other events
- **Blocking Hooks**: Can block agent execution, potentially causing hangs
- **Hook Order**: Hooks execute in undefined order (file system order)
- **Hook Communication**: Limited to JSON over stdin/stdout
- **Hook Timeout**: Fixed timeout for all hooks (30 seconds)
- **Hook State**: Hooks are stateless, no persistence between executions

## Testing Coverage

### Existing Tests

- None specific to hooks (feature doesn't exist yet)

### Test Gaps

- **Unit Tests**: Hook loader, hook executor, hook types
- **Integration Tests**: Hooks in agent loop, multiple hooks, timeout handling
- **Error Handling Tests**: Hook errors, invalid responses, timeouts
- **Performance Tests**: Hook execution overhead

## Recommendations for Planning

Based on this research, when planning the hooks system implementation:

1. **Follow Dynamic Tool Pattern**: Adapt `source/tools/dynamic-tool-loader.ts` for hook loading and execution
2. **Add Configuration**: Extend `ProjectConfigSchema` with hooks section
3. **Intercept Events**: Modify `source/agent/index.ts` to call hook executor before yielding events
4. **Handle Errors Gracefully**: Hooks should never crash the agent, always fallback to original behavior
5. **Test Thoroughly**: Create comprehensive tests for all edge cases and error conditions
6. **Start Simple**: First implementation should support only agent events with observe/block/modify actions
7. **Document Protocol**: Clearly document hook communication protocol for users
8. **Consider Performance**: Hook execution adds overhead, keep it minimal
9. **Support Abort Signals**: Ensure hooks can be aborted cleanly
10. **Log Everything**: Detailed logging for debugging hook issues

## References

- Original ticket: `.tickets/at-48ff.md`
- Source files:
  - `source/agent/index.ts` - Agent loop and event system
  - `source/tools/dynamic-tool-loader.ts` - stdio communication pattern
  - `source/config.ts` - Configuration system
  - `source/middleware/` - Middleware pattern examples
  - `source/repl.ts` - Event consumer