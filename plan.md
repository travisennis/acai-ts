# Shell Command UX Improvements Plan

## Task Overview

Improve the `/shell` (and `/sh`) command in the acai-ts REPL tool to address two UX issues:

1. **Visual Spacing**: Add empty lines before command output for better readability
2. **Progress Feedback**: Show a loading indicator while commands execute

## Current State

**File Location**: `source/commands/shell/index.ts`

The shell command currently:
- Executes commands via `ExecutionEnvironment.executeCommand()` which returns a Promise with complete output
- Immediately displays output with no visual separation from prior UI elements
- Provides no feedback during command execution (up to 1.5 min timeout)

**Available Components**:
- `Loader` (`source/tui/components/loader.ts`): Spinning animation with `topPadding` option, requires `start()`/`stop()`
- `Spacer` (`source/tui/components/spacer.ts`): Renders empty lines via `new Spacer(1)`
- `Text`: Basic text display with row/col positioning

## Requirements

### Requirement 1: Visual Spacing

Add empty lines **before the exit code line** and **before the output** to prevent content from appearing cramped.

**Implementation**: Use `new Spacer(1)` components before each text element.

### Requirement 2: Loading Indicator

Display a `Loader` component while commands execute.

**Implementation**:
1. Create `Loader` with message like `"Running: <command>..."` (truncate long commands)
2. Add to container and call `tui.requestRender()` before `executeCommand()`
3. Stop loader with `loader.stop()` when command completes
4. Remove loader from container before displaying results

## Acceptance Criteria

1. **Loader displays during execution**: Spinning animation with truncated command name is visible
2. **Loader cleanup**: Stops and removes when command completes (success or error)
3. **Empty line before exit code**: Visual separation between prior content and exit info
4. **Empty line before output**: Visual separation between exit info and command output
5. **Context selector preserved**: "Add to context?" Yes/No selection functions correctly after output
6. **No regressions**: Timeout handling, error display, and exit codes remain intact

## Implementation Pattern

```typescript
// 1. Show loader before execution
const loader = new Loader(
  tui, 
  `Running: ${commandStr.substring(0, 50)}${commandStr.length > 50 ? '...' : ''}`
);
container.addChild(loader);
tui.requestRender();

// 2. Execute command
const { output, exitCode, duration } = await execEnv.executeCommand(...);

// 3. Cleanup loader
loader.stop();
container.removeChild(loader);

// 4. Display results with spacing
container.addChild(new Spacer(1));  // Empty line before exit code
container.addChild(
  new Text(style.gray(`Exit code: ${exitCode}, Duration: ${duration}ms`), 1, 0)
);
container.addChild(new Spacer(1));  // Empty line before output
container.addChild(new Text(output, 2, 0));
// ... context selector continues as before
```

## Testing Checklist

- [x] Fast command (`echo hello`) shows loader briefly, then spaced output
- [x] Slow command (`sleep 3 && echo done`) displays loader for duration
- [x] Empty line appears before exit code line
- [x] Empty line appears before command output
- [x] Failed commands (non-zero exit) show proper spacing
- [x] Context selection (Yes/No) works after viewing output
- [x] Multiple consecutive shell commands maintain proper spacing
- [x] Long commands (>50 chars) are truncated in loader message
