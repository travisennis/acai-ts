# Improvements Implementation Plan

## Summary

Implement fixes for two issues from improvements.md:
1. Tool repair mechanism fails when model omits required fields instead of passing `null`
2. Glob/Grep tools throw TypeError when model passes undefined `path` value

---

## Issue 1: Fix response_format schema validation in tool repair

### Problem

The tool repair mechanism fails when models pass malformed parameters. The repair process sends the full expected schema but doesn't properly handle required fields - the model omits fields instead of providing `null` for missing values.

### Root Cause

- Repair prompt at `source/agent/index.ts:686-702` and `source/cli.ts:167-183` doesn't instruct the model to use `null` for missing fields
- The AI SDK's `Output.object({ schema })` generates strict validation requiring all fields in the `required` array

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `source/agent/index.ts` | 686-702 | Update repair prompt to explicitly instruct model to use `null` for missing fields |
| `source/cli.ts` | 167-183 | Update repair prompt to explicitly instruct model to use `null` for missing fields |

### Implementation

**Step 1:** Update repair prompt in both locations to include:
```
"If any field is missing or undefined in the corrected input, you MUST explicitly set its value to null. Do NOT omit fields - every field in the schema must be present, even if with a null value."
```

**Step 2:** After getting repaired output from AI SDK, validate with Zod and ensure all schema fields are present (treating undefined as null).

---

## Issue 2: Add path validation in Glob/Grep tools

### Problem

TypeError "The 'path' argument must be of type string. Received undefined" occurs when models pass malformed parameters. The Glob and Grep tools receive undefined or malformed path values, causing runtime errors.

### Root Cause

- The model may omit the `path` field entirely instead of providing a value or `null`
- The `execute` functions in Glob/Grep tools don't validate `path` before using it

### Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `source/tools/glob.ts` | 101-145 | Add path validation at start of execute function |
| `source/tools/grep.ts` | 153-220 | Add path validation at start of execute function |

### Implementation

**Step 1:** In both tools, add validation at the start of `execute`:
```typescript
// Validate path - default to cwd if not provided
const effectivePath = (typeof path === "string" && path.trim() !== "")
  ? path
  : process.cwd();
```

**Step 2:** Use `effectivePath` throughout the execute function instead of raw `path`

---

## Out of Scope

- Adding validation to other tools beyond Glob/Grep
- Broad schema validation changes across all tools
- Adding new tests (existing test suite covers core functionality)
- Changes to tool definitions or inputSchema (only execute functions modified)

---

## Success Criteria

### Automated Verification
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` passes

### Manual Verification
- [ ] Test tool repair with a tool call missing required fields - repair should now include null values
- [ ] Test Glob tool without path parameter - should default to current working directory
- [ ] Test Grep tool without path parameter - should default to current working directory

---

## Migration/Rollback

- No migration needed - these are bug fixes with safe defaults
- Rollback: Simply revert the file changes to restore previous behavior

---

## Assumptions

1. Defaulting path to `process.cwd()` is safe because it's a restricted operation within allowed directories
2. The repair prompt update will work without changing the AI model - it's purely instructional text
3. No changes needed to tool inputSchema definitions - validation happens at execute time
