---
name: "Git Commit Workflow"
description: "Detailed guidelines for committing code with proper Git practices and conventional commits"
---
# Git Commit Workflow Guidelines

## Core Principles

1. **Atomic Commits**: Each commit should represent a single logical change
2. **Descriptive Messages**: Commit messages should explain *why* the change was made, not just *what* changed
3. **Clean History**: Maintain a linear, readable history that tells the story of the project
4. **Safety First**: Never force push to shared branches, never amend published commits

## Conventional Commits Format

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Purpose | Example |
|------|---------|---------|
| `feat` | A new feature | `feat(auth): add OAuth2 login support` |
| `fix` | A bug fix | `fix(api): handle null response in user endpoint` |
| `docs` | Documentation changes | `docs(readme): update installation instructions` |
| `style` | Code style changes (formatting, missing semicolons) | `style(lint): fix indentation in config files` |
| `refactor` | Code refactoring (no behavior change) | `refactor(utils): extract validation logic` |
| `perf` | Performance improvements | `perf(db): add index to users.email column` |
| `test` | Adding or updating tests | `test(api): add unit tests for auth middleware` |
| `build` | Build system or external dependencies | `build(deps): update TypeScript to 5.5` |
| `ci` | CI configuration changes | `ci(github): add automated release workflow` |
| `chore` | Maintenance tasks | `chore: update license year` |
| `revert` | Revert a previous commit | `revert: "feat(auth): add OAuth2 login"` |

### Scope (Optional)
- Should be a noun describing the module/component
- Use kebab-case: `api`, `ui-components`, `database`
- Keep it concise and consistent

### Description
- Use imperative mood: "add" not "added" or "adds"
- First letter lowercase, no period at end
- Max 72 characters
- Be specific: "fix memory leak in image processing" not "fix bug"

### Body (Optional)
- Separate from description with blank line
- Explain *what* and *why*, not *how* (code shows how)
- Wrap at 72 characters
- Use bullet points for multiple changes

### Footer (Optional)
- Reference issues: `Fixes #123`, `Closes #456`
- Breaking changes: `BREAKING CHANGE: API response format changed`
- Co-authors: `Co-authored-by: Name <email>`

## Branch Naming Convention

```
<type>/<short-description>
```

Examples:
- `feat/user-authentication`
- `fix/login-error-handling`
- `docs/api-reference`
- `refactor/data-models`

Rules:
- Use kebab-case
- Keep description under 3-4 words
- Be descriptive but concise
- No special characters except hyphens

## Commit Process

### 1. Check Status
```bash
git status
git diff --staged  # Review staged changes
```

### 2. Stage Changes Selectively
```bash
# Stage specific files
git add path/to/file.ts

# Stage all changes in specific directory
git add src/components/

# NEVER use git add -A for feature commits
# Only use git add -A for chore/maintenance commits

# Note: git add -p (interactive staging) is not supported
# Instead, stage files individually or by directory
# For unrelated changes, create separate commits
```

### 3. Verify Changes
```bash
# See what will be committed
git diff --cached

# Run tests if applicable
npm test
```

### 4. Commit with Message
```bash
# Simple commit
git commit -m "feat(auth): add password reset functionality"
```

### 5. Push to Remote
```bash
# First push for new branch
git push -u origin feat/user-authentication

# Subsequent pushes
git push
```

## Common Scenarios

### Multiple Related Changes
If you have multiple related changes that belong together:
1. Stage all related files
2. Write a comprehensive commit message covering all changes
3. Use bullet points in body if needed

### Unrelated Changes
If you have unrelated changes:
1. Stage and commit changes in logical groups
2. Create multiple commits with clear, distinct messages
3. For completely unrelated changes, consider separate feature branches

### Fixing Previous Commit
```bash
# If not pushed yet
git commit --amend

# If you need to add more changes
git add .
git commit --amend --no-edit  # Keep same message
```

### Splitting a Large Commit
```bash
# Reset but keep changes
git reset HEAD~1

# Stage files in logical groups and commit
git add src/components/  # First group
git commit -m "feat(components): add new button components"

git add src/utils/       # Second group
git commit -m "refactor(utils): extract validation helpers"

# Or stage specific files
git add file1.ts file2.ts
git commit -m "fix(api): handle edge cases in endpoints"
```

## Rules to Follow

### ✅ DO
- Write descriptive commit messages
- Use conventional commit format
- Keep commits atomic and focused
- Test before committing
- Review staged changes with `git diff --cached`
- Push feature branches regularly
- Rebase on main before creating PR

### ❌ DON'T
- Commit debugging code or console.log statements
- Commit large binary files
- Use vague messages like "fix stuff" or "update"
- Commit directly to main/master
- Force push to shared branches
- Commit secrets or credentials
- Squash commits that tell a logical story

## PR Preparation

1. **Rebase on main**: `git rebase main`
2. **Run tests**: Ensure all tests pass
3. **Check linting**: `npm run lint`
4. **Verify commit history**: `git log --oneline`
5. **Push clean branch**: Ready for review

## Example Commit Messages

### Good Examples
```
feat(api): add pagination to user list endpoint

- Implement cursor-based pagination for better performance
- Add pagination metadata to response
- Update API documentation

Closes #123
```

```
fix(ui): correct button alignment in mobile view

The submit button was overlapping with the input field on
mobile devices. Adjusted CSS flex properties to ensure
proper spacing.

Fixes #456
```

```
docs: update contributing guidelines

- Add commit message conventions
- Include PR template reference
- Clarify code review process
```

### Bad Examples
```
update
```
```
fix bug
```
```
changes
```
```
wip: still working on this
```

## Integration with Project

This project uses:
- **Commitlint**: Validates commit messages against conventional commits
- **Husky**: Git hooks for pre-commit and commit-msg validation
- **Semantic Release**: Automated versioning based on commit types

Always run `npm run lint` and `npm test` before committing to ensure code quality.
