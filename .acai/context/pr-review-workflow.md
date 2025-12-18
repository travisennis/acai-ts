---
name: "PR Review Workflow"
description: "Guidelines for conducting effective pull request reviews with constructive feedback"
---
# PR Review Workflow

## Overview

PR reviews are a critical quality gate that ensures code correctness, maintainability, and alignment with project standards. Effective reviews balance thoroughness with efficiency.

### Review Goals
1. **Ensure correctness**: Code works as intended
2. **Maintain quality**: Follows project standards and patterns
3. **Share knowledge**: Educate and learn from each other
4. **Prevent issues**: Catch bugs, security issues, performance problems
5. **Improve design**: Suggest better approaches when appropriate

## Review Process

### 1. Pre-Review Preparation

#### Check PR Status
```bash
# View PR details
gh pr view <pr-number> --json title,body,state,author,additions,deletions,files

# Check CI status
gh pr checks <pr-number>

# View changed files
gh pr diff <pr-number> | head -100  # Preview changes
```

#### Understand Context
- Read PR title and description
- Check linked issues (`Closes #123`, `Fixes #456`)
- Review any discussion comments
- Understand the problem being solved

### 2. Initial Assessment

#### PR Quality Checklist
- [ ] **Title**: Follows conventional commit format
- [ ] **Description**: Clear explanation of what and why
- [ ] **Size**: Appropriate (small/medium preferred)
- [ ] **Scope**: Focused on single issue/feature
- [ ] **Tests**: Included for new functionality
- [ ] **Documentation**: Updated if needed

#### Decision Points
- **Approve**: Changes meet all standards
- **Request Changes**: Issues need addressing
- **Comment**: Questions or suggestions without blocking
- **Close**: PR doesn't align with project direction

### 3. Code Review

#### Review in Browser (When Available)
```bash
# Get PR URL for manual review
gh pr view <pr-number> --json url | jq -r '.url'
```

#### Review Locally (Thorough Review)
```bash
# Checkout PR branch
gh pr checkout <pr-number>

# Run tests
npm test

# Check linting
npm run lint

# Build to verify compilation
npm run build

# Return to original branch
git checkout main
```

## What to Review

### Code Quality
- **Readability**: Clear variable names, consistent style
- **Simplicity**: No unnecessary complexity
- **Modularity**: Proper separation of concerns
- **Error handling**: Graceful failure, proper logging
- **Performance**: Efficient algorithms, no obvious bottlenecks

### Testing
- **Coverage**: New code has appropriate tests
- **Quality**: Tests are meaningful, not just coverage
- **Edge cases**: Boundary conditions tested
- **Integration**: Tests work with existing code

### Security
- **Input validation**: User inputs are sanitized
- **Authentication/Authorization**: Proper access controls
- **Secrets**: No hardcoded credentials
- **Dependencies**: No known vulnerabilities

### Architecture & Design
- **Patterns**: Follows project conventions
- **Dependencies**: Appropriate abstractions
- **Scalability**: Won't cause issues at scale
- **Maintainability**: Easy to understand and modify

### Documentation
- **Code comments**: Explain why, not what
- **API docs**: Updated if public APIs change
- **README/guides**: Updated if user-facing changes
- **Changelog**: Updated for user-visible changes

## Providing Feedback

### Feedback Principles
1. **Be constructive**: Focus on improving code, not criticizing coder
2. **Be specific**: Point to exact lines, suggest concrete changes
3. **Be objective**: Reference standards, not personal preferences
4. **Be timely**: Review within agreed timeframe (usually 1-2 days)
5. **Be collaborative**: Treat as discussion, not judgment

### Feedback Templates

#### Requesting Changes
```
**Requesting changes** for the following reasons:

### Issues Found
1. **Security concern**: [Describe issue and suggestion]
2. **Performance issue**: [Describe impact and alternative]
3. **Code quality**: [Reference style guide or pattern]

### Suggested Changes
- [ ] Fix security issue by [specific change]
- [ ] Improve performance by [specific optimization]
- [ ] Follow pattern used in [reference file]

Please address these issues and request re-review.
```

#### Questions/Clarifications
```
I have some questions about this implementation:

1. **Design decision**: Why was [approach] chosen over [alternative]?
2. **Edge case**: How does this handle [specific scenario]?
3. **Future consideration**: Have we considered [potential issue]?

These aren't blocking, but would help my understanding.
```

#### Approvals with Comments
```
**Approved** with minor suggestions:

### What I liked
- Clean implementation of [feature]
- Good test coverage
- Clear documentation

### Minor suggestions (non-blocking)
- Consider renaming [variable] to be more descriptive
- Could add comment explaining [complex logic]
- Might want to handle [edge case] in future

Great work! 🎉
```

### Feedback Anti-Patterns
- ❌ "This is wrong" (vague)
- ❌ "I don't like this" (subjective)
- ❌ "You should know better" (personal)
- ❌ Nitpicking without substance
- ❌ Blocking for style preferences without standards

## Review Checklist

### Mandatory Checks
- [ ] **Code compiles**: No syntax errors
- [ ] **Tests pass**: All existing and new tests
- [ ] **No regressions**: Doesn't break existing functionality
- [ ] **Security review**: No obvious vulnerabilities
- [ ] **Style compliance**: Follows project linting rules

### Quality Checks
- [ ] **Single responsibility**: Changes focused on one issue
- [ ] **Proper abstractions**: No leaky implementations
- [ ] **Error handling**: Graceful failure modes
- [ ] **Performance**: No obvious inefficiencies
- [ ] **Documentation**: Code is understandable

