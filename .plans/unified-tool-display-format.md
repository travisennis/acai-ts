# Unified Tool Display Format for TUI

## Task Overview
Remove the unnecessary `>` prefix and newline from all tool display functions in acai-ts. The tool name is already prepended by the `tool-execution.ts` component, so display functions should only return the arguments.

## Current Behavior
- **Grep tool** (correct): Returns just the arguments: `'pattern' in /path (filter: *.ts) (with 5 context lines)`
- **Other tools** (incorrect): Include `>` prefix and newline: `\n> /path/to/file:5:80`

## Desired Behavior
All tool display functions should return only the arguments (no tool name, no `>` prefix, no leading newline).

Examples of what display functions should return:
- Read: `/path/to/file:5:80`
- Edit: `/path/to/file (2 edits)`
- Bash: `command-here`
- Glob: `'*.ts' in /path`
- Ls: `/path/to/dir (limit: 500)`
- DirectoryTree: `/path/to/dir (depth: 2, max: 100)`
- SaveFile: `/path/to/file`
- Think: `Logging thought`
- Skill: `skill-name`

These will be rendered by the TUI as:
- `● Read /path/to/file:5:80`
- `● Edit /path/to/file (2 edits)`
- `● Bash command-here`
- etc.

## Technical Requirements

### Files to Modify
Update the `display()` function in the following tool files to remove `\n>` prefix:

1. `/Users/travisennis/Projects/acai-ts/source/tools/read-file.ts` (line 59)
   - Current: `return "\n> ${style.cyan(providedPath)}..."`
   - Change to: `return "${style.cyan(providedPath)}..."`

2. `/Users/travisennis/Projects/acai-ts/source/tools/edit-file.ts` (line 57)
   - Current: `return "\n> ${style.cyan(path)} (${edits.length} edit...)"`
   - Change to: `return "${style.cyan(path)} (${edits.length} edit...)"`

3. `/Users/travisennis/Projects/acai-ts/source/tools/bash.ts` (line 104)
   - Current: `return "\n> ${style.cyan(command)}"`
   - Change to: `return "${style.cyan(command)}"`

4. `/Users/travisennis/Projects/acai-ts/source/tools/save-file.ts` (line 49)
   - Current: `return "\n> ${style.cyan(path)}"`
   - Change to: `return "${style.cyan(path)}"`

5. `/Users/travisennis/Projects/acai-ts/source/tools/directory-tree.ts` (line 48)
   - Current: `let display = "\n> ${style.cyan(path)}"`
   - Change to: `let display = "${style.cyan(path)}"`

6. `/Users/travisennis/Projects/acai-ts/source/tools/glob.ts` (line 54)
   - Current: `return "\n> ${style.cyan(patternStr)} in ${style.cyan(path)}"`
   - Change to: `return "${style.cyan(patternStr)} in ${style.cyan(path)}"`

7. `/Users/travisennis/Projects/acai-ts/source/tools/ls.ts` (line 42)
   - Current: `return "\n> Listing ${style.cyan(dirPath)} (limit: ${effectiveLimit})"`
   - Change to: `return "${style.cyan(dirPath)} (limit: ${effectiveLimit})"`

8. `/Users/travisennis/Projects/acai-ts/source/tools/think.ts` (line 29)
   - Current: `return "\n> Logging thought"`
   - Change to: `return "Logging thought"`

9. `/Users/travisennis/Projects/acai-ts/source/tools/skill.ts` (line 48)
   - Current: `return style.cyan(skillName)`
   - Change to: `return style.cyan(skillName)` (already correct, no change needed)

10. `/Users/travisennis/Projects/acai-ts/source/tools/dynamic-tool-loader.ts` (line 253)
    - Current: `return "running"`
    - Change to: `return "running"` (already correct, no change needed)

### Key Changes Required
1. **Remove** the `\n>` prefix from all display functions
2. **Do NOT add** the tool name (it's added by `tool-execution.ts`)
3. **Keep** all existing styling and formatting for arguments
4. **Maintain** existing conditional logic for optional parameters

### Code Style Guidelines
- Use TypeScript with ESNext target
- Follow existing code conventions in the project
- Use the `style` module for consistent coloring
- Maintain existing parameter formatting (e.g., `(limit: 500)`, `(2 edits)`)
- Keep the same conditional logic for optional parameters

## Success Criteria
- All tool display functions return only arguments (no tool name, no `>`, no `\n`)
- Display format is consistent across all tools
- Existing styling and formatting is preserved
- No breaking changes to tool functionality

## Testing
After making changes:
1. Run `npm run typecheck` to ensure type correctness
2. Run `npm run lint:fix` to ensure code style compliance
3. Test the TUI to verify tools render correctly
4. Verify all tools display in the new format without the `>` prefix