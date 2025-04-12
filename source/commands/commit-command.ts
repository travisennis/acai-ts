import simpleGit from "simple-git";
import { formatCodeSnippet } from "../formatting.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const commitCommand = ({ promptManager }: CommandOptions) => {
  return {
    command: "/commit",
    description:
      "Instructs the agent to create commit messages for the changes in the current working directory.",
    result: "use" as const,
    getSubCommands: () => [],
    execute: async () => {
      promptManager.set(
        `Look at the working changes in the current project and create as many commit messages as appropriate for those changes. Write the commits using the Conventional Commits standards and make the commits.
Current working directory: ${process.cwd()}
${await getGitStatus()}`,
      );
      return Promise.resolve();
    },
  } satisfies ReplCommand;
};

async function getGitStatus() {
  const baseDir = process.cwd();
  const git = simpleGit({ baseDir });

  // Check if there are any changes to commit
  const status = await git.status();
  const statusBlock = formatCodeSnippet(
    "status.json",
    JSON.stringify(status, undefined, 2),
    "markdown",
  );

  const statusMessage = `Status:\n${statusBlock}`;
  return statusMessage;
}
