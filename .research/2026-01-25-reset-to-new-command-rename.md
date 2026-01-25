# Rename /reset Command to /new

## Research Question

What are all the impacts of renaming the `/reset` command to `/new` in the acai-ts codebase?

## Overview

This research investigates the complete impact of renaming the `/reset` command to `/new`. Currently, `/new` exists as an alias to `/reset`, and the task is to make `/new` the primary command name. This change affects command registration, documentation, tests, and file organization.

## Key Findings

### Finding 1: Command Definition and Alias Structure

**Description**: The `/reset` command is defined in `source/commands/reset/index.ts` with `/new` as an alias. This means both `/reset` and `/new` currently work identically.

**Evidence**: `source/commands/reset/index.ts:12-13`
```typescript
command: "/reset",
aliases: ["/new"],
```

**Implications**: The change requires swapping the primary command and alias - `/new` becomes the primary command and `/reset` becomes the alias (or is removed entirely).

### Finding 2: Command Registration and Import

**Description**: The command is imported and registered in the CommandManager.

**Evidence**: 
- Import: `source/commands/manager.ts:33`
- Registration: `source/commands/manager.ts:106`

**Implications**: The import statement needs to be updated from `resetCommand` to `newCommand` (or similar naming).

### Finding 3: Test File References

**Description**: The test file imports and tests the command using the `resetCommand` export name.

**Evidence**: `test/commands/reset-command.test.ts:3,7,53,65,78`
```typescript
import { resetCommand } from "../../source/commands/reset/index.ts";
```

**Implications**: The test file needs to be renamed and all references to `resetCommand` updated to the new export name.

### Finding 4: Documentation References

**Description**: Multiple documentation files reference the `/reset` command.

**Evidence**:
- `README.md:315` - Lists `/reset` as an available command
- `ARCHITECTURE.md:383-385` - References reset command files
- `TODO.md:5` - Contains the task to rename it
- `plan.md:18,66` - References reset command in a plan

**Implications**: All documentation must be updated to reflect the new command name.

### Finding 5: File Organization

**Description**: The command is organized in a `reset/` directory with `index.ts` and `types.ts` files.

**Evidence**: `source/commands/reset/` directory structure

**Implications**: The directory should be renamed from `reset/` to `new/` (or similar) to match the command name.

### Finding 6: Unrelated "reset" References

**Description**: Many unrelated uses of "reset" exist in the codebase (methods, variables, git commands, ANSI codes).

**Evidence**: Various files contain `reset()` methods, `resetState()`, git reset commands, ANSI reset codes, etc.

**Implications**: These are unrelated to the command and should NOT be changed. Care must be taken to only change command-specific references.

## Architecture & Design Patterns

### Pattern 1: Command Registration
- **Description**: Commands are imported in `manager.ts`, instantiated with options, and registered in a Map
- **Example**: `source/commands/manager.ts:33,106`
- **When Used**: All commands follow this pattern

### Pattern 2: Command Aliases
- **Description**: Commands can have aliases that map to the same handler
- **Example**: `source/commands/reset/index.ts:13`
- **When Used**: When multiple command names should trigger the same behavior

### Pattern 3: Test Organization
- **Description**: Tests mirror the command directory structure
- **Example**: `test/commands/reset-command.test.ts`
- **When Used**: All commands have corresponding test files

## Data Flow

1. User types `/new` (or `/reset`)
2. CommandManager looks up the command in the commands Map
3. Command's `handle()` method is called with TUI context
4. Session is saved, then cleared
5. Token tracker is reset
6. Terminal title is updated
7. Container and editor are cleared
8. Footer state is reset
9. TUI is re-rendered

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| Reset Command | `source/commands/reset/index.ts` | Command definition and handler |
| Command Types | `source/commands/reset/types.ts` | Type definitions (currently empty) |
| Command Manager | `source/commands/manager.ts` | Registers and routes commands |
| Tests | `test/commands/reset-command.test.ts` | Tests command behavior |

### Configuration

None specific to this command.

## Integration Points

- **Dependencies**: SessionManager, TokenTracker, ModelManager, TUI components
- **Consumers**: CommandManager, help command
- **External systems**: None

## Edge Cases & Error Handling

### Edge Cases
- Empty session: Command checks `sessionManager.isEmpty()` before saving
- Footer component not found: Command checks if footer exists before calling `resetState()`

### Error Handling
- No explicit error handling in the command handler
- Relies on SessionManager and TokenTracker to handle their own errors

## Known Limitations

- The command name `/reset` is currently the primary, `/new` is the alias
- After renaming, users who use `/reset` will need to use `/new` instead (unless `/reset` is kept as an alias)

## Testing Coverage

### Existing Tests
- Command definition test: `test/commands/reset-command.test.ts:52-62`
- Command properties test: `test/commands/reset-command.test.ts:64-75`
- Handle method test: `test/commands/reset-command.test.ts:77-96`

### Test Gaps
- No test for session saving behavior
- No test for token tracker reset
- No test for footer state reset
- No test for terminal title update

## Recommendations for Planning

Based on this research, when planning the rename:

1. **Consider**: Keep `/reset` as a deprecated alias for backward compatibility, or remove it entirely
2. **Follow pattern**: Use consistent naming - if command is `/new`, directory should be `new/`, export should be `newCommand`
3. **Watch out for**: Unrelated "reset" references in the codebase (methods, git commands, ANSI codes) - do NOT change these
4. **Test**: Ensure all tests pass after rename, verify help command shows correct name

## Files to Change

### Must Change
1. `source/commands/reset/index.ts` - Update command name and alias
2. `source/commands/reset/types.ts` - Update comment
3. `source/commands/manager.ts` - Update import and variable name
4. `test/commands/reset-command.test.ts` - Update import and all references
5. `README.md` - Update command documentation
6. `ARCHITECTURE.md` - Update file references
7. `TODO.md` - Mark task as done (or remove)

### Directory Rename
- `source/commands/reset/` → `source/commands/new/` (or similar)

### Optional Changes
- `plan.md` - Update references if still relevant

## References

- Original ticket: `.tickets/at-3905.md`
- Source files:
  - `source/commands/reset/index.ts`
  - `source/commands/reset/types.ts`
  - `source/commands/manager.ts`
  - `test/commands/reset-command.test.ts`
- Documentation:
  - `README.md`
  - `ARCHITECTURE.md`
  - `TODO.md`
  - `plan.md`