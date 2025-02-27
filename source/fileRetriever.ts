import {
  dedent,
  languageModel,
  type TokenTracker,
  wrapLanguageModel,
  type ModelName,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import { directoryTree } from "@travisennis/acai-core/tools";
import { envPaths } from "@travisennis/stdlib/env";
import { generateText } from "ai";
import path from "node:path";

const retrieverSystemPrompt = (fileStructure: string) => {
  return dedent`
The current working directory is ${process.cwd()}

The following files are found in the directory:

${fileStructure}

Please provide a list of files that you would like to search for answering the user query.

Think step-by-step and strategically reason about the files you choose to maximize the chances of finding the answer to the query. Only pick the files that are most likely to contain the information you are looking for in decreasing order of relevance. Once you have selected the files, please submit your response in the appropriate format mentioned below (markdown numbered list in a markdown code block). The filepath within [[ and ]] should contain the absolute path of the file in the repository. Use the current working directory to construct the absolute path.

Enclose the absolute file paths in a list in a markdown code block as shown below:

\`\`\`
1. [[ filepath_1 ]]\n
2. [[ filepath_2 ]]\n
3. [[ filepath_3 ]]\n
...
\`\`\`
`;
};

const fileExtractRegex = /\[\[\s*(.*?)\s*\]\]/;

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(fileExtractRegex);
    if (match?.[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
}

export async function retrieveFilesForTask({
  model,
  prompt,
  tokenTracker,
}: {
  model: ModelName;
  prompt: string;
  tokenTracker?: TokenTracker;
}): Promise<string[]> {
  const now = new Date();
  const stateDir = envPaths("acai").state;
  const fileRetrieverFilePath = path.join(
    stateDir,
    `${now.toISOString()}-file-retriever-message.json`,
  );

  const { text, usage } = await generateText({
    model: wrapLanguageModel(
      languageModel(model),
      auditMessage({ path: fileRetrieverFilePath, app: "file-retriever" }),
    ),
    system: retrieverSystemPrompt(await directoryTree(process.cwd())),
    prompt,
  });

  tokenTracker?.trackUsage("file-retriever", usage);

  const usefulFiles = extractFilePaths(text);

  return Array.from(new Set(usefulFiles));
}
