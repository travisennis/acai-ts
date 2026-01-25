# Unify Prompts and Skills

## Overview

Convert all prompts to skills and introduce frontmatter flags to control invocation behavior. This creates a unified system where everything is a skill, with fine-grained control over user and model invocation.

## Current State

- **Prompts**: Stored as `.md` files, only accessible via slash commands
- **Skills**: Stored as directories with `skill.md`, only accessible via Skill tool
- Separate loading mechanisms and code paths

## Goal

- Single format (skills) for all capabilities
- Fine-grained invocation control via frontmatter
- Cleaner architecture with one loading path

## Implementation

### 1. Update Skill Interfaces

**File**: `source/skills.ts`

Add new frontmatter fields:

```typescript
interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
  "user-invocable"?: boolean;  // default: true
  "disable-model-invocation"?: boolean;  // default: false
}

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
}
```

### 2. Create SkillManager

**File**: `source/skills/manager.ts` (new)

```typescript
export class SkillManager {
  private skills: Map<string, Skill>;

  constructor() {
    this.skills = new Map();
  }

  async loadAll(): Promise<void> {
    // Load from ~/.acai/skills/ and .acai/skills/
    // Populate this.skills map
  }

  getUserInvocableSkills(): Skill[] {
    return Array.from(this.skills.values())
      .filter(s => s.userInvocable);
  }

  getModelInvocableSkills(): Skill[] {
    return Array.from(this.skills.values())
      .filter(s => !s.disableModelInvocation);
  }

  async getSlashCommands(): Promise<SlashCommand[]> {
    return this.getUserInvocableSkills().map(skill => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  findSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }
}
```

### 3. Update CommandManager

**File**: `source/commands/manager.ts`

- Remove `loadPrompts` import
- Import `SkillManager`
- Remove `/prompt` command registration
- Replace prompt subcommand logic with SkillManager:

```typescript
const skillManager = new SkillManager();
await skillManager.loadAll();

// Register all user-invocable skills as slash commands
for (const skill of skillManager.getUserInvocableSkills()) {
  this.commands.set(`/${skill.name}`, {
    command: `/${skill.name}`,
    description: skill.description,
    getSubCommands: () => Promise.resolve([]),
    handle: async (args, options) => {
      // Load skill content and set as prompt
      const content = await readFile(skill.filePath, 'utf8');
      const parsed = parseFrontMatter(content);
      promptManager.set(parsed.body);
      return 'use';
    },
  });
}
```

### 4. Update Skill Tool

**File**: `source/tools/skill.ts`

- Use `SkillManager` instead of `loadSkills()`
- Filter to only model-invocable skills
- Update description to reflect new behavior

### 5. Update System Prompt

**File**: `source/prompts.ts`

- Replace `loadSkills()` with `SkillManager`
- Only include model-invocable skills in skills section

### 6. Create Migration Command

**File**: `source/commands/migrate-prompts/index.ts` (new)

Convert all prompts to skills with `disable-model-invocation: true`:

```typescript
export const migratePromptsCommand = (options: CommandOptions): ReplCommand => ({
  command: "/migrate-prompts",
  description: "Convert all prompts to skills. Prompts become user-only skills.",

  async handle(args, { tui, container, editor }) {
    // Migrate user prompts from ~/.acai/prompts/ to ~/.acai/skills/
    // Migrate project prompts from .acai/prompts/ to .acai/skills/
    // Add disable-model-invocation: true to frontmatter
    // Delete original prompt files
    return "continue";
  }
});
```

### 7. Update Help Command

**File**: `source/commands/help/index.ts`

- Filter to only show user-invocable skills
- Model-only skills should not appear in help

### 8. Remove Deprecated Code

**Delete files:**
- `source/commands/prompt/index.ts`
- `source/prompts/manager.ts` (if only used for prompts)

**Update imports:**
- Remove `loadPrompts` from any files
- Remove `PromptManager` if only used for prompts

### 9. Update Tests

- Delete or convert `test/commands/prompt-command.test.ts`
- Add tests for new frontmatter fields in `test/skills.test.ts`
- Create `test/commands/migrate-prompts.test.ts`

### 10. Update Documentation

- `README.md`: Remove `/prompt` command, add `/migrate-prompts`
- `ARCHITECTURE.md`: Update to reflect skills-only architecture

## Frontmatter Behavior Matrix

| `user-invocable` | `disable-model-invocation` | Slash Command | Skill Tool |
|-----------------|---------------------------|---------------|------------|
| `true` (default) | `false` (default) | ✅ | ✅ |
| `true` | `true` | ✅ | ❌ |
| `false` | `false` | ❌ | ✅ |
| `false` | `true` | ❌ | ❌ (useless) |

## Use Cases

**User-only prompts** (converted from prompts):
```yaml
---
name: refactor
description: Refactor code for better readability and maintainability
disable-model-invocation: true
---
```

**Dual-use skills**:
```yaml
---
name: code-review
description: Review code for best practices, security, and performance
user-invocable: true
disable-model-invocation: false
---
```

**Model-only tools**:
```yaml
---
name: internal-analyzer
description: Internal tool for deep code analysis
user-invocable: false
disable-model-invocation: false
---
```

## Implementation Order

1. Update `source/skills.ts` interfaces
2. Create `source/skills/manager.ts`
3. Update `source/commands/manager.ts` to use SkillManager
4. Update `source/tools/skill.ts` to use SkillManager
5. Update `source/prompts.ts` to use SkillManager
6. Create `source/commands/migrate-prompts/index.ts`
7. Update `source/commands/help/index.ts` to filter skills
8. Delete deprecated files
9. Update tests
10. Update documentation

## Verification Steps

1. Run `/migrate-prompts` to convert existing prompts
2. Verify converted prompts work as slash commands
3. Verify model can't invoke user-only skills
4. Verify model can invoke dual-use skills
5. Verify help only shows user-invocable skills
6. Run full test suite