### Project-Specific Checks
- [ ] **Conventional commits**: PR title follows format
- [ ] **PR template**: All sections completed
- [ ] **Reviewer assignment**: Appropriate reviewers selected
- [ ] **Linked issues**: Properly referenced
- [ ] **CI passing**: All checks green

## Special Cases

### Large PRs
**Strategy**: Review in multiple passes
1. **High-level**: Understand overall approach
2. **Architecture**: Review design decisions
3. **Implementation**: Review critical sections
4. **Details**: Scan remaining code

**Consider requesting**: 
- Split into smaller, focused PRs
- Add more intermediate commits for clarity
- Provide architectural diagram or explanation

### Complex Changes
**Approach**:
1. **Understand first**: Ask questions before suggesting changes
2. **Focus on correctness**: Ensure solution solves the problem
3. **Consider alternatives**: Suggest only if significantly better
4. **Defer optimizations**: Unless critical, suggest as follow-up

### Hotfix/Urgent PRs
**Balance speed with quality**:
- Focus on critical issues only
- Trust automated tests more
- Request follow-up PR for non-critical improvements
- May approve with "LGTM with minor follow-ups"

## Review Tools & Commands

### GitHub CLI Commands
```bash
# Get PR ready for review
gh pr ready <pr-number>

# Request review from specific people
gh pr edit <pr-number> --add-reviewer username1,username2

# Add general comments
gh pr comment <pr-number> --body "Comment text"

# Request changes
gh pr review <pr-number> --request-changes --body "Review feedback"

# Approve PR
gh pr review <pr-number> --approve --body "Approval comment"

# Merge PR (if authorized)
gh pr merge <pr-number> --squash --delete-branch
```

### Local Testing Commands
```bash
# Test specific changed files
npm test -- --testPathPattern="src/components/"

# Check type definitions
npm run typecheck

# Run linter on changed files
npm run lint -- src/components/Button.tsx

# Check test coverage
npm test -- --coverage --collectCoverageFrom="src/**/*.ts"
```

### Code Analysis
```bash
# Count lines changed
gh pr diff <pr-number> | wc -l

# See file statistics
gh pr view <pr-number> --json additions,deletions,files

# Check for common patterns
gh pr diff <pr-number> | grep -n "TODO\|FIXME\|console.log"
```

## Review Etiquette

### As Reviewer
- **Respond promptly**: Within agreed timeframe
- **Be available**: For follow-up questions
- **Explain reasoning**: Why a change is needed
- **Acknowledge fixes**: When issues are addressed
- **Celebrate success**: Positive reinforcement

### As Author
- **Be receptive**: Feedback is about code, not you
- **Ask questions**: If feedback isn't clear
- **Address all feedback**: Either fix or discuss
- **Keep PR updated**: Rebase if conflicts arise
- **Thank reviewers**: Acknowledge their time

## Common Review Scenarios

### Style Nitpicks
**Rule**: If project has style guide, enforce it. Otherwise, be consistent with existing code.

**Approach**:
- Use automated tools (linters) when possible
- For manual reviews, focus on readability
- Don't block for minor style issues without standards

### Disagreements on Approach
**Process**:
1. **Discuss objectively**: Reference requirements, constraints
2. **Consider tradeoffs**: List pros and cons of each approach
3. **Seek consensus**: Involve other team members if needed
4. **Document decision**: Record why approach was chosen
5. **Move forward**: Once decided, implement consistently

### Finding Major Issues
**Response**:
1. **Be clear about severity**: "Blocking" vs "suggestion"
2. **Provide alternatives**: Suggest concrete solutions
3. **Offer to help**: Pair program or discuss further
4. **Set expectations**: Estimate time to fix

## Post-Review Actions

### After Approval
```bash
# If authorized to merge
gh pr merge <pr-number> --squash --delete-branch

# Or wait for CI and auto-merge
gh pr merge <pr-number> --auto --delete-branch
```

### After Requesting Changes
- Monitor for updates
- Respond promptly to fixes
- Re-review only changed sections
- Use "View changes since last review" feature

### After Merging
```bash
# Update local main
git checkout main
git pull origin main

# Clean up local branch (if you checked it out)
git branch -D pr-branch-name
```

## Integration with Other Workflows

### With Git Commit Workflow
- PR should have clean commit history
- Commits tell story of implementation
- Each commit should be reviewable independently
- Use `git rebase -i` to clean up commits (note: interactive rebase must be done outside acai)

### With PR Creation Workflow
- PR description should enable effective review
- Include testing instructions
- Link to relevant documentation
- Set appropriate reviewers

### With Team Conventions
- Follow project-specific review guidelines
- Use established feedback patterns
- Respect team norms and communication styles
- Adhere to project quality standards

## Best Practices Summary

### ✅ DO
- Review within agreed timeframe
- Focus on correctness and quality
- Provide specific, actionable feedback
- Explain reasoning behind suggestions
- Balance thoroughness with efficiency
- Treat reviews as collaboration
- Celebrate good work

### ❌ DON'T
- Let PRs languish without review
- Be vague or subjective
- Nitpick without substance
- Make personal criticisms
- Block for style without standards
- Assume malicious intent
- Forget to say "thank you"

## Project-Specific Notes

For acai-ts:
- **Review timeframe**: Aim for within 24 hours
- **Required checks**: `npm test`, `npm run lint`, `npm run typecheck`
- **Reviewers**: Assign based on changed areas
- **Merge strategy**: Follow project conventions
- **Documentation**: Update if user-facing changes

Adapt these guidelines to match specific project requirements and team norms while maintaining the core principles of effective code review.