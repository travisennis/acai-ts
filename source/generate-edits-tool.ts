import type Anthropic from "@anthropic-ai/sdk";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import fs from "node:fs/promises";
import { z } from "zod";
import { AcaiError, ApiError, FileOperationError } from "./errors";
import {
  generateEditPromptTemplate,
  generateEditSystemPrompt,
} from "./prompts";
import { CallableTool, type ToolParameters } from "./tools";

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
      let content = await fs.readFile(trimmedPath, "utf-8");

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

export class GenerateEditsTool extends CallableTool {
  private client: Anthropic;
  private files: { path: string; content: string }[];
  constructor(client: Anthropic, files: { path: string; content: string }[]) {
    super();
    this.client = client;
    this.files = files;
  }
  getName(): string {
    return "generate_edits";
  }
  getDescription(): string {
    return "This function generates a set of edits that can applied to the current code base based on the specific instructions provided. This function will return the edits and give the user the ability to accept or reject the suggested edits before applying them to the code base.";
  }
  getParameters(): ToolParameters {
    return {
      type: "object",
      requiredProperties: {
        instructions: {
          type: "string",
          description:
            "After the reviewing the provided code, construct a plan for the necessary changes. These instructions will be used to determine what edits need to be made to the code base.",
        },
      },
    };
  }
  async call(args: { [key: string]: string }): Promise<string> {
    console.log("Generating edits: ", args.instructions);
    if (!args.instructions || typeof args.instructions !== "string") {
      throw new AcaiError("Invalid or missing instruction for generate_edits.");
    }

    const response = await this.client.messages
      .create(
        {
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 8192,
          system: generateEditSystemPrompt,
          messages: [
            {
              role: "user",
              content: generateEditPromptTemplate({
                prompt: args.instructions,
                files: this.files,
              }),
            },
            { role: "assistant", content: "[" },
          ],
        },
        {
          headers: {
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
          },
        },
      )
      .catch((error: unknown) => {
        throw new ApiError(
          `Error calling Anthropic API: ${(error as Error).message}`,
        );
      });

    console.dir(response);

    const results: { path: string; result: string }[] = [];
    for (const content of response.content) {
      if (content.type === "text") {
        const parseResult = z
          .array(EditBlockSchema)
          .safeParse(JSON.parse(`[${content.text}`));
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
              results.push({ path: editBlock.path, result: "edits rejected" });
              continue;
            }
            default: {
              results.push({ path: editBlock.path, result: "unknown error" });
              continue;
            }
          }
        }
      } else {
        results.push({ path: "none", result: "unexpected message" });
      }
    }

    console.dir(results);

    const uniqueResults = results.reduce(
      (acc, curr) => {
        const existingIndex = acc.findIndex((item) => item.path === curr.path);
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

    return Promise.resolve(JSON.stringify(uniqueResults));
  }
}
