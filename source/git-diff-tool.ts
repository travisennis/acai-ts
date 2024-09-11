import { tool } from "ai";
import { z } from "zod";
import simpleGit from "simple-git";

export function initTool() {
  return tool({
    description:
      "Gets the current git diff for the project and returns the output.",
    parameters: z.object({
      instructions: z
        .enum(["staged", "all"])
        .describe(
          "Instructions for getting the git diff for the current project. Send 'staged' to get the current staged changes. Otherwise send 'all'.",
        ),
    }),
    execute: async ({ instructions }) => {
      try {
        const git = simpleGit({ baseDir: "." });
        const args = instructions === "staged" ? ["--cached"] : [];
        const diff = await git.diff(args);
        return diff || "No changes detected.";
      } catch (error) {
        throw new Error(`Error getting git diff: ${(error as Error).message}`);
      }
    },
  });
}
