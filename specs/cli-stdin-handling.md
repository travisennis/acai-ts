# Task: Add Piped Input Support for acai CLI

## Overview

Implement support for piped input to acai, allowing users to pipe text to acai via stdin. This enables two primary usage patterns:

1. **REPL mode with initial prompt**: `echo "what can you do?" | acai`
2. **CLI mode with context**: `echo "context info" | acai -p "main prompt"`

## Requirements

### Functional Requirements

1. **REPL Mode with Piped Input**
   - When stdin has content and no `-p` flag is provided, use the piped text as the initial prompt
   - Immediately process the piped prompt upon REPL initialization (no editing in editor)
   - Display the result in the REPL interface as if the user had typed and submitted it

2. **CLI Mode with Context**
   - When both stdin has content AND `-p` flag is provided:
     - Piped text is added as **context** (additional user message sent to LLM)
     - `-p` value becomes the **main user prompt**
     - Execute in CLI mode (single-shot, non-interactive)

3. **Empty Input Handling**
   - If stdin is piped (`!process.stdin.isTTY`) but content is empty/whitespace-only AND no `-p` is provided:
     - Display user-friendly message to stderr: "No input provided via stdin."
     - Exit with code 0 (graceful, not an error)
   - If stdin is piped but empty AND `-p` IS provided:
     - Proceed normally with just the `-p` prompt (no context added)

4. **Input Size Limits**
   - **Soft limit (warning)**: 50KB - log warning to stderr but continue processing
   - **Hard limit (error)**: 200KB - display error message and exit with code 1
   - Include limit information in the warning/error messages

### Technical Requirements

5. **Stdin Detection**
   - Detect stdin is being piped (not TTY) before reading
   - Read stdin content asynchronously using `text(process.stdin)` from `node:stream/consumers`

6. **Prompt Manager Integration**
   - For REPL mode: Use `promptManager.set(pipedText)` to set the initial prompt
   - For CLI mode: Use `promptManager.addContext(contextItem)` to add piped text as context
   - **Important**: `PromptManager.addContext()` expects a `ContextItem` (which is `UserMessageContentItem`), not a raw string. Wrap stdin content as: `{ type: "text", text: stdinContent }`

7. **REPL Auto-Processing Flow**
   - The REPL interactive loop lives in `runReplMode()` in `source/index.ts`, not inside `NewRepl`
   - Modify `runReplMode()` to check `promptManager.isPending()` before the first `getUserInput()` call
   - If pending prompt exists:
     - Skip the first `getUserInput()` call
     - Immediately run the agent with the pending prompt
     - After processing, continue to normal interactive loop
   - Alternative: Add a method to `NewRepl` like `processPendingPrompt()` that can be called before entering the loop

8. **Error Handling**
   - Gracefully handle stdin read errors (log and continue, or exit gracefully)
   - Validate input size before processing
   - Ensure stdin reading doesn't block when no input is provided (already handled by `!process.stdin.isTTY` check)

## Implementation Details

### Files to Modify

1. **`source/index.ts`**
   - Add new function `readStdinWithLimits()` (see below)
   - Update `determineInitialPrompt()` function to:
     - Call `readStdinWithLimits()` to get stdin content with validation
     - Track stdin content separately from `-p` prompt
     - Handle empty stdin case (exit gracefully if no `-p`)
     - Return both values for different handling in initialization
   - Update `initializeAppState()` to:
     - For CLI mode (has `-p`): wrap stdin as `{ type: "text", text: stdinContent }` and call `promptManager.addContext()`
     - For REPL mode (no `-p`): call `promptManager.set(stdinContent)` to set as main prompt
   - Update `runReplMode()` to:
     - Check `promptManager.isPending()` before entering the interactive loop
     - If pending, process immediately without waiting for user input
     - Then continue to normal loop

2. **`source/repl-new.ts`**
   - No changes required if we handle auto-processing in `runReplMode()`
   - Alternatively, add `processPendingPrompt(): Promise<void>` method if we want encapsulation

### New Functions

