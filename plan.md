# install-skill CLI Subcommand Implementation Plan

## Overview

Implement a new `install-skill` CLI subcommand that allows users to install skills from GitHub repositories. This will be invoked as `acai install-skill -r owner/repo`, running as a standalone command that performs the action and exits.

## GitHub Issue Reference

- No GitHub issue provided

## Current State Analysis

The acai-ts project currently supports:
- **REPL mode**: `acai` - interactive session with commands like `/init-project`, `/help`
- **CLI mode**: `acai -p "prompt"` - runs single prompt and exits
- **Early exits**: `acai --version`, `acai --help`, `acai --resume`, `acai --continue`

**What's missing:**
- No subcommand pattern (e.g., `acai <subcommand>`)
- No command to install skills from GitHub repositories

**Key file:** `source/index.ts` - Main entry point with argument parsing

## Desired End State

A working `acai install-skill` command that:
1. Accepts `-r/--repo` for GitHub repo (short name `owner/repo` or full URL)
2. Accepts `--skill-path` for optional subdirectory within the repo
3. Prompts user for project vs global installation
4. Shows files to be installed with destination paths
5. Confirms with user before installing
6. Handles skill name conflicts by prompting for new name
7. Exits after completion

### Example Usage:
```bash
acai install-skill -r owner/skill-repo
acai install-skill --repo https://github.com/owner/skill-repo
acai install-skill -r owner/skill-repo --skill-path skills/my-skill
```

### Key Discoveries:
- Skills require `SKILL.md` with valid frontmatter (`source/skills/index.ts:48-88`)
- Skill names must be lowercase alphanumeric with hyphens, matching directory name
- Global skills go to `~/.agents/skills/`, project skills to `.agents/skills/`
- Use `Executor` class for git operations
- Use `select` for interactive prompts

## What We're NOT Doing

- REPL command version (only CLI subcommand)
- Supporting sources other than GitHub
- Automatic skill updates/versioning
- Installing multiple skills from single repo
- Validating skill functionality after installation

## Implementation Approach

**Architecture:** Add subcommand detection in `source/index.ts` before the main flow:
1. Parse arguments normally
2. Check if first positional is a known subcommand
3. If yes, run that subcommand and exit
4. If no, continue with existing REPL/CLI behavior

This approach is extensible for future subcommands.

## Phase 1: Core CLI Subcommand Infrastructure

### Overview
Modify `source/index.ts` to detect and route subcommands.

### Changes Required:

#### 1. Modify source/index.ts
**File**: `source/index.ts`
**Changes**:
- Add import for subcommand handler
- Add subcommand detection after argument parsing (around line 113)
- Create subcommand router function
- Add subcommand options to parseArgs (for help display)

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `acai install-skill --help` shows help
- [ ] Unknown subcommand shows error

---

## Phase 2: Create install-skill Command Module

### Overview
Create the core install-skill implementation.

### Changes Required:

#### 1. Create cli-commands directory
**New Directory**: `source/cli-commands/`

#### 2. Create install-skill command
**New File**: `source/cli-commands/install-skill/index.ts`
- Main command handler function
- Parse `-r/--repo` and `--skill-path` arguments
- Clone repo logic using `Executor`
- Skill discovery from cloned repo
- Project/global prompt
- File preview and confirmation
- Handle skill name conflicts

**New File**: `source/cli-commands/install-skill/utils.ts`
- `parseRepoUrl(input: string): { owner: string; repo: string }`
- `cloneRepo(owner: string, repo: string, targetDir: string): Promise<void>`
- `findSkillInRepo(repoDir: string, skillPath?: string): Promise<string | null>`
- `getSkillName(skillDir: string): Promise<string | null>`
- `getSkillFiles(skillDir: string): Promise<string[]>`
- `validateSkillName(name: string): { valid: boolean; error?: string }`
- `getInstallDestination(skillName: string, scope: "project" | "global"): string`

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Command exists and is callable

---

## Phase 3: Git Clone and Skill Discovery

### Overview
Implement the git clone functionality and skill discovery logic.

### Changes Required:

#### 1. Implement utils.ts functions
- `cloneRepo` using shallow clone (`--depth 1`) for performance
- `findSkillInRepo` to locate SKILL.md in repo or at skill-path
- `getSkillName` to parse frontmatter
- `getSkillFiles` to list skill directory contents
- Error handling for edge cases

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Can clone a valid GitHub repo
- [ ] Error handling for invalid repos
- [ ] Error handling for repos without SKILL.md

---

## Phase 4: User Interaction Flow

### Overview
Implement interactive prompts for installation scope, file preview, and confirmation.

### Changes Required:

#### 1. Extend install-skill/index.ts
- Prompt for project vs global using `select`
- Show file preview: source → destination mapping
- Confirmation prompt before installation
- Skill name conflict detection
- Rename prompt if conflict
- Success message with next steps

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Prompts user for installation scope
- [ ] Shows file list before installing
- [ ] Confirms before making changes
- [ ] Handles skill name conflicts

---

## Phase 5: Help Text Update

### Overview
Update help text to include the new subcommand.

### Changes Required:

#### 1. Modify source/index.ts
**File**: `source/index.ts`
**Changes**: Update `helpText` constant to include subcommand

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] `acai --help` shows install-skill

---

## Phase 6: Documentation

### Overview
Update architecture and README documentation.

### Changes Required:

#### 1. Modify ARCHITECTURE.md
- Add `source/cli-commands/` to project structure
- Document CLI subcommand pattern

#### 2. Modify README.md
- Add `install-skill` to command list with description

### Success Criteria:

#### Automated Verification:
- [ ] Full check passes: `npm run check`

---

## Testing Strategy

### Unit Tests:
- Test `parseRepoUrl` with various inputs:
  - Short name: `owner/repo`
  - Full URL: `https://github.com/owner/repo`
  - Full URL with .git: `https://github.com/owner/repo.git`
  - Invalid inputs
- Test `validateSkillName`:
  - Valid names
  - Invalid characters
  - Wrong length
  - Doesn't match directory

### Integration Tests:
- Test full flow with test GitHub repo
- Test error handling for network failures
- Test error handling for permission errors

### Manual Testing Steps:
1. Run `acai install-skill -r owner/repo` and verify clone
2. Run with `--skill-path` argument
3. Choose project installation, verify `.agents/skills/`
4. Choose global installation, verify `~/.agents/skills/`
5. Try installing same skill again, verify conflict prompt
6. Provide new name, verify rename works

## Performance Considerations

- Use shallow clone: `git clone --depth 1`
- Clean up temp directory after installation

## Migration Notes

No migration needed - this is a new feature.

## References

- Current argument parsing: `source/index.ts:87-113`
- Executor for git: `source/execution/index.ts`
- User prompts: `source/terminal/select-prompt.ts`
- Skills loading: `source/skills/index.ts:280-310`
- Skill validation: `source/skills/index.ts:38-88`
