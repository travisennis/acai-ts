---
name: "Context File Specification"
description: "Guidelines for writing effective context files that work within acai's constraints"
---
# Context File Specification

## Overview

Context files provide background information for specific subtasks. They are markdown files with YAML frontmatter that contain domain knowledge, project architecture, team conventions, or other informational content.

### Context vs Skills
- **Skills**: "How to do X" (procedural instructions)
- **Context**: "Background about X" (informational content)

**Example:**
- **Skill**: "How to add an OpenRouter model"
- **Context**: "Project architecture overview"

## File Structure

### Required Location
```
.acai/context/              # Project context (overrides user context)
  ├── topic-name.md
  └── subdirectory/
      └── nested-topic.md

~/.acai/context/            # User context (global)
  └── global-topic.md
```

### File Format
```markdown
---
name: "Descriptive Name"
description: "Brief description shown in system prompt"
---
# Topic Title

## Section 1
Content here...

## Section 2
More content...
```

### Frontmatter Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `name` | No | Display name (defaults to filename) | `"Git Commit Workflow"` |
| `description` | **Yes** | Brief description shown in prompt | `"Guidelines for committing code with proper Git practices"` |

## Content Guidelines

### What to Include
- **Project-specific knowledge**: Architecture, conventions, domain logic
- **Team practices**: Coding standards, review processes, workflows
- **Technical context**: System dependencies, integration points, constraints
- **Historical context**: Why decisions were made, past issues/solutions
- **Reference information**: API endpoints, data models, configuration options

### What to Avoid
- **Procedural instructions**: Use skills for "how-to" guides
- **Secrets/credentials**: Never include API keys, passwords, tokens
- **Large code blocks**: Reference files instead of embedding large code
- **Outdated information**: Keep context files current with project
- **Opinionated content**: Stick to factual, project-specific information

## Technical Constraints

### acai Execution Environment
Context files are loaded and read by the AI agent within acai's execution environment, which has specific constraints:

#### ✅ Supported
- Reading files with `readFile` tool
- Executing non-interactive shell commands
- Processing structured data (JSON, YAML)
- Following logical workflows

#### ❌ Not Supported
- **Interactive commands**: No `git add -p`, `gh pr create` (without args)
- **Browser operations**: No `--web` flags, GUI applications
- **Real-time user input**: No prompts, confirmations, dialogs
- **Visual operations**: No screenshots, image processing

### Command Examples

#### Good (Non-interactive)
```bash
# Git - explicit commands
git add src/components/
git commit -m "feat(components): add button"
git push -u origin feat/branch

# GitHub CLI - with arguments
gh pr create --title "feat: description" --body "PR details"
gh pr view 123 --json title,body,state

# File operations
echo "content" > file.txt
cat config.json | jq '.settings'
```

#### Bad (Interactive)
```bash
# Opens editor - NOT SUPPORTED
git commit

# Interactive staging - NOT SUPPORTED  
git add -p

# Opens browser - NOT SUPPORTED
gh pr view 123 --web

# Requires user input - NOT SUPPORTED
npm init
```

## Writing Effective Context

### Structure Recommendations
1. **Start with overview**: What this context covers and why it matters
2. **Use clear headings**: Hierarchical sections for scanability
3. **Include examples**: Concrete examples illustrate concepts
4. **Reference related files**: Point to source code or documentation
5. **Keep it current**: Update when project changes

### Tone and Style
- **Concise but complete**: Balance detail with readability
- **Objective tone**: Stick to facts, avoid opinion
- **Active voice**: "The system processes requests" not "Requests are processed"
- **Present tense**: Describe current state, not historical narrative

### Formatting Tips
- Use **bold** for key terms
- Use `code` for commands, paths, identifiers
- Use lists for steps or options
- Use tables for comparisons or specifications
- Limit line length to 80 characters for readability

## Example Context Files

