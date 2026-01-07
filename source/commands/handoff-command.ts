import { mkdir, writeFile } from "node:fs/promises";
import { generateText } from "ai";
import { AiConfig } from "../models/ai-config.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const handoffCommand = (options: CommandOptions): ReplCommand => {
  return {
    command: "/handoff",
    description:
      "Creates a detailed handoff plan of the conversation for continuing the work in a new session. Usage: /handoff <the purpose of the handoff>",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      // Validate that purpose is provided
      const purpose = args.join(" ").trim();
      if (!purpose) {
        container.addChild(
          new Text(
            style.red(
              "Please provide a purpose for the handoff. Usage: /handoff <the purpose of the handoff>",
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          `Creating handoff document for purpose: ${style.blue(purpose)}`,
          1,
          0,
        ),
      );
      tui.requestRender();

      const filename = await createHandoffDocument(options, purpose);

      container.addChild(
        new Text(style.green(`Handoff document created: ${filename}`), 2, 0),
      );
      container.addChild(
        new Text(
          `Use /pickup ${filename.replace(".md", "")} to continue this work.`,
          3,
          0,
        ),
      );
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};

const handoffPrompt = (purpose: string) => {
  return `Creates a detailed handoff plan of the conversation for continuing the work in a new session.

The user specified purpose:

<purpose>${purpose}</purpose>

You are creating a summary specifically so that it can be continued by another agent.  For this to work you MUST have a purpose.  If no specified purpose was provided in the \`<purpose>...</purpose>\` tag you must STOP IMMEDIATELY and ask the user what the purpose is.

Do not continue before asking for the purpose as you will otherwise not understand the instructions and do not assume a purpose!

## Goal

Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit purpose for the next steps.
This handoff plan should be thorough in capturing technical details, code patterns, and architectural decisions that will be essential for continuing development work without losing context.

## Process

Before providing your final plan, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like file names, full code snippets, function signatures, file edits, etc
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your plan should include the following sections:

1. **Primary Request and Intent**: Capture all of the user's explicit requests and intents in detail
2. **Key Technical Concepts**: List all important technical concepts, technologies, and frameworks discussed.
3. **Files and Code Sections**: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. **Problem Solving**: Document problems solved and any ongoing troubleshooting efforts.
5. **Pending Tasks**: Outline any pending tasks that you have explicitly been asked to work on.
6. **Current Work**: Describe in detail precisely what was being worked on immediately before this handoff request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
7. **Optional Next Step**: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's explicit requests, and the task you were working on immediately before this handoff request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests without confirming with the user first.

Additionally create a "slug" for this handoff.  The "slug" is how we will refer to it later in a few places.  Examples:

* current-user-api-handler
* implement-auth
* fix-issue-42

Together with the slug create a "Readable Summary".  Examples:

* Implement Currnet User API Handler
* Implement Authentication
* Fix Issue #42

## Output Structure

Here's an example of how your output should be structured:

\`\`\` markdown
# Readable Summary

<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<plan>
# Session Handoff Plan

## 1. Primary Request and Intent
[Detailed description of all user requests and intents]

## 2. Key Technical Concepts
- [Concept 1]
- [Concept 2]
- [...]

## 3. Files and Code Sections
### [File Name 1]
- **Why important**: [Summary of why this file is important]
- **Changes made**: [Summary of the changes made to this file, if any]
- **Code snippet**:
\`\`\` language
[Important Code Snippet]
\`\`\`

### [File Name 2]
- **Code snippet**:
\`\`\` language
[Important Code Snippet]
\`\`\`

[...]

## 4. Problem Solving
[Description of solved problems and ongoing troubleshooting]

## 5. Next Step
[Required next step to take, directly aligned with user's explicit handoff purpose]
</plan>
\`\`\`

## Final Step

Provide your complete handoff summary with all the sections above. The system will save it to a file automatically.

Make sure to include both the slug and readable summary in your response as described.`;
};

async function createHandoffDocument(
  {
    modelManager,
    tokenTracker,
    sessionManager: messageHistory,
  }: CommandOptions,
  purpose: string,
): Promise<string> {
  const app = "handoff-agent";

  const model = modelManager.getModel(app);
  const modelConfig = modelManager.getModelMetadata(app);
  // Get conversation history
  const messages = messageHistory.get();
  const conversationText = messages
    .map((msg) => {
      let content = "";
      if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(
            (part): part is { type: "text"; text: string } =>
              part.type === "text",
          )
          .map((part) => part.text)
          .join("\n");
      } else if (typeof msg.content === "string") {
        content = msg.content;
      }
      return `${msg.role}: ${content}`;
    })
    .filter((text) => text?.trim())
    .join("\n\n");

  const fullPrompt = `${handoffPrompt(purpose)}\n\n## Conversation History\n\n${conversationText}`;

  const aiConfig = new AiConfig({
    modelMetadata: modelConfig,
    prompt: fullPrompt,
  });

  let result: Awaited<ReturnType<typeof generateText>>;

  try {
    result = await generateText({
      model,
      maxOutputTokens: aiConfig.maxOutputTokens(),
      system:
        "You are a helpful AI assistant tasked with creating detailed handoff summaries for coding agents. Focus on technical accuracy and completeness so that another agent can seamlessly continue the work.",
      prompt: fullPrompt,
      temperature: aiConfig.temperature(),
      topP: aiConfig.topP(),
      providerOptions: aiConfig.providerOptions(),
    });
  } catch (error) {
    console.error(`Error generating handoff text: ${error}`);
    throw new Error(
      `Failed to generate handoff summary: ${(error as Error).message}`,
    );
  }

  const { text, usage } = result;
  tokenTracker.trackUsage(app, usage);

  if (!text || text.trim().length === 0) {
    throw new Error("AI returned empty response");
  }

  // Generate slug from purpose (shortened for compact filenames)
  let slug = purpose
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 20); // Shorter limit for compact filenames

  // If slug is empty after processing, use a default
  if (!slug) {
    slug = "session";
  }

  // Generate filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const filename = `${timestamp}-${slug}.md`;
  const handoffsDir = ".acai/handoffs";
  const filepath = `${handoffsDir}/${filename}`;

  // Create the final handoff document with metadata
  const handoffDocument = `${text}

---
*Generated on ${now.toISOString()} for purpose: ${purpose}*
*This handoff file can be used to continue the work using the /pickup command*`;

  // Ensure handoffs directory exists and save the file
  try {
    await mkdir(handoffsDir, { recursive: true });
    await writeFile(filepath, handoffDocument, "utf-8");
    return filename;
  } catch (error) {
    console.error(`Failed to save handoff file: ${error}`);
    throw new Error(`Failed to save handoff file: ${(error as Error).message}`);
  }

  // console.info(`Handoff document created: ${filename}`);
}
