import { input } from "@inquirer/prompts";
import { generateText, LanguageModel, tool } from "ai";
import chalk from "chalk";
import fs from "node:fs/promises";
import { z } from "zod";
import { AcaiError, FileOperationError } from "./errors";
import {
  generateEditPromptTemplate,
  generateEditSystemPrompt,
} from "./prompts";

const EditBlockSchema = z.object({
  path: z.string(),
  search: z.string(),
  replace: z.string(),
  thinking: z.string(),
});

type EditBlock = z.infer<typeof EditBlockSchema>;

async function applyEditBlock(block: EditBlock): Promise<void> {
  const { path, search, replace } = block;
  const trimmedPath = path.trim();

  try {
    if (await fileExists(trimmedPath)) {
      let content = await fs.readFile(trimmedPath, "utf8");

      content =
        search.trim() === ""
          ? replace.trim()
          : content.replace(search.trim(), replace.trim());

      await fs.writeFile(trimmedPath, content);
    } else if (search.trim() === "") {
      await fs.writeFile(trimmedPath, replace.trim());
    } else {
      throw new FileOperationError(`File not found: ${trimmedPath}`);
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw new FileOperationError(
      `Error applying edit block: ${(error as Error).message}`,
    );
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function displayColoredDiff(search: string, replace: string): void {
  console.log(chalk.yellow("-------------------------"));
  console.log(chalk.red(search));
  console.log(chalk.green(replace));
  console.log(chalk.yellow("-------------------------"));
}

export function initTool(
  model: LanguageModel,
  files: { path: string; content: string }[],
) {
  return {
    generate_edits: tool({
      description:
        "This function generates a set of edits that can applied to the current code base based on the specific instructions provided. This function will return the edits and give the user the ability to accept or reject the suggested edits before applying them to the code base.",
      parameters: z.object({
        instructions: z
          .string()
          .describe(
            "This function generates a set of edits that can applied to the current code base based on the specific instructions provided. This function will return the edits and give the user the ability to accept or reject the suggested edits before applying them to the code base.",
          ),
      }),
      execute: async ({ instructions }) => {
        console.log("Generating edits:", instructions);
        if (!instructions || typeof instructions !== "string") {
          throw new AcaiError(
            "Invalid or missing instruction for generate_edits.",
          );
        }

        const { text } = await generateText({
          model: model,
          system: generateEditSystemPrompt,
          maxTokens: 8192,
          headers: {
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
          },
          messages: [
            {
              role: "user",
              content: generateEditPromptTemplate({
                prompt: instructions,
                files: files,
              }),
            },
            { role: "assistant", content: "[" },
          ],
        });

        const results: { path: string; result: string }[] = [];
        const parseResult = z
          .array(EditBlockSchema)
          .safeParse(JSON.parse(`[${text}`));
        if (!parseResult.success) {
          throw new AcaiError(
            `Invalid edit blocks: ${parseResult.error.message}`,
          );
        }
        const editBlocks = parseResult.data;
        process.stdout.write("\nProposed edits:\n\n");
        for (const editBlock of editBlocks) {
          process.stdout.write(
            `\nProposed edits for ${chalk.blue(editBlock.path)}:\n\n`,
          );
          displayColoredDiff(editBlock.search, editBlock.replace);
          process.stdout.write(`Reason for changes: ${editBlock.thinking}\n\n`);
        }
        process.stdout.write("\nProposed edits:\n\n");
        for (const editBlock of editBlocks) {
          process.stdout.write(
            `\nProposed edits for ${chalk.blue(editBlock.path)}:\n\n`,
          );
          displayColoredDiff(editBlock.search, editBlock.replace);
          process.stdout.write(`Reason for changes: ${editBlock.thinking}\n\n`);
          const userInput = await input({
            message: "Accept these edits: y or n?",
          });
          switch (userInput.trim()) {
            case "y": {
              await applyEditBlock(editBlock);
              results.push({ path: editBlock.path, result: "edits applied" });
              continue;
            }
            case "n": {
              results.push({
                path: editBlock.path,
                result: "edits rejected",
              });
              continue;
            }
            default: {
              results.push({ path: editBlock.path, result: "unknown error" });
              continue;
            }
          }
        }

        console.dir(results);

        const uniqueResults = results.reduce(
          (acc, curr) => {
            const existingIndex = acc.findIndex(
              (item) => item.path === curr.path,
            );
            if (existingIndex !== -1) {
              if (
                curr.result === "edits applied" ||
                acc[existingIndex].result === "edits applied"
              ) {
                acc[existingIndex].result = "edits applied";
              }
            } else {
              acc.push(curr);
            }
            return acc;
          },
          [] as { path: string; result: string }[],
        );

        return JSON.stringify(uniqueResults);
      },
    }),
  };
}