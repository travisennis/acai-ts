# Rename /reset Command to /new Implementation Plan

## Overview

Rename the `/reset` command to `/new` by updating the command definition, directory structure, tests, and documentation. The `/new` alias will become the primary command name and `/reset` will be removed entirely.

## Current State Analysis

The `/reset` command is currently defined with `/new` as an alias. The command lives in `source/commands/reset/` directory and is exported as `resetCommand`. Aliases are not actively used in the system (registration code is commented out in `manager.ts:122-125`), so we can safely remove `/reset` entirely.

**Key Discoveries:**
- Command definition: `source/commands/reset/index.ts:12-13` - has `command: "/reset"` and `aliases: ["/new"]`
- Import in manager: `source/commands/manager.ts:33` - imports `resetCommand`
- Test file: `test/commands/reset-command.test.ts` - tests the command with `resetCommand` export
- Documentation references in README.md, ARCHITECTURE.md, TODO.md, and plan.md
- Many unrelated `reset` references exist (methods, git commands, ANSI codes) - these must NOT be changed

## Desired End State

The `/new` command will be the primary command with no aliases. The directory will be renamed from `reset/` to `new/`, the export will be `newCommand`, and all documentation will reference `/new` instead of `/reset`.

**Verification:**
- Running `/new` in the REPL saves chat history and resets the conversation
- Running `/reset` shows "command not found" error
- Help command shows `/new` as available command
- All tests pass
- All documentation updated correctly

## What We're NOT Doing

- NOT keeping `/reset` as a deprecated alias
- NOT changing any unrelated `reset` references (methods like `resetState()`, git reset commands, ANSI reset codes, etc.)
- NOT modifying the command's behavior or functionality
- NOT changing other commands that use the word "reset" in their implementation

## Implementation Approach

This is a straightforward rename operation that must be done in two phases:
1. Rename command directory, update implementation, and update tests together (these are tightly coupled)
2. Update all documentation files

The approach minimizes risk by making changes incrementally, with automated verification after each phase.

## Phase 1: Rename command and update implementation and tests

### Overview
Rename the `reset/` directory to `new/`, update the command implementation, rename the test file, and update all references. These changes must happen together to avoid breaking the build.

### Changes Required:

#### 1. Command implementation file
**File**: `source/commands/reset/index.ts` → `source/commands/new/index.ts`

**Changes**:
- Rename directory from `reset/` to `new/`
- Change export name from `resetCommand` to `newCommand`
- Change `command` from `"/reset"` to `"/new"`
- Remove `aliases` array entirely (no aliases needed)
- Update description to reflect the new command name

```typescript
export const newCommand = ({
  modelManager,
  sessionManager,
  tokenTracker,
}: CommandOptions): ReplCommand => {
  return {
    command: "/new",
    description: "Saves the chat history and then resets it.",
    getSubCommands: () => Promise.resolve([]),
    // ... rest of implementation unchanged
  };
};
```

#### 2. Types file
**File**: `source/commands/reset/types.ts` → `source/commands/new/types.ts`

**Changes**: Rename directory and update comment

```typescript
// Types for new command
// Currently no specific types needed beyond the base CommandOptions
```

#### 3. Command manager import
**File**: `source/commands/manager.ts`

**Changes**: Update import statement and variable name

```typescript
// Line 33: Change import
- import { resetCommand } from "./reset/index.ts";
+ import { newCommand } from "./new/index.ts";

// Line 106: Change variable name
- resetCommand(options),
+ newCommand(options),
```

#### 4. Test file
**File**: `test/commands/reset-command.test.ts` → `test/commands/new-command.test.ts`

**Changes**: Rename file and update all references

```typescript
// Line 3: Update import
- import { resetCommand } from "../../source/commands/reset/index.ts";
+ import { newCommand } from "../../source/commands/new/index.ts";

// Line 7: Update describe block
- describe("resetCommand", () => {
+ describe("newCommand", () => {

// Lines 53, 56, 65, 68, 78: Update function calls and assertions
- const command = resetCommand(mockOptions);
+ const command = newCommand(mockOptions);

- assert.equal(command.command, "/reset");
+ assert.equal(command.command, "/new");

- assert.deepStrictEqual(command.aliases, ["/new"]);
+ assert.deepStrictEqual(command.aliases, []);
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `/new` command works correctly in REPL (saves history and resets conversation)
- [ ] `/reset` command shows "command not found" error
- [ ] Help command (`/help`) shows `/new` in the command list
- [ ] All three test cases pass

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Update documentation

### Overview
Update all documentation files to reference the `/new` command instead of `/reset`.

### Changes Required:

#### 1. README
**File**: `README.md`

**Changes**: Update command list

```markdown
- Line 315: Change command description
- - `/reset` - Saves chat history and resets the conversation
+ `/new` - Saves chat history and resets the conversation
```

#### 2. ARCHITECTURE.md
**File**: `ARCHITECTURE.md`

**Changes**: Update file references

```markdown
- Line 383: Change directory reference
- - **source/commands/reset/index.ts**: Main reset command implementation.
+ **source/commands/new/index.ts**: Main new command implementation.

- Lines 384-385: Update references
- - **source/commands/reset/types.ts**: Type definitions for reset command.
- - **source/commands/reset/utils.ts**: Utility functions for reset command.
+ **source/commands/new/types.ts**: Type definitions for new command.
+ **source/commands/new/utils.ts**: Utility functions for new command.

- Line 98: Update directory reference
- - │   │   ├── reset/
+ - │   │   ├── new/
```

#### 3. TODO.md
**File**: `TODO.md`

**Changes**: Remove the completed task

```markdown
- Lines 5: Remove the task
- - [ ] rename the /reset command to /new. update file name to reflect the new name
+ (remove this line entirely)
```

#### 4. plan.md
**File**: `plan.md`

**Changes**: Update or remove references (if this file is still relevant)

```markdown
- Lines 18, 66: Update file references
- | `source/commands/reset/index.ts` | 8, 24-26 | Parameter destructuring |
+ | `source/commands/new/index.ts` | 8, 24-26 | Parameter destructuring |

- Lines 66: Update file references
- -   - `source/commands/reset/index.ts`
+ -   - `source/commands/new/index.ts`
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] README accurately reflects the `/new` command
- [ ] ARCHITECTURE.md references are correct
- [ ] TODO.md no longer contains the task
- [ ] plan.md references are updated (if file is still relevant)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:
- Command definition and properties
- Command handler behavior
- Aliases (should be empty array)

### Integration Tests:
- Command registration in CommandManager
- Help command displays correct command name
- Autocomplete shows `/new` but not `/reset`

### Manual Testing Steps:
1. Start the REPL: `acai`
2. Type some text to create a session
3. Run `/new` and verify it saves and resets
4. Try `/reset` and verify it shows "command not found"
5. Run `/help` and verify `/new` is listed
6. Start typing `/` and verify autocomplete shows `/new`

## Performance Considerations

No performance implications - this is a simple rename with no logic changes.

## Migration Notes

This is a breaking change for users who use `/reset`. They will need to use `/new` instead. Since the command is rarely used (only to save and reset conversation), the impact is minimal.

## References

- Original ticket: `.tickets/at-3905.md`
- Related research: `.research/2026-01-25-reset-to-new-command-rename.md`
- Current implementation: `source/commands/reset/index.ts`
- Tests: `test/commands/reset-command.test.ts`