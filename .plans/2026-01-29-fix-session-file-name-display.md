# Fix Session File Name Display Discrepancy

## Overview

Fix the `/session` command to display the correct session file name that matches the actual file saved on disk. The root cause is that the session command constructs the filename independently rather than getting it from the session manager.

**Root Cause**: The session command (`source/commands/session/index.ts:97`) constructs the filename locally using a timestamp prefix, while the session manager (`source/sessions/manager.ts:309`) uses a different format. This violates the DRY principle and creates a maintenance hazard.

**Solution**: Add a `getSessionFileName()` method to SessionManager as the single source of truth, then have both the save logic and display logic use this method.

## Current State Analysis

### The Bug
- **Display logic** (`source/commands/session/index.ts:97`): Constructs `session-2025-01-29T12-34-56-{sessionId}.json`
- **Save logic** (`source/sessions/manager.ts:309`): Actually saves as `session-{sessionId}.json`
- **Impact**: Users cannot locate their session files using the displayed name

### Key Files
- `source/commands/session/index.ts:97` - Display logic that needs to change
- `source/sessions/manager.ts:309` - Save logic that should use new method
- `source/sessions/manager.ts` - Where to add `getSessionFileName()` method

## Desired End State

After this fix:
1. SessionManager has a `getSessionFileName()` method that returns the correct filename
2. The `save()` method uses `getSessionFileName()` (DRY principle)
3. The `/session` command calls `sessionManager.getSessionFileName()` instead of constructing it locally
4. Users can reliably locate their session files using the displayed name
5. Future changes to naming convention only require updating one method

### Verification:
- Run `/session` command and note the "Session File" value
- Verify that file exists at `~/.acai/sessions/{displayed-name}`
- Check that `save()` method calls `getSessionFileName()`

## What We're NOT Doing

- Not changing the actual file save format (to maintain backward compatibility)
- Not adding timestamps to saved files
- Not modifying the file loading logic
- Not changing session file location

## Implementation Approach

Add a single source of truth method and update both consumers to use it.

## Phase 1: Add getSessionFileName() Method to SessionManager

### Overview
Add a new getter method to SessionManager that returns the session filename, making it the single source of truth.

### Changes Required:

#### 1. Add getSessionFileName() Method
**File**: `source/sessions/manager.ts`

Add after the existing getter methods (around line 480, after `getUpdatedAt()`):

```typescript
getSessionFileName(): string {
  return `session-${this.sessionId}.json`;
}
```

**Reasoning**: This creates a single source of truth for the session filename format. Both the save logic and display logic will use this method.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] Method exists on SessionManager class
- [x] Method returns correct format: `session-{uuid}.json`

---

## Phase 2: Update save() to Use getSessionFileName()

### Overview
Refactor the `save()` method to use the new `getSessionFileName()` method instead of constructing the filename inline.

### Changes Required:

#### 1. Update save() Method
**File**: `source/sessions/manager.ts:309`

**Current**:
```typescript
const fileName = `session-${this.sessionId}.json`;
```

**Fixed**:
```typescript
const fileName = this.getSessionFileName();
```

**Reasoning**: DRY principle - use the single source of truth method instead of duplicating the filename construction logic.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] `save()` method calls `this.getSessionFileName()`
- [x] No inline filename construction in `save()`

---

## Phase 3: Update Session Command to Use getSessionFileName()

### Overview
Update the `/session` command to call `sessionManager.getSessionFileName()` instead of constructing the filename locally.

### Changes Required:

#### 1. Update Session Command
**File**: `source/commands/session/index.ts:97`

**Current (incorrect)**:
```typescript
const sessionFile = `session-${createdAt.toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${sessionId}.json`;
```

**Fixed (correct)**:
```typescript
const sessionFile = sessionManager.getSessionFileName();
```

**Reasoning**: The session command should not construct the filename - it should ask the session manager for it. This eliminates the duplication and prevents future bugs if the naming convention changes.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build succeeds: `npm run build`
- [x] All tests pass: `npm test`

#### Manual Verification:
- [x] Run `/session` command in REPL
- [x] Note the "Session File" value (should be `session-{uuid}.json` format)
- [x] Verify the file exists at `~/.acai/sessions/{displayed-name}`
- [x] Confirm no timestamp prefix in the displayed filename

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- Add test for `getSessionFileName()` method verifying correct format
- Ensure existing session tests continue to pass

### Integration Tests:
- Run the REPL and execute `/session` command
- Verify displayed filename matches actual file on disk
- Verify session save/load still works correctly

### Manual Testing Steps:
1. Start the REPL: `acai` or `node source/index.ts`
2. Type `/session` and press Enter
3. Look at the "Session File" row in the metadata table
4. Note the filename format: should be `session-{uuid}.json` (no timestamp)
5. In a separate terminal, run: `ls ~/.acai/sessions/`
6. Confirm the displayed filename exists in the directory listing
7. Create a new message to trigger a save
8. Verify the file is saved with the correct name

## Performance Considerations

No performance impact. This is a refactoring that removes string manipulation operations and replaces them with a simple method call.

## Migration Notes

No migration needed. This is a refactoring - actual session files are unaffected. The naming convention remains the same (`session-{uuid}.json`).

## Future-Proofing

By creating `getSessionFileName()` as the single source of truth:
- Future changes to naming convention only require updating one method
- The session command automatically stays in sync
- The save logic automatically stays in sync
- No risk of display/save mismatch bugs

## References

- Original ticket: `.tickets/at-9f25.md`
- Research: `.research/2026-01-29-session-file-name-discrepancy.md`
- Display logic: `source/commands/session/index.ts:97`
- Save logic: `source/sessions/manager.ts:309`
