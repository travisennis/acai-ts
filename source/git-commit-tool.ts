import { tool } from "ai";
import { z } from "zod";
import simpleGit from "simple-git";

function validateConventionalCommit(message: string): boolean {
  const pattern =
    /^(feat|fix|docs|style|refactor|perf|test|chore)(\(\w+\))?!?: .+/;
  return pattern.test(message);
}

export function initTool() {
  return tool({
    description:
      "Commits a new git changeset with the provided commit message that matches the Conventional Commits standard.",
    parameters: z.object({
      message: z.string().describe("The commit message."),
      files: z
        .string()
        .describe(
          "A command-separated list of files to include in this commit.",
        ),
    }),
    execute: async ({ message, files }) => {
      try {
        const git = simpleGit();

        // Check if there are any changes to commit
        const status = await git.status();
        if (status.files.length === 0) {
          return "No changes to commit.";
        }

        // Check if no message is provided or the provided message doesn't conform to Conventional Commits
        if (!(message && validateConventionalCommit(message))) {
          return "Invalid commit message. Doesn't conform to Conventional Commits";
        }

        if (!files || files.trim() === "") {
          return "No files provided.";
        }
        const fileArr = files.split(",").map((file) => file.trim());

        // Add the changes and commit
        await git.add(fileArr);
        const commitResult = await git.commit(message);

        return `Commit created successfully: ${commitResult.commit} - ${message}`;
      } catch (error) {
        return `Error creating commit: ${(error as Error).message}`;
      }
    },
  });
}