```typescript
// Constants
const STDIN_SOFT_LIMIT = 50 * 1024;  // 50KB
const STDIN_HARD_LIMIT = 200 * 1024; // 200KB

interface StdinResult {
  content: string | null;
  sizeBytes: number;
  wasPiped: boolean;
}

async function readStdinWithLimits(): Promise<StdinResult> {
  // Not piped - return early
  if (process.stdin.isTTY) {
    return { content: null, sizeBytes: 0, wasPiped: false };
  }

  try {
    const content = await text(process.stdin);
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    // Hard limit - exit with error
    if (sizeBytes > STDIN_HARD_LIMIT) {
      const sizeKB = Math.round(sizeBytes / 1024);
      console.error(`Error: Input exceeds ${STDIN_HARD_LIMIT / 1024}KB size limit (${sizeKB}KB provided).`);
      process.exit(1);
    }

    // Soft limit - warn but continue
    if (sizeBytes > STDIN_SOFT_LIMIT) {
      const sizeKB = Math.round(sizeBytes / 1024);
      console.error(`Warning: Input is ${sizeKB}KB. Large inputs may increase latency and costs.`);
    }

    return { content, sizeBytes, wasPiped: true };
  } catch (error) {
    console.error(`Error reading stdin: ${(error as Error).message}`);
    return { content: null, sizeBytes: 0, wasPiped: true };
  }
}
```

### Updated `determineInitialPrompt()` Logic

```typescript
async function determineInitialPrompt(): Promise<{
  initialPromptInput: string | undefined;  // The -p prompt (triggers CLI mode)
  stdinContent: string | null;             // Piped content (context or REPL prompt)
  hasContinueOrResume: boolean;
  resumeSessionId: string | undefined;
}> {
  const hasContinueOrResume = flags.continue === true || flags.resume === true;
  
  // Read stdin with limits
  const { content: stdinContent, wasPiped } = await readStdinWithLimits();
  
  // Handle empty piped input without -p flag
  if (wasPiped && (!stdinContent || stdinContent.trim().length === 0) && !flags.prompt) {
    console.error("No input provided via stdin.");
    process.exit(0);
  }

  // ... rest of existing logic for initialPromptInput ...
}
```

### Updated `initializeAppState()` Context Handling

```typescript
// In initializeAppState(), replace the current stdin handling:

// Current (broken - passes string to addContext):
// if (stdInPrompt) {
//   promptManager.addContext(stdInPrompt);
// }

// New:
if (stdinContent && stdinContent.trim().length > 0) {
  if (isDefined(initialPromptInput)) {
    // CLI mode: stdin is context
    promptManager.addContext({ type: "text", text: stdinContent });
  } else {
    // REPL mode: stdin is the prompt
    promptManager.set(stdinContent);
  }
}
```

### Updated `runReplMode()` Auto-Processing

```typescript
async function runReplMode(state: AppState): Promise<void> {
  // ... existing setup code ...

  // Auto-process pending prompt from stdin
  if (state.promptManager.isPending()) {
    const projectConfig = await config.getConfig();
    const activeTools = projectConfig.tools.activeTools as CompleteToolNames[] | undefined;
    const skillsEnabled = !flags["no-skills"] && (projectConfig.skills?.enabled ?? true);

    const results = agent.run({
      systemPrompt: await systemPrompt({ activeTools, allowedDirs: workspace.allowedDirs, skillsEnabled }),
      input: state.promptManager.getUserMessage(),
      tools,
      activeTools,
      abortSignal: agent.abortSignal,
    });
    
    for await (const result of results) {
      await repl.handle(result, agent.state);
    }
    
    await state.sessionManager.save();
  }

  // Normal interactive loop
  while (true) {
    const userInput = await repl.getUserInput();
    // ... rest of loop ...
  }
}

### Example Behaviors

**Example 1: Piped input to REPL**
```bash
$ echo "what can you do for me?" | acai
# acai starts REPL, immediately processes "what can you do for me?"
# Displays AI response, then enters interactive mode
```

**Example 2: Piped input with -p flag**
```bash
$ echo "User's codebase has 50 files" | acai -p "summarize this project"
# acai runs in CLI mode
# Context: "User's codebase has 50 files"
# Prompt: "summarize this project"
# Outputs summary and exits
```

**Example 3: Empty input**
```bash
$ echo -n "" | acai
No input provided via stdin.
# Exits with code 0
```

**Example 4: Oversized input**
```bash
$ cat huge-file.txt | acai -p "analyze this"
Error: Input exceeds 200KB size limit (250KB provided).
# Exits with code 1
```

**Example 5: Large but acceptable input (soft limit)**
```bash
$ cat large-file.txt | acai -p "analyze this"
Warning: Input is 75KB. Large inputs may increase latency and costs.
[Processing continues...]
```

**Example 6: Empty stdin with -p flag (valid)**
```bash
$ echo -n "" | acai -p "what can you do?"
# Proceeds normally in CLI mode with just the -p prompt
# No context added, no error
```

**Example 7: No piping at all (normal usage)**
```bash
$ acai
# Normal REPL mode, waits for user input
$ acai -p "hello"
# Normal CLI mode with prompt
```

## Testing Requirements

### Unit Tests for `readStdinWithLimits()`

Create `test/stdin-handling.test.ts`:

```typescript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("readStdinWithLimits", () => {
  it("returns wasPiped=false when stdin is TTY", async () => {
    // Mock process.stdin.isTTY = true
    const result = await readStdinWithLimits();
    assert.equal(result.wasPiped, false);
    assert.equal(result.content, null);
  });

  it("returns content when stdin has valid data", async () => {
    // Mock piped input with "hello world"
    const result = await readStdinWithLimits();
    assert.equal(result.wasPiped, true);
    assert.equal(result.content, "hello world");
  });

  it("exits with code 1 when input exceeds hard limit", async () => {
    // Mock 250KB input, verify process.exit(1) called
  });

  it("logs warning but continues when input exceeds soft limit", async () => {
    // Mock 75KB input, verify console.error called with warning
    // Verify content is still returned
  });

  it("handles empty piped input", async () => {
    // Mock empty string from stdin
    const result = await readStdinWithLimits();
    assert.equal(result.wasPiped, true);
    assert.equal(result.content, "");
  });

  it("handles stdin read errors gracefully", async () => {
    // Mock text() throwing an error
    const result = await readStdinWithLimits();
    assert.equal(result.content, null);
  });
});
```

### Integration Tests

These require spawning the actual CLI process:

```typescript
import { spawn } from "node:child_process";

