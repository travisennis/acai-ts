# Skills System

Acai includes a skills system that allows you to create and use specialized instruction files for specific tasks. Skills are markdown files with YAML frontmatter that provide detailed instructions for particular domains (e.g., database migrations, PDF extraction, code review).

## How Skills Work

1. **Discovery**: At startup, Acai scans multiple locations for skills
2. **Listing**: Available skills are listed in the system prompt
3. **On-demand loading**: When a task matches a skill's description, the agent uses the `read` tool to load the skill file
4. **Execution**: The agent follows the instructions in the skill file

## Skill File Format

Skills are markdown files named `SKILL.md` with YAML frontmatter:

```markdown
---
name: pdf-extract
description: Extract text and tables from PDF files
user-invocable: true              # Register as /pdf-extract slash command (default: false)
disable-model-invocation: false   # Hide from AI model (default: false)
---

# PDF Processing Instructions

1. Use `pdftotext` to extract plain text
2. For tables, use `tabula-py` or similar
3. Always verify extraction quality

Scripts are in: ./scripts/
Configuration: ./config.json
```

### Invocation Modes

| `user-invocable` | `disable-model-invocation` | Behavior |
|---|---|---|
| `true` | `false` | Both user (slash command) and model can use |
| `false` | `false` | Only model can auto-invoke (default) |
| `true` | `true` | Only user can use via slash command |
| `false` | `true` | Documentation only |

## Skill Locations

Skills are loaded from these locations (later sources override earlier ones):

1. `~/.codex/skills/**/SKILL.md` (Codex CLI user skills)
2. `~/.claude/skills/*/SKILL.md` (Claude Code user skills)
3. `<cwd>/.claude/skills/*/SKILL.md` (Claude Code project skills)
4. `~/.agents/skills/**/SKILL.md` (User skills)
5. `<cwd>/.agents/skills/**/SKILL.md` (Project skills)

## Directory Structure

Skills can be organized hierarchically with colon-separated names:

```
~/.agents/skills/
├── pdf-extract/
│   ├── SKILL.md           # Becomes "pdf-extract" skill
│   └── scripts/           # Optional: supporting files
├── db/
│   └── migrate/
│       └── SKILL.md       # Becomes "db:migrate" skill
└── aws/
    └── s3/
        └── upload/
            └── SKILL.md   # Becomes "aws:s3:upload" skill
```

## Skill Arguments

User-invocable skills are registered as slash commands and support argument placeholders:

### All arguments with `$ARGUMENTS`

The `$ARGUMENTS` placeholder captures all arguments passed to the command:

```
> /fix-issue 123 high-priority
# $ARGUMENTS becomes: "123 high-priority"
```

### Individual arguments with `$1`, `$2`, `$3`, etc.

Access specific arguments individually using positional parameters:

```
> /review-pr 456 high alice
# $1 becomes "456", $2 becomes "high", $3 becomes "alice"
```

### Backward compatibility with `{{INPUT}}`

The `{{INPUT}}` placeholder works the same as `$ARGUMENTS`:

```
> /analyze src/file.ts
# {{INPUT}} becomes: "src/file.ts"
```

## Compatibility

Acai's skills system is compatible with:
- **Pi Native Format**: `~/.agents/skills/**/SKILL.md` (recursive, colon-separated paths)
- **Claude Code Format**: `~/.claude/skills/*/SKILL.md` (single level only)
- **Codex CLI Format**: `~/.codex/skills/**/SKILL.md` (recursive, simple names)

## Configuration

Skills are enabled by default. You can disable them via:

1. **CLI flag**: `acai --no-skills`
2. **Settings file**: Add to `~/.acai/acai.json` or `.acai/acai.json`:
   ```json
   {
     "skills": {
       "enabled": false
     }
   }
   ```

## Usage Example

1. **Agent startup**: Scans all skill locations
2. **System prompt**: Lists available skills
3. **User request**: "Extract text from this PDF"
4. **Agent matches**: Sees "pdf-extract: Extract text and tables from PDF files"
5. **Skill loading**: Uses `read` tool to load `~/.agents/skills/pdf-extract/SKILL.md`
6. **Execution**: Follows instructions in skill file (run scripts from this file's directory)
