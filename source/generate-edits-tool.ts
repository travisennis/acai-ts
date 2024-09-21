import fs from "node:fs/promises";
import { input } from "@inquirer/prompts";
import { type LanguageModel, generateText, tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { AcaiError, FileOperationError } from "./errors";
import {
  generateEditPromptTemplate,
  generateEditSystemPrompt,
} from "./prompts";
import logger from "./logger";
import { jsonParser } from "./parsing";
import { writehr, writeln } from "./command";

const EditBlockSchema = z.object({
  path: z.string(),
  search: z.string(),
  replace: z.string(),
  thinking: z.string(),
});

type EditBlock = z.infer<typeof EditBlockSchema>;

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function applyEditBlock(block: EditBlock): Promise<void> {
  const { path, search, replace } = block;
  const trimmedPath = path.trim();

  try {
    if (await fileExists(trimmedPath)) {
      writeln(`Updating ${trimmedPath}`);
      let content = await fs.readFile(trimmedPath, "utf8");
      content =
        search.trim() === ""
          ? replace.trim()
          : content.replace(search.trim(), replace.trim());
      await fs.writeFile(trimmedPath, content);
    } else {
      writeln(`Creating ${trimmedPath}`);
      await fs.writeFile(trimmedPath, replace.trim());
    }
  } catch (error) {
    throw new FileOperationError(
      `Error applying edit block: ${(error as Error).message}`,
    );
  }
}

function displayColoredDiff(search: string, replace: string): void {
  writehr(chalk.yellow);
  writeln(chalk.red(search));
  writeln("");
  writeln(chalk.green(replace));
  writehr(chalk.yellow);
}

async function generateEdits(
  model: LanguageModel,
  instructions: string,
  files: { path: string; content: string }[],
) {
  const { text } = await generateText({
    model: model,
    system: generateEditSystemPrompt,
    maxTokens: 8192,
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

  const parseResult = jsonParser(z.array(EditBlockSchema)).safeParse(
    `[${text}`,
  );
  if (!parseResult.success) {
    throw new AcaiError(`Invalid edit blocks: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

function previewEdits(editBlocks: EditBlock[]) {
  writehr(chalk.green);
  writeln("Proposed edits:");
  for (const editBlock of editBlocks) {
    writehr(chalk.yellow);
    writeln(`Proposed edits for ${chalk.blue(editBlock.path)}:`);
    displayColoredDiff(editBlock.search, editBlock.replace);
    writeln(`Reason for changes: ${editBlock.thinking}`);
  }
}

type EditResult = { path: string; result: string };

async function processEdits(editBlocks: EditBlock[]) {
  const results: EditResult[] = [];
  writehr(chalk.green);
  writeln("Proposed edits:");
  for (const editBlock of editBlocks) {
    writehr(chalk.yellow);
    writeln(`Proposed edits for ${chalk.blue(editBlock.path)}:`);
    displayColoredDiff(editBlock.search, editBlock.replace);
    writeln(`Reason for changes: ${editBlock.thinking}`);
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
  return results;
}

function getUniqueResults(results: EditResult[]): EditResult[] {
  return results.reduce(
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
}

async function processEditInstructions(
  model: LanguageModel,
  instructions: string,
  files: { path: string; content: string }[],
) {
  const editBlocks = await generateEdits(model, instructions, files);

  previewEdits(editBlocks);

  const results = await processEdits(editBlocks);

  logger.debug({ results }, "Edit results");

  const uniqueResults = getUniqueResults(results);

  writehr(chalk.green);

  return uniqueResults;
}

export function initTool(
  model: LanguageModel,
  files: { path: string; content: string }[],
) {
  return tool({
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
      return await processEditInstructions(model, instructions, files);
    },
  });
}