describe("CLI stdin integration", () => {
  it("processes piped input in REPL mode", async () => {
    // Spawn: echo "test" | acai
    // Verify output contains agent response
  });

  it("adds piped input as context with -p flag", async () => {
    // Spawn: echo "context" | acai -p "prompt"
    // Verify both context and prompt are used
  });

  it("exits gracefully with empty piped input", async () => {
    // Spawn: echo -n "" | acai
    // Verify stderr contains "No input provided"
    // Verify exit code is 0
  });

  it("exits with error for oversized input", async () => {
    // Generate 250KB string, pipe to acai
    // Verify exit code is 1
    // Verify stderr contains size limit message
  });
});
```

### Edge Cases to Test

1. **Whitespace-only input**: `echo "   " | acai` → should exit with "No input provided"
2. **Binary input**: Pipe binary data → should handle without crashing (may warn)
3. **Very long single line**: 100KB on one line → should work within limits
4. **Input with null bytes**: Should handle gracefully
5. **Simultaneous stdin and positional arg**: `echo "ctx" | acai "positional"` → define expected behavior

## Success Criteria

- [ ] `echo "prompt" | acai` enters REPL, processes immediately, then becomes interactive
- [ ] `echo "context" | acai -p "prompt"` runs in CLI mode with context
- [ ] Empty piped input without `-p` prints message and exits 0
- [ ] Empty piped input with `-p` proceeds normally (no context)
- [ ] Inputs > 200KB exit with code 1 and error message
- [ ] Inputs > 50KB but < 200KB log warning and continue
- [ ] Normal non-piped usage is unaffected
- [ ] All existing tests pass
- [ ] New unit tests for `readStdinWithLimits()` pass
- [ ] TypeScript compiles without errors (no type mismatches in addContext)

## Open Questions

1. **Positional args with stdin**: What happens with `echo "ctx" | acai "positional"`? Currently positional can become the prompt if no `-p`. Should stdin take precedence, or should we error?
   - **Recommendation**: Error with "Cannot use both stdin and positional arguments"

2. **Stdin with --continue/--resume**: Should piped input work with session resume?
   - **Recommendation**: Error with "Cannot pipe input when resuming a session"

3. **Timeout for stdin read**: Should we add a timeout in case stdin hangs?
   - **Recommendation**: Not needed; `!process.stdin.isTTY` check prevents blocking

## Estimated Complexity

**Medium** - Requires:
- Understanding `determineInitialPrompt()` and `initializeAppState()` flow
- Correctly typing context items for `PromptManager`
- Modifying `runReplMode()` for auto-processing
- Comprehensive test coverage including process spawning
