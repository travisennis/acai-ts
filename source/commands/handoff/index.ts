import { mkdir, writeFile } from "node:fs/promises";
import { generateText } from "ai";
import { AiConfig } from "../../models/ai-config.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  generateHandoffFilename,
  generateHandoffSlug,
  handoffPrompt,
} from "./utils.ts";

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

async function createHandoffDocument(
  { modelManager, tokenTracker, sessionManager }: CommandOptions,
  purpose: string,
): Promise<string> {
  const app = "handoff-agent";

  const model = modelManager.getModel(app);
  const modelConfig = modelManager.getModelMetadata(app);
  const messages = sessionManager.get();
  const conversationText = messages
    .map(
      (msg: {
        role: string;
        content: string | Array<{ type: string; text?: string }>;
      }) => {
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
      },
    )
    .filter((text: string) => text?.trim())
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

  const slug = generateHandoffSlug(purpose);
  const filename = generateHandoffFilename(slug);
  const handoffsDir = ".acai/handoffs";
  const filepath = `${handoffsDir}/${filename}`;

  const handoffDocument = `${text}

---
*Generated on ${new Date().toISOString()} for purpose: ${purpose}*
*This handoff file can be used to continue the work using the /pickup command*`;

  try {
    await mkdir(handoffsDir, { recursive: true });
    await writeFile(filepath, handoffDocument, "utf-8");
    return filename;
  } catch (error) {
    console.error(`Failed to save handoff file: ${error}`);
    throw new Error(`Failed to save handoff file: ${(error as Error).message}`);
  }
}
