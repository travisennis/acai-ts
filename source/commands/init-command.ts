import { platform } from "node:os";
import { stepCountIs, streamText } from "ai";
import { inGitDirectory } from "../tools/git-utils.ts";
import { initCliTools } from "../tools/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const initCommand = ({
  terminal,
  modelManager,
  tokenCounter,
}: CommandOptions): ReplCommand => {
  return {
    command: "/init",
    description: "Creates the AGENTS.md file.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (): Promise<"break" | "continue" | "use"> => {
      const result = streamText({
        model: modelManager.getModel("init-project"),
        temperature: 0.5,
        prompt: `Please analyze this codebase and create a AGENTS.md file containing:
1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.

The file you create will be given to agentic coding agents (such as yourself) that operate in this repository. Make it about 20 lines long.

If there's already a AGENTS.md, improve it.
If there are Cursor rules (in .cursor/rules/ or .cursorrules), Copilot rules (in .github/copilot-instructions.md), or Windsurf rules (in .windsurf/rules), make sure to include them.

Your current working directory is ${process.cwd()}
Is directory a git repo: ${(await inGitDirectory()) ? "Yes" : "No"}
Platform: ${platform()}`,
        stopWhen: stepCountIs(40),
        tools: (
          await initCliTools({
            tokenCounter,
          })
        ).toolDefs,
      });

      for await (const text of result.textStream) {
        terminal.write(text);
      }
      return "continue";
    },
  };
};
