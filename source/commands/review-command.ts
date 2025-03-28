import type { CommandOptions, ReplCommand } from "./types.ts";

export const reviewCommand = ({ promptManager }: CommandOptions) => {
  return {
    command: "/review",
    description: "Instructs the agent to perform a code review on a PR.",
    result: "use" as const,
    execute: (args: string[]) => {
      promptManager.set(
        `You are an expert code reviewer. Follow these steps:

      1. If no PR number is provided in the args, use bashTool("gh pr list") to show open PRs
      2. If a PR number is provided, use bashTool("gh pr view <number>") to get PR details
      3. Use bashTool("gh pr diff <number>") to get the diff
      4. Analyze the changes and provide a thorough code review that includes:
         - Overview of what the PR does
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

      PR number: ${args}
    `,
      );
      return Promise.resolve();
    },
  } satisfies ReplCommand;
};
