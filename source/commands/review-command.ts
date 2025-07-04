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

      1. If no PR number is provided in the args, use bash("gh pr list") to show open PRs
      2. If a PR number is provided, use bash("gh pr view <number>") to get PR details
      3. Use bash("gh pr diff <number>") to get the diff
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
