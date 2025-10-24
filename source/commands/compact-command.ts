import { generateText } from "ai";
import { createUserMessage } from "../messages.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const compactCommand = (options: CommandOptions): ReplCommand => {
  return {
    command: "/compact",
    description:
      "Saves, summarizes, and resets the chat history. Optional instructions can be provided for the summary.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (args: string[]): Promise<"break" | "continue" | "use"> => {
      const { messageHistory, terminal } = options;
      if (!messageHistory.isEmpty()) {
        const additionalInstructions = args.join(" ");
        await summarizeAndReset(options, additionalInstructions);
      }
      terminal.info("Message history summarized and reset.");
      return "continue";
    },
  };
};

async function summarizeAndReset(
  { messageHistory, modelManager, tokenTracker }: CommandOptions,
  additionalInstructions?: string,
) {
  const app = "conversation-summarizer";

  // save existing message history
  await messageHistory.save();

  // summarize message history
  let userPrompt = `Your tasks is to provide a detailed summary of our conversation so far. Focus on information that would be helpful for continuing the conversation and the task, including what was the orginal task requested by the user, what we have done so far and why, which files we're working on, and what we're going to do next. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently. You need to provide enough information that another coding agent can you use your summary to pick up where you have left off.

Your summary should include the following sections:
1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests without confirming with the user first.

 If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.`;
  if (additionalInstructions && additionalInstructions.trim().length > 0) {
    userPrompt += `\n\nAdditional instructions provided by the user: ${additionalInstructions}`;
  }
  messageHistory.appendUserMessage(createUserMessage([], userPrompt));
  const { text, usage } = await generateText({
    model: modelManager.getModel(app),
    system:
      "You are a helpful AI assistant tasked with summarizing conversations so that a coding agent such as yourself can understand what actions have been taken on a code base and what future work still needs to be done.",
    messages: messageHistory.get(),
  });

  tokenTracker.trackUsage(app, usage);

  //create new session
  messageHistory.create(modelManager.getModel("repl").modelId);

  messageHistory.appendUserMessage(createUserMessage([text]));
}
