# Grep Tool Implementation Research

## Research Question

Investigate the Grep tool bug in the auto-detection logic for literal vs regex mode, specifically:
1. Find the Grep tool implementation
2. Locate the `likelyUnbalancedRegex()` function
3. Understand how the literal/regex mode decision is made
4. Find how patterns get transformed
5. Locate related tests

## Overview

This research covers the Grep tool implementation in the acai-ts codebase, focusing on the auto-detection logic that determines whether a search pattern should be treated as a literal string or a regex pattern. The bug manifests when simple alphanumeric strings like "Grep" are incorrectly treated as regex patterns, causing ripgrep errors.

## Key Findings

### 1. Grep Tool Implementation Location

**Primary implementation file**: `/Users/travisennis/Projects/acai-ts/source/tools/grep.ts`

The tool is registered in `/Users/travisennis/Projects/acai-ts/source/tools/index.ts` (lines 15, 54, 79).

### 2. The `likelyUnbalancedRegex()` Function

**Location**: `/Users/travisennis/Projects/acai-ts/source/tools/grep.ts:296-310`

```typescript
export function likelyUnbalancedRegex(pattern: string): boolean {
  const counts = countBrackets(pattern);

  // Check for unbalanced brackets, parentheses, and braces
  const hasUnbalancedBrackets = counts.openBracket !== counts.closeBracket;
  const hasUnbalancedParens = counts.openParen !== counts.closeParen;
  const hasUnbalancedBraces = counts.openBrace !== counts.closeBrace;

  // Also check for invalid repetition operators
  const hasInvalidRepetitionFlag = hasInvalidRepetition(pattern);

  return (
    hasUnbalancedBrackets ||
    hasUnbalancedParens ||
    hasUnbalancedBraces ||
    hasInvalidRepetitionFlag
  );
}
```

**Supporting Functions**:
- `countBrackets()` (lines 229-283): Counts balanced brackets, parentheses, and braces, excluding character classes
- `hasInvalidRepetition()` (lines 185-224): Checks for invalid repetition operators like `{n}`, `{n,}`, `{n,m}`
- `skipCharacterClass()` (lines 162-170): Helper to skip character class content
- `isInvalidBraceContent()` (lines 173-183): Validates brace content

### 3. Literal vs Regex Mode Decision

The decision is made in **two locations**:

#### A. In `execute()` function (lines 124-131)
```typescript
let effectiveLiteral: boolean | null = null;
if (literal === true) {
  effectiveLiteral = true;
} else if (literal === false) {
  effectiveLiteral = false;
} else {
  effectiveLiteral = isLikelyUnbalanced;
}
```

#### B. In `buildGrepCommand()` function (lines 401-410)
```typescript
let effectiveLiteral: boolean;
if (options.literal === true) {
  effectiveLiteral = true;
} else if (options.literal === false) {
  effectiveLiteral = false;
} else if (options.likelyUnbalanced !== undefined) {
  effectiveLiteral = options.likelyUnbalanced;
} else {
  effectiveLiteral = likelyUnbalancedRegex(pattern);
}
```

**The Bug**: When `literal` is not explicitly provided (null), the code uses `likelyUnbalancedRegex(pattern)` to decide. This function only returns `true` for patterns with unbalanced brackets/parentheses/braces. For simple strings like "Grep", it returns `false`, causing the pattern to be treated as a regex.

### 4. Pattern Transformation

The pattern transformation happens through the `-F` flag in ripgrep:

**Location**: `/Users/travisennis/Projects/acai-ts/source/tools/grep.ts:434-436`
```typescript
if (effectiveLiteral) {
  command += " -F";
}
```

**Important Note**: The code itself does NOT add a `(?:` prefix. The error message in the bug report shows ripgrep's internal regex parsing error. The pattern is passed directly to ripgrep, and if `effectiveLiteral` is `false`, ripgrep interprets it as a regex.

### 5. Test Files

