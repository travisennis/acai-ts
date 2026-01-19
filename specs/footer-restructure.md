# Task: Restructure Footer Component to Display Git Information on Two Lines

## Overview
Update the footer component in `source/tui/components/footer.ts` to reorganize the project status display. Currently, all information appears on a single line. The goal is to split this into two lines, with git-specific information (branch and changes) moved to a second line.

## Current Implementation
The current footer displays:
- **Line 1**: `[current directory] [branch] [file changes] [diff stats] [current model]`

## Required Changes

### 1. Add Unpushed Commits Detection
**File:** `source/utils/git.ts`

Add a new function to count unpushed commits:
```typescript
export async function getUnpushedCommitsCount(): Promise<number>
```

This function should:
- Count commits that exist locally but haven't been pushed to the remote branch
- Use `git rev-list --count HEAD..origin/<branch>` or similar approach
- Handle cases where no remote is configured or branch has no upstream
- Return `0` if unpushed count cannot be determined

### 2. Update ProjectStatusData Interface
**File:** `source/tui/components/footer.ts`

Add `unpushedCommits` field to the `ProjectStatusData` interface:
```typescript
export interface ProjectStatusData {
  // ...existing fields...
  unpushedCommits: number;  // Number of commits not yet pushed to remote
}
```

### 3. Fetch Unpushed Commits Count
**File:** `source/repl/project-status.ts`

In the `ProjectStatus.get()` method, after determining the branch:
- Call `getUnpushedCommitsCount()`
- Add `unpushedCommits` field to the status object
- Maintain existing caching behavior (2 second TTL)

### 4. Restructure Footer Display
**File:** `source/tui/components/footer.ts`

**Line 1:** Display only:
- `[current directory]` (truncated if needed for terminal width)
- `[current model info]`

**Line 2:** Display git information:
- `[branch]` followed by unpushed indicator if count > 0, formatted as `master ↑3`
- File change indicators: `+N ~M -K ?U`
- Diff stats in brackets: `[+X insertions -Y deletions]`

**Example output:**
```
~/Projects/acai-ts                                    gpt-4 [gpt-4-turbo]
master ↑3 +1 ~2 -0 ?1 [+5 -2]
```

### 5. Update formatProjectStatus Function
Modify `formatProjectStatus()` function to:
- Return a 2-element array (for two lines) instead of a single string
- Apply consistent styling:
  - Branch: `style.gray()`
  - Unpushed indicator: `style.cyan()` or similar
  - File change indicators: `style.yellow()`
  - Diff stats: `style.green()` for insertions, `style.red()` for deletions
- Handle cases where repo is not a git repository (return just path + model)

### 6. Update Render Method
**File:** `source/tui/components/footer.ts`

Update the `render()` method in `FooterComponent` class:
- Change how `formatProjectStatus` output is consumed (array vs string)
- Maintain existing padding logic between project status and model info
- Keep all existing functionality for usage tracking and progress bar

## Technical Requirements
- Maintain all existing caching behavior for git operations
- Handle gracefully when not in a git repository
- Handle gracefully when unpushed count cannot be determined
- Respect terminal width constraints for path truncation
- Maintain existing visual styling and color scheme

## Testing Verification
After implementation, verify:
1. Non-git directories show only path and model on line 1
2. Git repositories show path + model on line 1, branch + changes on line 2
3. Unpushed commits indicator appears when commits are pending
4. File change indicators remain accurate
5. Diff stats display correctly
6. Terminal width handling works for path truncation
7. No performance degradation from additional git operations (cached)

## Related Files
- `source/tui/components/footer.ts` - Main footer component
- `source/repl/project-status.ts` - Project status data fetching
- `source/utils/git.ts` - Git utility functions
