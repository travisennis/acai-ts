import { platform } from "node:os";
import { streamText } from "ai";
import { inGitDirectory, initTools } from "../tools/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const initCommand = ({ terminal, modelManager }: CommandOptions) => {
  return {
    command: "/init",
    description: "Creates the .acai/rules.md file.",
    result: "continue" as const,
    execute: async () => {
      const result = streamText({
        model: modelManager.getModel("init-project"),
        temperature: 0.5,
        prompt: `Please analyze this codebase and create a .acai/rules.md file containing:
1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.

The file you create will be given to agentic coding agents (such as yourself) that operate in this repository. Make it about 20 lines long.

If there's already a .acai/rules.md, improve it.
If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules (in .github/copilot-instructions.md), make sure to include them.

Your current working directory is ${process.cwd()}
Is directory a git repo: ${(await inGitDirectory()) ? "Yes" : "No"}
Platform: ${platform()}`,
        maxSteps: 20,
        tools: await initTools({}),
      });

      for await (const text of result.textStream) {
        terminal.write(text);
      }
    },
  } satisfies ReplCommand;
};
