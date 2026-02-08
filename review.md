# Abort Handler Memory Leak Prevention - Code Review

## Overview

Review of changes made to the `source/` directory intended to prevent memory leaks with abort methods.

## Files Changed

- `source/agent/sub-agent.ts`
- `source/cli.ts`
- `source/execution/index.ts`
- `source/prompts.ts`
- `source/terminal/select-prompt.ts`
- `source/tools/agent.ts`
- `source/tools/web-fetch.ts`
- `source/tools/web-search.ts`

## Summary

The changes are **partially effective** but introduce new issues and don't fully address the underlying problem.

## Issues Found

### 1. `web-fetch.ts` - New Leak Introduced (Critical)

`cleanup()` is never called on the success path, leaving dangling timers and abort listeners attached to long-lived parent signals. This is a **regression** that introduces the exact type of leak the changes were meant to prevent.

**Fix**: Wrap the fetch logic in a `try/finally` block to ensure `cleanup()` always runs:

```ts
while (redirectCount <= MAX_REDIRECTS) {
  const { signal, cleanup } = createTimeoutSignal(timeout, abortSignal);

  try {
    const response = await fetch(currentUrl, { signal, redirect: "manual" });
    // ... handle response ...
  } finally {
    cleanup();
  }
}
```

### 2. `sub-agent.ts` - Timer Not Cleared

The `setTimeout` for timeout abort is never cleared when the operation completes normally. Even if not a "forever leak", it causes unnecessary retention until the timer fires.

**Fix**: Store the timeout ID and clear it in a `finally` block after `generateText` resolves/rejects.

### 3. WeakRef Pattern is Mostly Moot

In `createBackgroundAbortHandler`, the `setupProcessCleanup()` function elsewhere already strongly references `ExecutionEnvironment`, so the WeakRef doesn't provide the intended benefit. The GC cannot collect the object anyway.

### 4. Factory Functions Don't Prevent Leaks By Themselves

The factory functions (`createAbortHandler`, `createBackgroundAbortHandler`, etc.) still return closures that strongly reference whatever is passed into them:

```ts
function createAbortHandler(ctrl) { return () => ctrl.abort(...) }
```

This still retains `ctrl` as long as the event listener exists. Factories reduce accidental capture of large lexical environments, but **leaks are prevented by deterministic cleanup** (removing listeners, clearing timers), not by where the function is defined.

### 5. Potential Double-Settlement Race Condition

In `executeCommand`, if abort races with normal completion, `settle` could be called twice. The `settle` function should be idempotent to handle this race condition safely.

**Fix**: Ensure `settleFn` has an internal `settled` boolean or equivalent guard.

### 6. `select-prompt.ts` - Exit Handler Accumulation

`process.on("exit", exitHandler)` is added per prompt invocation and never removed. If `select()` is called multiple times, handlers accumulate.

**Fix**: Use `process.once("exit", ...)` or remove the handler in `cleanup()`.

## What Works

- Using `{ once: true }` on abort listeners is correct
- The `.bind()` and factory patterns are reasonable hygiene improvements
- Storing handler references (`const cb = ...`) enables proper cleanup
- The general direction of minimizing closure scope is sound

## Recommendations

### Immediate Fixes Required

1. Add `finally` blocks to ensure `cleanup()` always runs in `web-fetch.ts` and `web-search.ts`
2. Clear the timeout in `sub-agent.ts` after `generateText` resolves
3. Ensure `settle` function is idempotent to handle race conditions
4. Fix exit handler accumulation in `select-prompt.ts`

### Consider Adding Helper Utilities

If cleanup is frequently forgotten, consider adding internal helpers that enforce the pattern:

```ts
async function withAbortListener<T>(
  parentSignal: AbortSignal | undefined,
  handler: () => void,
  fn: () => Promise<T>
): Promise<T> {
  if (parentSignal) {
    parentSignal.addEventListener("abort", handler, { once: true });
  }
  try {
    return await fn();
  } finally {
    if (parentSignal) {
      parentSignal.removeEventListener("abort", handler);
    }
  }
}
```

This makes "forgetting cleanup on success path" much harder.

## Conclusion

The changes show good intent but the actual leak prevention hinges on **deterministic cleanup**, not on where functions are defined. The `web-fetch.ts` success path missing `cleanup()` is the most critical issue and should be fixed immediately.