| Test File | Path |
|-----------|------|
| Main tests | `/Users/travisennis/Projects/acai-ts/test/tools/grep.test.ts` |
| Error handling | `/Users/travisennis/Projects/acai-ts/test/tools/grep-error-handling.test.ts` |
| Enhanced UX | `/Users/travisennis/Projects/acai-ts/test/tools/grep-enhanced-ux.test.ts` |
| Issue #96 | `/Users/travisennis/Projects/acai-ts/test/tools/grep-issue-96.test.ts` |
| Max results | `/Users/travisennis/Projects/acai-ts/test/tools/grep-max-results.test.ts` |
| Match counting | `/Users/travisennis/Projects/acai-ts/test/tools/grep-match-counting.test.ts` |

## Architecture & Design Patterns

### Pattern 1: Pre-computed Detection Result

The `likelyUnbalancedRegex()` result is computed once in `execute()` and passed through to `buildGrepCommand()`:

- **execute()** at line 122: `const isLikelyUnbalanced = likelyUnbalancedRegex(pattern);`
- Passed to `grepFilesStructured()` at line 151: `likelyUnbalanced: isLikelyUnbalanced`
- Used in `buildGrepCommand()` at line 407: `effectiveLiteral = options.likelyUnbalanced;`

This avoids redundant computation.

### Pattern 2: Three-way Literal Mode

The literal mode follows a three-way logic:
1. **Explicit `literal: true`** → Use fixed-string mode (`-F` flag)
2. **Explicit `literal: false`** → Use regex mode (no `-F` flag)
3. **`literal: null/undefined`** → Auto-detect using `likelyUnbalancedRegex()`

### Pattern 3: Error Message Enhancement

The `execute()` function wraps errors with user-friendly messages (lines 157-175):
```typescript
} else if (errorMessage.includes("Regex parse error")) {
  userFriendlyError = `Invalid search pattern "${pattern}" - try using literal=true for fixed-string search`;
}
```

## Data Flow

1. **User calls Grep tool** with pattern (e.g., "Grep") and optional parameters
2. **Input validation** via Zod schema (lines 17-48)
3. **execute() function** is called:
   - Computes `isLikelyUnbalanced = likelyUnbalancedRegex(pattern)` (line 122)
   - Determines `effectiveLiteral` based on user input and auto-detection (lines 124-131)
   - Calls `grepFilesStructured()` with options (lines 137-156)
4. **grepFilesStructured()** calls `buildGrepCommand()` (line 325)
5. **buildGrepCommand()**:
   - Determines final `effectiveLiteral` (lines 401-410)
   - Builds command with `-F` flag if `effectiveLiteral` is true (lines 434-436)
   - Executes ripgrep via `execFile()`
6. **ripgrep** processes the pattern:
   - With `-F`: treats pattern as literal string
   - Without `-F`: interprets pattern as regex

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| GrepTool | `source/tools/grep.ts` | Main tool definition and execution |
| createGrepTool | `source/tools/grep.ts:60` | Factory function returning tool definition, display, and execute |
| likelyUnbalancedRegex | `source/tools/grep.ts:296` | Auto-detection function |
| buildGrepCommand | `source/tools/grep.ts:329` | Constructs ripgrep command string |
| grepFilesStructured | `source/tools/grep.ts:487` | Executes ripgrep and parses JSON output |
| parseRipgrepJsonOutput | `source/tools/grep.ts:371` | Parses ripgrep JSON output |

### Configuration

- **Input Schema**: Zod schema defining all parameters (lines 17-48)
- **Default max results**: `DEFAULT_MAX_RESULTS = 100` (line 11)

### Key Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| pattern | string | required | Search pattern |
| path | string | required | Path to search |
| recursive | boolean | true | Search recursively |
| ignoreCase | boolean | false | Case-insensitive search |
| filePattern | string | null | Glob pattern to filter files |
| contextLines | number | 0 | Number of context lines |
| searchIgnored | boolean | false | Search ignored files |
| literal | boolean/null | null | Fixed-string vs regex mode |
| maxResults | number | 100 | Maximum results |

## Integration Points

### Dependencies
- **node:child_process**: For executing ripgrep (`execFile`)
- **zod**: For input validation
- **node:util**: For `inspect()` in display function

### Consumers
- **source/tools/index.ts**: Registers the tool in `initTools()`
- **AI SDK**: Uses the tool definition for agent execution

### External Systems
- **ripgrep (rg)**: External CLI tool for searching

## Edge Cases & Error Handling

### Edge Cases

