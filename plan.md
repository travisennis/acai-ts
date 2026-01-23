# Refactoring Plan: Rename `messageHistory` → `sessionManager`

## Overview

The `SessionManager` class is being incorrectly referenced as `messageHistory` in many places. The goal is to rename all instances for consistency, matching the already-correct usage in `source/commands/types.ts` and `source/agent/index.ts`.

## Files Affected

### Source Files (12 files)

| File | Line(s) | Change Type |
|------|---------|-------------|
| `source/cli.ts` | 29, 55-56, 75, 103, 129, 135, 157 | Interface property + local variables |
| `source/repl.ts` | 44, 146, 267, 292, 482, 503, 520, 760, 793 | Interface property + local variables |
| `source/index.ts` | 348-363, 367, 389, 419, 433, 449, 479 | Local variables + function parameters |
| `source/commands/copy/index.ts` | 25-26 | Parameter destructuring |
| `source/commands/pickup/utils.ts` | 55, 69-70 | Parameter destructuring |
| `source/commands/reset/index.ts` | 8, 24-26 | Parameter destructuring |
| `source/commands/save/index.ts` | 7, 22-23 | Parameter destructuring |
| `source/commands/history/index.ts` | 72, 78, 122 | Parameter destructuring |
| `source/commands/handoff/index.ts` | 79, 87 | Parameter destructuring |
| `source/commands/session/index.ts` | 32, 88, 105-110 | Parameter destructuring |
| `source/commands/generate-rules/index.ts` | 30, 57-58, 78 | Parameter destructuring |
| `source/commands/manager.ts` | 57, 67 | Parameter destructuring |

### Test Files (2 files)

| File | Line(s) | Change Type |
|------|---------|-------------|
| `test/messages.test.ts` | 9, 16, 24, 28, 33, 38, 43, 49, 56, 60 | Variable name |
| `test/utils/mocking.ts` | 271, 184-203 | Property name + function name |

## Specific Changes Detail

| File | Change Type | Current Pattern | Target Pattern |
|------|-------------|-----------------|----------------|
| `source/cli.ts:29` | Interface property | `messageHistory: SessionManager` | `sessionManager: SessionManager` |
| `source/cli.ts:55-56` | Destructuring | `const { ..., messageHistory } = this.options` | `const { ..., sessionManager } = this.options` |
| `source/repl.ts:44` | Interface property | `messageHistory: SessionManager` | `sessionManager: SessionManager` |
| `source/repl.ts:146` | Destructuring | `const { ..., messageHistory, ... } = this.options` | `const { ..., sessionManager, ... } = this.options` |
| Command files | Destructuring | `sessionManager: messageHistory` | `sessionManager` |
| `test/messages.test.ts` | Variable name | `let messageHistory: SessionManager` | `let sessionManager: SessionManager` |
| `test/utils/mocking.ts:271` | Property name | `messageHistory: createMockMessageHistory()` | `sessionManager: createMockSessionManager()` |
| `test/utils/mocking.ts` | Function name | `createMockMessageHistory()` | `createMockSessionManager()` |

## Commands Already Correct (No Changes Needed)

- `source/commands/types.ts` - already uses `sessionManager`
- `source/agent/index.ts` - already uses `sessionManager`
- `test/sessions/manager.test.ts` - already uses `sessionManager`

## Implementation Steps

1. **Update interface definitions**
   - `source/cli.ts:29` - rename `messageHistory` to `sessionManager`
   - `source/repl.ts:44` - rename `messageHistory` to `sessionManager`

2. **Update local variable usage in source files**
   - `source/cli.ts` - update all references
   - `source/repl.ts` - update all references
   - `source/index.ts` - update all references

3. **Update command file parameter destructuring**
   - `source/commands/copy/index.ts`
   - `source/commands/pickup/utils.ts`
   - `source/commands/reset/index.ts`
   - `source/commands/save/index.ts`
   - `source/commands/history/index.ts`
   - `source/commands/handoff/index.ts`
   - `source/commands/session/index.ts`
   - `source/commands/generate-rules/index.ts`
   - `source/commands/manager.ts`

4. **Update test files**
   - `test/messages.test.ts` - rename variable throughout
   - `test/utils/mocking.ts` - rename function and property name

5. **Run verification**
   - `npm test` - all tests pass
   - `npm run typecheck` - no type errors
   - `npm run lint` - no linting errors
   - `npm run build` - builds successfully

## Success Criteria

1. ✅ No occurrences of `messageHistory` variable/parameter names in source code
2. ✅ All interface properties use `sessionManager`
3. ✅ All tests pass (`npm test`)
4. ✅ Typecheck passes (`npm run typecheck`)
5. ✅ Lint passes (`npm run lint`)
6. ✅ Build succeeds (`npm run build`)
