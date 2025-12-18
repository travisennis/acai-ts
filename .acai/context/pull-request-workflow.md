---
name: "Pull Request Workflow"
description: "Guidelines for creating, managing, and reviewing pull requests with or without templates"
---
# Pull Request Workflow Guidelines

## Overview

A Pull Request (PR) is a proposal to merge changes from one branch into another. It serves as:
1. **Code review mechanism** - Get feedback on changes
2. **Quality gate** - Ensure code meets standards
3. **Documentation** - Record why changes were made
4. **Collaboration tool** - Discuss implementation details

## PR Creation Process

### 1. Pre-PR Checklist
Before creating a PR, ensure:
- [ ] Code compiles without errors
- [ ] All tests pass
- [ ] Linting passes
- [ ] Commit history is clean and logical
- [ ] Branch is rebased on target branch (usually `main`/`master`)
- [ ] Changes are focused and address a single issue/feature

### 2. Creating the PR

#### Using GitHub CLI (`gh`)
```bash
# Create PR with specific title and body
git push -u origin feat/oauth-support  # Push branch first
gh pr create --title "feat(auth): add OAuth2 support" --body "Implements OAuth2 authentication flow"

# Create PR from file (preferred for detailed descriptions)
echo "## What does this PR do?\n\nImplements OAuth2 authentication flow\n\n## Why is this change needed?\n\nTo support third-party login providers" > pr-description.md
gh pr create --title "feat(auth): add OAuth2 support" --body-file pr-description.md

# Add reviewers
gh pr create --title "feat(auth): add OAuth2 support" --body "Implements OAuth2 authentication" --reviewer username1,username2

# Link to issue
gh pr create --title "feat(auth): add OAuth2 support" --body "Implements OAuth2 authentication" --issue 123
```

#### Using Git
```bash
# Push branch to remote
git push -u origin feat/oauth-support

# Then create PR via GitHub/GitLab web interface
```

### 3. PR Title Convention
Follow the same convention as commit messages:
```
<type>[scope]: <description>
```

Examples:
- `feat(auth): add OAuth2 login support`
- `fix(api): handle null response in user endpoint`
- `docs: update installation instructions`

## PR Content Requirements

### Essential Elements
1. **Clear Title** - Describes what the PR does
2. **Description** - Explains *why* the change is needed
3. **Related Issues** - Links to tickets or issues
4. **Testing Instructions** - How to verify the changes work
5. **Screenshots/Recordings** - For UI changes
6. **Checklist** - Tasks completed/remaining

### PR Description Template
```
## What does this PR do?
[Brief description of changes]

## Why is this change needed?
[Problem being solved, context, business value]

## How was it tested?
[Test scenarios, manual testing steps, automated tests]

## Screenshots/Recordings (if applicable)
[For UI changes]

## Checklist
- [ ] Code compiles
- [ ] Tests pass
- [ ] Linting passes
- [ ] Documentation updated
- [ ] No breaking changes

## Related Issues
Closes #123
Fixes #456
```

## Working with PR Templates

### If Project Has PR Templates
PR templates are usually found in:
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/PULL_REQUEST_TEMPLATE/` (directory with multiple templates)
- `docs/pull_request_template.md`

#### How to Use Templates:
1. **Automatic**: When creating PR via GitHub web interface, template auto-fills
2. **Manual**: Copy template structure and fill in details
3. **Multiple Templates**: Choose appropriate template for type of change

#### Common Template Sections:
- **Description** - What and why
- **Type of Change** - Bug fix, feature, refactor, etc.
- **Testing** - How changes were verified
- **Checklist** - Quality gates
- **Screenshots** - Visual changes
- **Notes** - Additional context

### If No PR Template Exists

#### Option 1: Use Standard Structure
Follow the essential elements listed above. Create your own structured description.

#### Option 2: Check for Similar PRs
Look at recently merged PRs in the project to understand expected format:
```bash
# View recent PRs
gh pr list --state merged --limit 5