1. **Empty pattern**: Not explicitly handled - passes through to ripgrep
2. **Pattern with only whitespace**: Passed to ripgrep as-is
3. **Path with spaces**: Properly quoted in command (test at `grep-error-handling.test.ts:64`)
4. **No matches found**: Returns exit code 1, handled gracefully (line 552-558)
5. **Regex parse error**: Exit code 2, throws enhanced error (line 560-565)

### Error Handling

1. **File not found**: "Path not found" error message
2. **Permission denied**: "Permission denied" error message
3. **Regex parse error**: Suggests using `literal=true`
4. **Abort signal**: Properly terminates search

## Known Limitations

### Bug: Auto-Detection Logic Flaw

**Issue**: The `likelyUnbalancedRegex()` function only checks for:
- Unbalanced brackets `[` vs `]`
- Unbalanced parentheses `(` vs `)`
- Unbalanced braces `{` vs `}`
- Invalid repetition operators

**Problem**: It does NOT check for:
- Simple alphanumeric strings (should default to literal)
- Regex metacharacters like `.`, `*`, `+`, `?`, `^`, `$`, `|`, `\`

**Result**: A pattern like "Grep" returns `false` from `likelyUnbalancedRegex()`, causing it to be treated as regex mode, which fails because ripgrep interprets certain characters as regex special characters.

**Evidence**:
- Bug report: Pattern "Grep" causes `regex parse error: (?:\Grep)`
- This indicates ripgrep is treating it as regex (without `-F` flag)

## Testing Coverage

### Existing Tests

| Test Area | File:Line Reference |
|-----------|---------------------|
| `-F` flag with literal=true | `grep.test.ts:10-12` |
| No `-F` with literal=false | `grep.test.ts:14-17` |
| Auto-detect unbalanced pattern | `grep.test.ts:19-22` |
| likelyUnbalancedRegex - parentheses | `grep.test.ts:24-28` |
| likelyUnbalancedRegex - brackets | `grep.test.ts:30-33` |
| likelyUnbalancedRegex - braces | `grep.test.ts:35-39` |
| likelyUnbalancedRegex - repetition | `grep.test.ts:41-48` |
| likelyUnbalancedRegex - character classes | `grep.test.ts:50-56` |
| likelyUnbalancedRegex - escape sequences | `grep.test.ts:58-66` |
| truncateMatches | `grep.test.ts:68-128` |
| Issue #96 - spawnChildProcess pattern | `grep-issue-96.test.ts:10-27` |
| Error handling - no matches | `grep-error-handling.test.ts:10-24` |
| Error handling - fixed-string mode | `grep-error-handling.test.ts:26-40` |
| Command escaping | `grep-error-handling.test.ts:42-80` |
| JSON parsing | `grep-enhanced-ux.test.ts:10-60` |
| Max results | `grep-max-results.test.ts:10-65` |
| Match counting | `grep-match-counting.test.ts:10-120` |

### Test Gaps

1. **No tests for simple alphanumeric patterns**: No test verifies behavior when pattern is "Grep" (simple string without metacharacters)
2. **No tests for regex metacharacters**: No test checks patterns like `.`, `*`, `+`, `?` are treated as regex
3. **No tests for default behavior**: No test verifies what happens when `literal` is omitted for a simple pattern

## References

### Source Files
- `/Users/travisennis/Projects/acai-ts/source/tools/grep.ts` - Main implementation
- `/Users/travisennis/Projects/acai-ts/source/tools/index.ts` - Tool registration
- `/Users/travisennis/Projects/acai-ts/dist/tools/grep.d.ts` - TypeScript definitions

### Test Files
- `/Users/travisennis/Projects/acai-ts/test/tools/grep.test.ts`
- `/Users/travisennis/Projects/acai-ts/test/tools/grep-error-handling.test.ts`
- `/Users/travisennis/Projects/acai-ts/test/tools/grep-issue-96.test.ts`
- `/Users/travisennis/Projects/acai-ts/test/tools/grep-enhanced-ux.test.ts`
- `/Users/travisennis/Projects/acai-ts/test/tools/grep-max-results.test.ts`
- `/Users/travisennis/Projects/acai-ts/test/tools/grep-match-counting.test.ts`

### Bug Report
- `/Users/travisennis/Projects/acai-ts/grep-bug.md`
