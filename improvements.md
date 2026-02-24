# Improvement Recommendations

## System Prompt
- No changes needed for this implementation session

## Tool Descriptions
- No changes needed for this implementation session

## New Capabilities

### 1. Pattern Validation Lint Rule
**Rationale**: During the parallel tool execution implementation, `yield` was incorrectly used inside async callbacks within `.map()`. This is a common JavaScript anti-pattern where developers mistakenly use `yield` in non-generator functions.

**Implementation**: Add a Biome lint rule or custom check to detect:
- `yield` expressions inside async arrow functions
- `yield` expressions inside `.map()`, `.forEach()`, `.filter()` callbacks
- `yield` expressions inside any non-generator function scope

**Benefit**: Prevents TypeScript compilation errors and reduces debugging time for developers.

### 2. Fix Pre-existing Test Fixture
**Rationale**: The test at `test/tools/grep-issue-96.test.ts` references a `test-ls-fixture` directory that doesn't exist, causing a pre-existing test failure.

**Implementation**: Either:
- Create the `test-ls-fixture` directory with appropriate test files
- OR update the test to not depend on this external fixture

### 3. Document tmux Requirement
**Rationale**: The AGENTS.md mentions using tmux for REPL testing, but doesn't mention that tmux must be actively running on the system. Manual testing failed because tmux server wasn't running.

**Implementation**: Update AGENTS.md to note:
- tmux must be installed (`brew install tmux`)
- tmux server must be started (`tmux start` or by creating a session)
- Alternative: Document how to run manual tests without tmux using the CLI mode (`acai -p "prompt"`)

## Additional Notes

### Session Context
This analysis was performed after implementing parallel tool execution in the agent. The implementation required restructuring code that initially used `yield` inside async callbacks - a pattern that TypeScript correctly flagged as an error.

### Error Summary
- 2 TypeScript yield errors during initial implementation
- 5 tmux-related manual test failures
- 1 pre-existing grep test failure (missing fixture)
- Multiple DevTools warnings (non-blocking)
