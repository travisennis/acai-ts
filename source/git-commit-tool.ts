import { tool } from "ai";
import { z } from "zod";
import simpleGit from "simple-git";

export function initTool() {
  return tool({
    description:
      "Creates a new git commit with the current changes using the provided or generated commit message.",
    parameters: z.object({
      message: z
        .string()
        .optional()
        .describe(
          "The commit message. If not provided, one will be generated.",
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

        // If no message is provided, generate one based on the changes
        if (!message) {
          // const diff = await git.diff(["--cached"]);
          // Here you could call an AI model to generate a commit message based on the diff
          // For now, we'll use a simple placeholder
          message = `Update files: ${status.files.map((f) => f.path).join(", ")}`;
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
