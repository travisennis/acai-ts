import type { CommandOptions, ReplCommand } from "./types.ts";

export const commitCommand = ({ promptManager }: CommandOptions) => {
  return {
    command: "/commit",
    description: "",
    result: "break" as const,
    execute: () => {
      promptManager.add(
        "Look at the working changes in the current project and create as many commit messages as appropriate for those changes. Write the commits using the Conventional Commits standards and make the commits.",
      );
      return Promise.resolve();
    },
  } satisfies ReplCommand;
};
