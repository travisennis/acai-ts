# Plan: Add --no-session Flag to CLI

## Overview

Add a `--no-session` flag to the acai CLI that prevents saving session data to `~/.acai/sessions`. This is useful for one-off commands where session history is not desired.

## Research Summary

From `research.md`:
- **CLI argument parsing**: `source/index.ts` uses `parseArgs` from `node:util` (lines 86-115)
- **SessionManager**: `source/sessions/manager.ts` - handles session persistence with `save()` method
- **Session saves occur at**:
  - `source/cli/index.ts:103` - after CLI execution
  - `source/cli/index.ts:131` - on interrupt
  - `source/index.ts:493` - on REPL interrupt
  - `source/index.ts:543` - after REPL turn completion
  - `source/index.ts:566` - after REPL turn completion

## Implementation Phases

### Phase 1: Add CLI Flag Definition

**File**: `source/index.ts`

**Changes**:
1. Add `"no-session": { type: "boolean", default: false }` to parseArgs options (around line 97)
2. Add `--no-session` to help text (around line 75)

**Success Criteria**:
- [x] `npm run typecheck` passes
- [x] `--help` shows the new flag
- [x] Flag is accessible via `flags["no-session"]`

### Phase 2: Pass Flag Through Application State

**File**: `source/index.ts`

**Changes**:
1. Update `Flags` type export to include `noSession?: boolean`
2. Add `noSession: boolean` to application state (around where sessionManager is initialized)
3. Pass `noSession` flag to CLI handler and REPL

**Success Criteria**:
- [x] Typecheck passes
- [x] Flag propagates through the application

### Phase 3: Modify SessionManager to Support No-Save Mode

**File**: `source/sessions/manager.ts`

**Approach**: Add a `shouldSave` property to SessionManager that can be toggled. When false, `save()` returns early without writing to disk.

**Changes**:
1. Add `shouldSave: boolean` property to SessionManager class
2. Add `setShouldSave(shouldSave: boolean)` method or update constructor
3. Modify `save()` method to check `shouldSave` and return early if false

**Implementation Details**:
```typescript
// In SessionManager class
private shouldSave = true;

setShouldSave(shouldSave: boolean) {
  this.shouldSave = shouldSave;
}

async save() {
  if (!this.shouldSave) {
    return; // Skip saving
  }
  // ... existing save logic
}
```

**Success Criteria**:
- `npm run typecheck` passes
- Unit tests for SessionManager still pass
- Manual test: verify no session file is created when flag is used

### Phase 4: Wire Up Flag in CLI Handler

**Files**: `source/cli/index.ts`, `source/index.ts`

**Changes**:
1. Pass `noSession` flag when creating `Cli` instance
2. Update `CliOptions` interface to include `noSession`
3. In `Cli.run()`, call `sessionManager.setShouldSave(false)` when flag is set

**Alternative Approach**:
Instead of modifying SessionManager, conditionally skip the save call:
```typescript
// In source/cli/index.ts
if (!this.options.noSession) {
  await sessionManager.save();
}
```

**Decision**: The alternative approach is simpler and less invasive. Use conditional save calls instead of modifying SessionManager.

**Success Criteria**:
- [x] `npm run typecheck` passes
- [x] Manual test: `acai -p "hello" --no-session` creates no session file in `~/.acai/sessions`

### Phase 5: Wire Up Flag in REPL and Interrupt Handlers

**File**: `source/index.ts`

**Changes**:
1. Pass `noSession` flag to REPL initialization
2. Modify all `await state.sessionManager.save()` calls to be conditional:
   ```typescript
   if (!state.noSession) {
     await state.sessionManager.save();
   }
   ```

**Locations to modify**:
- Line 493: interrupt callback save
- Line 543: after REPL turn
- Line 566: after REPL turn (continue/resume mode)

**Success Criteria**:
- [x] `npm run typecheck` passes
- [x] Manual test: REPL with `--no-session` flag does not save sessions

## Testing Plan

### Automated Tests
- Add test in `test/session.test.ts` (create if doesn't exist) for no-session flag behavior
- Verify existing tests still pass: `npm test`

### Manual Tests
1. **CLI mode**: `acai -p "hello world" --no-session` → verify no file in `~/.acai/sessions`
2. **CLI mode with session**: `acai -p "hello world"` → verify session file is created
3. **REPL mode**: `acai --no-session` → type a message → verify no session file
4. **REPL mode with session**: `acai` → type a message → verify session file created
5. **Interrupt test**: `acai --no-session` → Ctrl+C → verify no session file

## Success Criteria

### Automated Verification
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run format` passes
- [x] `npm test` passes

### Manual Verification
- [ ] `--help` shows `--no-session` flag
- [ ] CLI mode with `--no-session` does not create session file
- [ ] REPL mode with `--no-session` does not create session file
- [ ] Normal mode (without flag) still creates session files
- [ ] Interrupt handling works correctly with `--no-session`

## Out of Scope

- Persisting `--no-session` preference in config files
- Session loading when `--no-session` is used (should still work normally - the flag only affects saving)
- Changing session file naming or location
