import path from "node:path";
import {
  type ModelName,
  dedent,
  isSupportedModel,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import envPaths from "@travisennis/stdlib/env";
import { type LanguageModel, generateText } from "ai";
import { writeln } from "./command.ts";
import type { Flags } from "./index.ts";
import { logger } from "./logger.ts";

export async function genEvalCmd(
  prompt: string,
  args: Flags,
  config: Record<PropertyKey, unknown>,
) {
  logger.info(config, "Config:");

  const now = new Date();

  const model = args.model;
  const chosenModel: ModelName = isSupportedModel(model)
    ? model
    : "anthropic:sonnet";

  // Define the path to the JSONL file, you can change this to your desired local path
  const stateDir = envPaths("acai").state;
  const messagesFilePath = path.join(
    stateDir,
    `${now.toISOString()}-gen-eval-message.json`,
  );

  const langModel = wrapLanguageModel(
    languageModel(chosenModel),
    auditMessage({ path: messagesFilePath, app: "gen-eval" }),
  );

  // Execute the loop
  const result = await loop(
    langModel,
    prompt,
    evaluatorPrompt,
    generatorPrompt,
  );

  writeln(`${result[2]}\n\nFinal result:\n${result[0]}`);
}

interface ChainOfThoughtItem {
  thoughts: string;
  result: string;
}

async function llmCall(model: LanguageModel, prompt: string): Promise<string> {
  const { text } = await generateText({
    model,
    maxTokens: 4096,
    temperature: 0.1,
    prompt,
  });
  return text;
}

function extractXml(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return match ? match[1] : "";
}

const evaluatorPrompt = dedent`
Evaluate this following code implementation for:
1. code correctness
2. time complexity
3. style and best practices

You should be evaluating only and not attemping to solve the task.
Only output "PASS" if all criteria are met and you have no further suggestions for improvements.
Output your evaluation concisely in the following format.

<evaluation>PASS, NEEDS_IMPROVEMENT, or FAIL</evaluation>
<feedback>
What needs improvement and why.
</feedback>
`;

const generatorPrompt = dedent`
Your goal is to complete the task based on <user input>. If there are feedback 
from your previous generations, you should reflect on them to improve your solution

Output your answer concisely in the following format: 

<thoughts>
[Your understanding of the task and feedback and how you plan to improve]
</thoughts>

<response>
[Your code implementation here]
</response>
`;

function createTaskPrompt(prompt: string): string {
  const result = `
<user input>
${prompt}
</user input>
`;

  return result;
}

async function generate(
  model: LanguageModel,
  prompt: string,
  task: string,
  context?: string,
): Promise<[string, string]> {
  const fullPrompt = context
    ? `${prompt}\n${context}\nTask: ${createTaskPrompt(task)}`
    : `${prompt}\nTask: ${createTaskPrompt(task)}`;

  const response = await llmCall(model, fullPrompt);
  const thoughts = extractXml(response, "thoughts");
  const result = extractXml(response, "response");

  return [thoughts, result];
}

function formatGenerateOutput([thoughts, result]: [string, string]): string {
  return dedent`
=== GENERATION START ===
Thoughts:
${thoughts}

Generated:
${result}
=== GENERATION END ===
`;
}

async function evaluate(
  model: LanguageModel,
  prompt: string,
  content: string,
  task: string,
): Promise<[string, string]> {
  const fullPrompt = `${prompt}\nOriginal task: ${createTaskPrompt(task)}\nContent to evaluate: ${content}`;
  const response = await llmCall(model, fullPrompt);
  const evaluation = extractXml(response, "evaluation");
  const feedback = extractXml(response, "feedback");

  return [evaluation, feedback];
}

function formatEvaluateOutput([evaluation, feedback]: [
  string,
  string,
]): string {
  return `=== EVALUATION START ===\nStatus: ${evaluation}\nFeedback: ${feedback}\n=== EVALUATION END ===\n`;
}

async function loop(
  model: LanguageModel,
  task: string,
  evaluatorPrompt: string,
  generatorPrompt: string,
): Promise<[string, ChainOfThoughtItem[], string]> {
  let fullOutput = "";
  const memory: string[] = [];
  const chainOfThought: ChainOfThoughtItem[] = [];

  const [thoughts, result] = await generate(model, generatorPrompt, task);
  fullOutput += formatGenerateOutput([thoughts, result]);

  memory.push(result);
  chainOfThought.push({ thoughts, result });

  const max = 5;
  let i = 0;
  while (true) {
    if (i++ > max) {
      fullOutput += "max attempts";
      return [result, chainOfThought, fullOutput];
    }

    const lastResult = memory.at(-1);

    if (!lastResult) {
      fullOutput += "no result";
      return [result, chainOfThought, fullOutput];
    }

    const [evaluation, feedback] = await evaluate(
      model,
      evaluatorPrompt,
      lastResult,
      task,
    );

    fullOutput += formatEvaluateOutput([evaluation, feedback]);

    if (evaluation === "PASS") {
      return [result, chainOfThought, fullOutput];
    }

    const context = [
      "Previous attempts:",
      ...memory.map((m) => `- ${m}`),
      `\nFeedback: ${feedback}`,
    ].join("\n");

    const [newThoughts, newResult] = await generate(
      model,
      generatorPrompt,
      task,
      context,
    );

    fullOutput += formatGenerateOutput([newThoughts, newResult]);

    memory.push(newResult);
    chainOfThought.push({ thoughts: newThoughts, result: newResult });
  }
}
