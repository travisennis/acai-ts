import fs from "node:fs/promises";
import { input } from "@inquirer/prompts";
import { type CoreMessage, type LanguageModel, generateText, tool } from "ai";
import chalk from "chalk";
import Handlebars from "handlebars";
import { z } from "zod";
import { writeError, writeHeader, writeln } from "./command";
import { saveMessageHistory } from "./config";
import { AcaiError, FileOperationError } from "./errors";
import logger from "./logger";
import { jsonParser } from "./parsing";

const generateEditSystemPrompt =
  "You are acai, an AI coding assistant. You specialize in helping software developers with the tasks that help them write better software. Pay close attention to the instructions given to you by the user and always follow those instructions. Return your reponse as valid JSON. It is very important that you format your response according to the user instructions as that formatting will be used to accomplish specific tasks.";

const generateEditPromptTemplate = Handlebars.compile<{
  prompt: string;
  files?: { path: string; content: string }[];
}>(
  `
Generate edit instructions for code files by analyzing the provided code and generating search and replace instructions for necessary changes. Follow these steps:

1. Carefully analyze the specific instructions:

{{prompt}}

2. Consider the full context of all files in the project:

{{#if files}}
File Contents:

{{/if}}
{{#each files}}
{{#if path}}
File: {{path}}

{{/if}}
{{#if content}}
{{content}}
{{/if}}

---	

{{/each}}

3. Generate search and replace instructions for each necessary change. Each instruction should:
   - Indicate the path of the file where the code needs to be changed. If the code should be in a new file, indicate the path where that file should live in the project structure
   - Include enough context to uniquely identify the code to be changed
   - Provide the exact replacement code, maintaining correct indentation and formatting
   - Focus on specific, targeted changes rather than large, sweeping modifications

4. Ensure that your search and replace instructions:
   - Address all relevant aspects of the instructions
   - Maintain or enhance code readability and efficiency
   - Consider the overall structure and purpose of the code
   - Follow best practices and coding standards for the language
   - Maintain consistency with the project context and previous edits
   - Take into account the full context of all files in the project

5. Make sure that each search and replace instruction can be applied to the code that would exist after the block prior to it is applied. Remember that each block will update the code in place and each subsequent block can only be applied to the updated code. 

Use the following format to return the search and replace instructions:

[
  {
    path: "the file path of the file to be edited",
    search: "the text to be replaced",
    replace: "the new text to be inserted",
    thinking: "a brief explanation of why this change needs to be made."
  }
]

If no changes are needed, return an empty list.
`,
  {
    noEscape: true,
  },
);

const EditBlockSchema = z.object({
  path: z.string(),
  search: z.string(),
  replace: z.string(),
  thinking: z.string(),
});

type EditBlock = z.infer<typeof EditBlockSchema>;

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function escapeReplacement(input: string) {
  return input.replace(/\$/g, "$$$$");
}

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
      const searchResult = content.search(escapeRegExp(search.trim()));
      if (searchResult > -1) {
        writeln("Search text found.");
      } else {
        writeError("Search text not found.");
      }
      if (search.trim() !== "") {
        content = content.replace(
          escapeRegExp(search.trim()),
          escapeReplacement(replace.trim()),
        );
        await fs.writeFile(trimmedPath, content);
      } else {
        await fs.appendFile(trimmedPath, replace);
      }
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
  writeHeader("delete:", chalk.red);
  writeln(chalk.red(search));
  writeHeader("replace:", chalk.green);
  writeln(chalk.green(replace));
}

async function generateEdits(
  model: LanguageModel,
  instructions: string,
  files: { path: string; content: string }[],
) {
  const messages: CoreMessage[] = [
    {
      role: "user",
      content: generateEditPromptTemplate({
        prompt: instructions,
        files: files,
      }),
    },
    { role: "assistant", content: "[" },
  ];

  const { text } = await generateText({
    model: model,
    system: generateEditSystemPrompt,
    maxTokens: 8192,
    messages,
  });

  messages.push({
    role: "assistant",
    content: text,
  });

  const parseResult = jsonParser(z.array(EditBlockSchema)).safeParse(
    `[${text}`,
  );
  if (!parseResult.success) {
    throw new AcaiError(`Invalid edit blocks: ${parseResult.error.message}`);
  }

  saveMessageHistory(messages);

  return parseResult.data;
}

function previewEdits(editBlocks: EditBlock[]) {
  writeHeader("Preview edits:");
  for (const editBlock of editBlocks) {
    writeln(`Proposed edits for ${chalk.blue(editBlock.path)}:`);
    displayColoredDiff(editBlock.search, editBlock.replace);
    writeln(`Reason for changes: ${editBlock.thinking}`);
  }
}

type EditResult = { path: string; result: string };

async function processEdits(editBlocks: EditBlock[]) {
  const results: EditResult[] = [];
  writeHeader("Proposed edits:");
  for (const editBlock of editBlocks) {
    writeHeader(`Proposed edits for ${chalk.blue(editBlock.path)}:`);
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
