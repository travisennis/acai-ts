import { tool } from "ai";
import { z } from "zod";
import simpleGit from "simple-git";

function validateConventionalCommit(message: string): boolean {
  const pattern =
    /^(feat|fix|docs|style|refactor|perf|test|chore)(\(\w+\))?!?: .+/;
  return pattern.test(message);
}

function generateConventionalCommit(files: string[]): string {
  const type = files.some((file) => file.includes("test")) ? "test" : "chore";
  const scope = files.length === 1 ? files[0].split("/")[0] : "various";
  const description = `update ${files.join(", ")}`;
  return `${type}(${scope}): ${description}`;
}

export function initTool() {
  return tool({
    description:
      "Creates a new git commit with the current changes using the provided or generated commit message, enforcing the Conventional Commits standard.",
    parameters: z.object({
      message: z
        .string()
        .optional()
        .describe(
          "The commit message. If not provided, one will be generated following the Conventional Commits standard.",
        ),
    }),
    execute: async ({ message }) => {
      try {
        const git = simpleGit();

        // Check if there are any changes to commit
        const status = await git.status();
        if (status.files.length === 0) {
          return "No changes to commit.";
        }

        // If no message is provided or the provided message doesn't conform to Conventional Commits, generate one
        if (!message || !validateConventionalCommit(message)) {
          message = generateConventionalCommit(status.files.map((f) => f.path));
        }

        // Add all changes and commit
        await git.add(".");
        const commitResult = await git.commit(message);

        return `Commit created successfully: ${commitResult.commit} - ${message}`;
      } catch (error) {
        return `Error creating commit: ${(error as Error).message}`;
      }
    },
  });
}