### Good Example: Project Architecture
```markdown
---
name: "Project Architecture"
description: "Overview of acai-ts architecture and key components"
---
# acai-ts Architecture

## Core Components
1. **Agent System**: Main AI agent with tool execution
2. **Model Providers**: Abstraction for multiple AI APIs
3. **Tool System**: Modular tools for file operations, bash, web search

## Key Directories
- `source/`: Main TypeScript source code
- `source/tools/`: Tool implementations
- `.acai/`: Configuration and user data

## Design Patterns
- Uses ES Modules with `.ts` extensions
- Follows Biome formatting rules
- TypeScript strict mode enabled
```

### Bad Example: Vague or Procedural
```markdown
---
name: "Stuff about the project"
description: "Various things"
---
# Some Notes

The project does things in certain ways because we decided to.

To set up the project:
1. Run some commands
2. Edit some files
3. Hope it works

Remember to commit often!
```

## Organization Strategies

### By Domain
```
.acai/context/
├── architecture.md
├── development.md
├── deployment.md
└── team/
    ├── conventions.md
    └── workflows.md
```

### By Component
```
.acai/context/
├── frontend.md
├── backend.md
├── database.md
└── infrastructure.md
```

### By Role
```
.acai/context/
├── onboarding.md
├── contributor.md
├── maintainer.md
└── reviewer.md
```

## Maintenance

### Versioning
Consider including version information:
```markdown
---
name: "API Documentation"
description: "REST API endpoints and specifications"
version: "2.1.0"
last_updated: "2024-12-18"
---
```

### Update Process
1. **Review periodically**: Check for outdated information
2. **Link to source**: Reference source files that define behavior
3. **Remove obsolete**: Delete or archive unused context files
4. **Validate commands**: Test that example commands still work

### Integration with Project
- Add context review to PR checklist
- Include context updates in release notes
- Train team members on context usage
- Monitor agent usage of context files

## Testing Context Files

### Validation Checklist
- [ ] Frontmatter includes `description`
- [ ] No interactive commands
- [ ] No secrets or credentials
- [ ] Content is current and accurate
- [ ] Examples are executable in acai
- [ ] Formatting is consistent
- [ ] Links/references are valid

### Testing with acai
```bash
# Check if context loads
acai -p "What context files are available?"

# Test specific context
acai -p "Explain the project architecture"
```

## Common Patterns

### Reference Documentation
```markdown
## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |

See `source/api/users.ts` for implementation.
```

### Decision Records
```markdown
## Database Choice

**Decision**: Use PostgreSQL over MySQL

**Reason**: Better JSON support, transactional DDL

**Date**: 2024-01-15

**Alternatives Considered**:
- MySQL: Limited JSON features
- SQLite: Not suitable for production scale
```

### Workflow Documentation
```markdown
## Code Review Process

1. **Create PR**: Follow PR template in `.github/`
2. **Request Review**: Assign 2+ reviewers
3. **Address Feedback**: Update PR within 48 hours
4. **Merge**: After all checks pass and approvals

**Quality Gates**:
- All tests pass
- Linting passes
- No decrease in test coverage
```

## Troubleshooting

### Context Not Appearing
- Check file is in `.acai/context/` directory
- Verify frontmatter has `description` field
- Ensure file has `.md` extension
- Check for syntax errors in frontmatter

### Agent Not Reading Context
- Context may not be relevant to current task
- Agent decides when to read context files
- Ensure description accurately reflects content
- Consider splitting into more specific contexts

### Outdated Information
- Set calendar reminders to review contexts
- Link to source files that define behavior
- Include version or last updated date
- Remove or archive obsolete contexts

## Best Practices Summary

1. **Be specific**: Focus on one domain or topic per file
2. **Be accurate**: Keep information current with project
3. **Be practical**: Include actionable, relevant information
4. **Be concise**: Balance detail with readability
5. **Be compatible**: Follow acai's technical constraints
6. **Be organized**: Use clear structure and formatting
7. **Be maintainable**: Design for easy updates
8. **Be discoverable**: Use descriptive names and descriptions

By following these guidelines, you can create context files that effectively enhance the agent's understanding of your project while working within acai's execution constraints.