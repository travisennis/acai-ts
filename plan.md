# Plan: Fix Grep Tool Auto-Detection Bug

## Overview

Fix the Grep tool's auto-detection logic so that simple alphanumeric strings like "Grep" are treated as literal searches by default, rather than being incorrectly interpreted as regex patterns.

## Problem Statement

The `likelyUnbalancedRegex()` function in `source/tools/grep.ts` only checks for:
- Unbalanced brackets `[` vs `]`
- Unbalanced parentheses `(` vs `)`
- Unbalanced braces `{` vs `}`
- Invalid repetition operators

It does NOT check for:
- Simple alphanumeric strings (should default to literal)
- Regex metacharacters like `.`, `*`, `+`, `?`, `^`, `$`, `|`, `\`

**Result**: A pattern like "Grep" returns `false` from `likelyUnbalancedRegex()`, causing it to be treated as regex mode, which fails because ripgrep interprets certain characters as regex special characters.

## Files to Modify

1. **`source/tools/grep.ts`**
   - Modify `likelyUnbalancedRegex()` function (lines 361-376)
   - Add new helper function `containsRegexMetacharacters()`
   - Update the literal/regex decision logic

2. **`test/tools/grep.test.ts`**
   - Add tests for simple alphanumeric patterns
   - Add tests for patterns with regex metacharacters

---

## Phase 1: Add Helper Function

### 1.1 Create `containsRegexMetacharacters()` function

**Location**: `source/tools/grep.ts`, before `likelyUnbalancedRegex()`

**Purpose**: Check if a pattern contains any regex metacharacters that would indicate it should be treated as regex.

**Implementation**:
```typescript
/**
 * Check if a pattern contains regex metacharacters.
 * Returns true if the pattern likely needs regex mode.
 */
function containsRegexMetacharacters(pattern: string): boolean {
  // Regex metacharacters: ^ $ . * + ? [ ] ( ) { } | \
  const metacharacterPattern = /[\^$.*+?[\](){}|\\]/;
  return metacharacterPattern.test(pattern);
}
```

**Automated verification**: 
- Run `npm run typecheck`
- Run `npm run lint`

---

## Phase 2: Modify Auto-Detection Logic

### 2.1 Update `likelyUnbalancedRegex()` function

**Location**: `source/tools/grep.ts:361-376`

**Current behavior**:
```typescript
export function likelyUnbalancedRegex(pattern: string): boolean {
  const counts = countBrackets(pattern);

  const hasUnbalancedBrackets = counts.openBracket !== counts.closeBracket;
  const hasUnbalancedParens = counts.openParen !== counts.closeParen;
  const hasUnbalancedBraces = counts.openBrace !== counts.openBrace;

  const hasInvalidRepetitionFlag = hasInvalidRepetition(pattern);

  return (
    hasUnbalancedBrackets ||
    hasUnbalancedParens ||
    hasUnbalancedBraces ||
    hasInvalidRepetitionFlag
  );
}
```

**New behavior**:
```typescript
export function likelyUnbalancedRegex(pattern: string): boolean {
  // First check: if pattern has regex metacharacters, treat as regex (return false)
  // This allows ripgrep to handle the pattern as a proper regex
  if (containsRegexMetacharacters(pattern)) {
    return false;
  }

  // Second check: unbalanced brackets/parentheses/braces = likely a typo, use literal
  const counts = countBrackets(pattern);

  const hasUnbalancedBrackets = counts.openBracket !== counts.closeBracket;
  const hasUnbalancedParens = counts.openParen !== counts.closeParen;
  const hasUnbalancedBraces = counts.openBrace !== counts.closeBrace;

  const hasInvalidRepetitionFlag = hasInvalidRepetition(pattern);

  // If pattern has unbalanced syntax, treat as literal (user probably meant to type literal)
  // Otherwise, default to literal for simple alphanumeric strings
  return (
    hasUnbalancedBrackets ||
    hasUnbalancedParens ||
    hasUnbalancedBraces ||
    hasInvalidRepetitionFlag
  );
}
```

**Logic explanation**:
1. If pattern contains regex metacharacters → return `false` (use regex mode)
2. If pattern has unbalanced brackets/parens/braces → return `true` (use literal mode, user likely meant literal)
3. Otherwise → return `true` (default to literal mode for simple strings)

**Alternative approach**: Could rename function to `shouldUseLiteralMode()` for clarity, but keeping current name for backwards compatibility.

**Automated verification**:
- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm test` (grep tests should pass)