# View a specific PR details (non-interactive)
gh pr view 123 --json title,body,state,url
```

#### Option 3: Create Minimal PR
When in doubt, include at minimum:
- What changed
- Why it changed
- How to test it

## PR Size Guidelines

### Small PRs (Preferred)
- 1-5 files changed
- < 200 lines of code
- Single logical change
- **Advantages**: Faster review, easier to understand, less risk

### Medium PRs
- 5-15 files changed
- 200-500 lines of code
- Related set of changes
- **Consider**: Split if possible

### Large PRs (Avoid if possible)
- 15+ files changed
- 500+ lines of code
- Multiple features/fixes
- **Required**: Detailed description, clear structure, consider splitting

## Review Process

### As PR Author
1. **Request Reviewers**: Add appropriate team members
2. **Respond Promptly**: Address review comments quickly
3. **Keep Updated**: Rebase on target branch if conflicts arise
4. **Be Open to Feedback**: Treat reviews as collaboration, not criticism

### Review Checklist for Authors
Before requesting review:
- [ ] PR title follows convention
- [ ] Description is complete and clear
- [ ] All CI checks pass
- [ ] No merge conflicts
- [ ] Changes are minimal and focused
- [ ] Tests cover new functionality
- [ ] Documentation is updated

### As Reviewer
1. **Timely Response**: Review within agreed timeframe (usually 1-2 days)
2. **Constructive Feedback**: Focus on code, not coder
3. **Check Understanding**: Ensure you understand the changes
4. **Test Locally**: If changes are complex, pull branch and test
5. **Approve with Confidence**: Only approve if you'd be comfortable deploying

## PR States and Transitions

### Common States
1. **Draft**: Work in progress, not ready for review
2. **Open**: Ready for review
3. **Changes Requested**: Reviewer requested modifications
4. **Approved**: Ready to merge
5. **Merged**: Successfully integrated
6. **Closed**: Not merged (rejected or superseded)

### Creating Draft PRs
```bash
# GitHub CLI
gh pr create --draft

# Useful for:
- Early feedback on approach
- Linking to ongoing work
- CI checks on feature branches
```

## CI/CD Integration

### Common Checks
1. **Build Status**: Code compiles successfully
2. **Test Results**: All tests pass
3. **Linting**: Code style meets standards
4. **Security Scans**: No vulnerabilities introduced
5. **Coverage**: Test coverage maintained

### If Checks Fail
1. **Investigate**: Determine cause of failure
2. **Fix Locally**: Reproduce and fix issues
3. **Push Fixes**: Update PR with corrections
4. **Re-run**: Trigger CI checks again

## Merging Strategies

### Merge Commit
```
git merge --no-ff feature-branch
```
- **Pros**: Preserves branch history, clear merge point
- **Cons**: Creates extra commit, can clutter history

### Squash and Merge
```
git merge --squash feature-branch
```
- **Pros**: Clean history, single commit
- **Cons**: Loses individual commit context

### Rebase and Merge
```
git rebase main
git merge --ff-only feature-branch
```
- **Pros**: Linear history, no merge commits
- **Cons**: Rewrites history (dangerous for shared branches)

### Project Conventions
Check project documentation for preferred merge strategy:
- Look for `CONTRIBUTING.md`
- Check recently merged PRs
- Ask maintainers if unsure

## Post-Merge Cleanup

### After PR is Merged
1. **Delete Remote Branch** (optional):
   ```bash
   git push origin --delete feat/oauth-support
   ```

2. **Delete Local Branch**:
   ```bash
   git branch -d feat/oauth-support
   ```

3. **Update Local Main**:
   ```bash
   git checkout main
   git pull origin main
   ```

### Keeping Branches
Consider keeping branches for:
- Hotfixes that might need backporting
- Features with follow-up work planned
- Reference for similar future work

## Special Cases

### Hotfix PRs
- **Priority**: High urgency
- **Description**: Clearly state impact and urgency
- **Testing**: Emphasize regression testing
- **Review**: Request expedited review

### Documentation PRs
- **Scope**: Focus on clarity and accuracy
- **Review**: Technical accuracy + readability
- **Testing**: Verify links, code examples

### Dependency Updates
- **Justification**: Why update is needed (security, features, bugs)
- **Testing**: Impact assessment
- **Rollback Plan**: If issues arise

## Best Practices

### ✅ DO
- Write clear, descriptive titles and descriptions
- Keep PRs small and focused
- Link to related issues/tickets
- Include testing instructions
- Request appropriate reviewers
- Respond promptly to feedback
- Keep branch updated with target
- Celebrate merged PRs! 🎉

### ❌ DON'T
- Create massive, multi-feature PRs
- Use vague titles like "Update" or "Fix stuff"
- Forget to update documentation
- Ignore CI failures
- Merge your own PR without review (unless project allows)
- Force push to shared PR branches
- Take review feedback personally

## Integration with Git Commit Workflow

This PR workflow complements the Git commit workflow:
1. **Commits** tell the story of *how* changes were made
2. **PR** tells the story of *why* changes were made and *what* they accomplish

### Combined Workflow Example
1. Create feature branch: `git checkout -b feat/oauth-support`
2. Make atomic commits with conventional messages
3. Push branch: `git push -u origin feat/oauth-support`
4. Create PR with detailed description
5. Address review feedback with additional commits
6. Rebase/squash as needed
7. Merge when approved
8. Clean up branches

## Project-Specific Notes

For this project (acai-ts):
- **PR Templates**: Check `.github/PULL_REQUEST_TEMPLATE.md` if exists
- **Reviewers**: Default reviewers may be configured in GitHub
- **CI**: Runs `npm test`, `npm run lint`, `npm run typecheck`
- **Merge Strategy**: Check project conventions or ask maintainers

When working on other projects, adapt to their specific workflows and conventions.