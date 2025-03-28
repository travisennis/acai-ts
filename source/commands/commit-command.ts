import type { CommandOptions, ReplCommand } from "./types.ts";

export const commitCommand = ({ promptManager }: CommandOptions) => {
  return {
    command: "/commit",
    description:
      "Instructs the agent to create commit messages for the changes in the current working directory.",
    result: "use" as const,
    execute: () => {
      promptManager.set(
        "Look at the working changes in the current project and create as many commit messages as appropriate for those changes. Write the commits using the Conventional Commits standards and make the commits.",
      );
      return Promise.resolve();
    },
  } satisfies ReplCommand;
};
