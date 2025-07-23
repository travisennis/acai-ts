import type { CommandOptions, ReplCommand } from "./types.ts";

export const reviewCommand = ({
  promptManager,
}: CommandOptions): ReplCommand => {
  return {
    command: "/review",
    description: "Instructs the agent to perform a code review on a PR.",
    result: "use" as const,
    getSubCommands: () => Promise.resolve(["pr", "local"]),
    execute: (args: string[]) => {
      if (args[0] === "pr") {
        promptManager.set(
          `You are an expert code reviewer. Follow these steps:

### 1. Get details about the PR
- If no PR number is provided in the args, use bash("gh pr list") to show open PRs
- If a PR number is provided, use bash("gh pr view <number>") to get PR details

### 2. Download the diff
- Use bash("gh pr diff <number>") to get the diff

### 3. Analyze Diff Structure
Parse the diff to understand:
- Number of files changed
- Types of changes (additions, deletions, modifications)
- Scope of changes

### 4. Review Each Changed File Against Codebase
For each file in the diff:
- Check if the file exists in the current codebase
- Analyze the context around changes
- Verify coding style consistency
- Check for potential issues

### 5. Comprehensive Code Review Analysis
Perform detailed analysis covering:

#### A. Code Style & Formatting
- Indentation consistency with existing code
- Brace placement following codebase conventions
- Variable naming conventions
- Comment style and placement
- Line length and formatting

#### B. Logic & Correctness
- Null pointer checks and error handling
- Array bounds checking
- Memory management (malloc/free patterns)
- Function parameter validation
- Return value handling

#### C. Architecture & Design
- Function placement and organization
- Use of existing helper functions vs. code duplication
- API consistency with existing patterns
- Module boundaries and dependencies

#### D. Security & Safety
- Input validation
- Buffer overflow protection
- Resource leak prevention
- Thread safety considerations

#### E. Performance & Efficiency
- Algorithm efficiency
- Memory usage patterns
- Unnecessary computations
- Database/API call optimization

#### F. Testing & Maintainability
- Test coverage implications
- Code readability and maintainability
- Documentation and comments
- Debugging and logging improvements

### 6. Generate Review Comments
Based on the analysis, generate structured comments:

#### Critical Issues (Must Fix)
- Security vulnerabilities
- Memory leaks or corruption
- Logic errors that could cause crashes
- API contract violations

#### Major Issues (Should Fix)
- Performance problems
- Code style violations
- Missing error handling
- Architectural concerns

#### Minor Issues (Nice to Fix)
- Code clarity improvements
- Minor style inconsistencies
- Optimization opportunities
- Documentation improvements

#### Positive Feedback
- Well-implemented features
- Good use of existing patterns
- Performance improvements
- Code clarity enhancements

### 7. Final Recommendation
Provide one of the following recommendations:

#### SHIP IT / APPROVED
- No critical or major issues found
- Code follows established patterns
- Changes are well-implemented
- Ready for production

#### NEEDS WORK
- Critical issues that must be addressed
- Major architectural concerns
- Significant style violations
- Requires another review cycle

#### APPROVED WITH COMMENTS
- Minor issues that can be addressed post-merge
- Suggestions for future improvements
- Non-blocking feedback

### 8. Generate Review Summary
Create a comprehensive summary including:
- Overall assessment
- Key changes and their impact
- Risk assessment
- Deployment considerations
- Follow-up actions if needed

### 9. User Confirmation for Github Update
Ask the user if they want to update Github with the review comments:
- Display the generated review summary
- Prompt: "Would you like to update Github with this review? (YES/NO)"
- If YES: Proceed to update Github
- If NO: Complete workflow without updating

### 10. Workflow Completion Summary
Display final summary:
- Review analysis completed
- GitHub update status (if attempted)
- Next steps or recommendations

## Output Format

The workflow will generate:
1. **Diff Analysis Report** - Technical breakdown of changes
2. **Code Review Comments** - Categorized feedback
3. **Final Recommendation** - Ship/Hold/Conditional approval
4. **Review Summary** - Executive summary for stakeholders

## Notes

- The review considers the immediate codebase context for consistency
- Large diffs are handled efficiently with single API calls
- The workflow can be extended for specific project requirements

## Best Practices
- **Focus on code quality**: Ensure code adheres to established standards and conventions.
- **Verify functionality**: Confirm changes do not introduce new issues or break existing functionality.
- **Check for security vulnerabilities**: Identify potential security risks and suggest mitigations.
- **Optimize performance**: Recommend improvements for better performance and efficiency.
- **Provide actionable feedback**: Offer constructive suggestions for improvement.

PR number: ${args[1]}`,
        );
      } else if (args[0] === "local") {
        promptManager.set(
          `You are an expert code reviewer. Follow these steps:

1. Look at the unstaged files in the current project.
2. Analyze the changes and provide a thorough code review that includes:
- Overview of what the changes do
- Analysis of code quality and style
- Specific suggestions for improvements
- Any potential issues or risks

Keep your review concise but thorough. Focus on:
- Code correctness
- Following project conventions
- Performance implications
- Test coverage
- Security considerations

Format your review with clear sections and bullet points.

Additional instructions: ${args.slice(1).join(" ")}`,
        );
      }
      return Promise.resolve();
    },
  };
};