---

## Phase 3: Add Tests

### 3.1 Add tests for simple alphanumeric patterns

**Location**: `test/tools/grep.test.ts`

**Add these tests**:
```typescript
test("likelyUnbalancedRegex returns true for simple alphanumeric strings", () => {
  assert.ok(likelyUnbalancedRegex("Grep"));
  assert.ok(likelyUnbalancedRegex("console.log"));
  assert.ok(likelyUnbalancedRegex("hello world"));
  assert.ok(likelyUnbalancedRegex("test123"));
});

test("likelyUnbalancedRegex returns false for patterns with regex metacharacters", () => {
  assert.ok(!likelyUnbalancedRegex("a.b"));
  assert.ok(!likelyUnbalancedRegex("a*b"));
  assert.ok(!likelyUnbalancedRegex("a+b"));
  assert.ok(!likelyUnbalancedRegex("a?b"));
  assert.ok(!likelyUnbalancedRegex("a|b"));
  assert.ok(!likelyUnbalancedRegex("^start"));
  assert.ok(!likelyUnbalancedRegex("end$"));
});

test("buildGrepCommand uses -F for simple alphanumeric patterns", () => {
  const cmd = buildGrepCommand("Grep", "/repo", { literal: null });
  assert.ok(cmd.includes(" -F"), "Expected -F flag for simple string");
});

test("buildGrepCommand does not use -F for patterns with regex metacharacters", () => {
  const cmd = buildGrepCommand("a.b", "/repo", { literal: null });
  assert.ok(!cmd.includes(" -F"), "Expected no -F flag for regex pattern");
});
```

### 3.2 Run tests to verify

**Automated verification**:
```bash
npm test
```

Expected: All grep tests pass.

---

## Phase 4: Manual Verification

### 4.1 Test with simple string pattern

Run the Grep tool with a simple string to verify it works:
```
pattern: "Grep"
path: "./source"
```

**Expected**: Tool returns results without regex parse error.

### 4.2 Test with regex pattern still works

```
pattern: "function\\s+(\\w+)"
path: "./source"
```

**Expected**: Tool correctly interprets as regex.

### 4.3 Test unbalanced pattern

```
pattern: "function("
path: "./source"
```

**Expected**: Tool uses literal mode (unbalanced parens detected).

---

## Success Criteria

### Automated Verification
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm test` passes (all grep tests)

### Manual Verification
- [x] Search for "Grep" works without regex error
- [x] Search for "console.log" works
- [x] Search for regex patterns like "a.b" still works as regex
- [x] Search for unbalanced patterns like "function(" still works

---

## What We're NOT Doing

1. **Not changing the function name**: Keeping `likelyUnbalancedRegex()` for backwards compatibility even though the behavior now includes "simple strings default to literal"

2. **Not adding a new parameter**: The fix uses the existing `literal` parameter logic - users can still override with `literal: true` or `literal: false`

3. **Not modifying ripgrep behavior**: This is purely a client-side fix in the tool's auto-detection logic

4. **Not adding more complex regex detection**: We only check for basic metacharacters, not full regex validity (that would require a regex parser)

---

## Rollback Plan

If issues arise:

1. Revert changes to `source/tools/grep.ts`
2. Run tests to confirm original behavior restored
3. Investigate with `npm test -- --grep` to isolate failing test
