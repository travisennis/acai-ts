import { spawn } from "node:child_process";
import type { ModelMessage, TextPart } from "ai";
import type { CommandOptions, ReplCommand } from "./types.ts";

function extractLastAssistantText(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as ModelMessage | undefined;
    if (!msg) continue;
    if (msg.role !== "assistant") continue;
    if (!("content" in msg) || !Array.isArray(msg.content)) continue;

    // Find last text part
    for (let j = msg.content.length - 1; j >= 0; j--) {
      const part = msg.content[j];
      if (part && part.type === "text" && typeof (part as TextPart).text === "string") {
        const text = (part as TextPart).text;
        if (text.trim().length > 0) return text;
      }
    }
  }
  return null;
}

function writeToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform; // 'darwin', 'win32', 'linux'

    const tryLinux = () => {
      // Try xclip first
      let child = spawn("xclip", ["-selection", "clipboard"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      let connected = true;
      child.on("error", () => {
        connected = false;
        // Fallback to xsel
        child = spawn("xsel", ["--clipboard", "--input"], {
          stdio: ["pipe", "ignore", "ignore"],
        });
        child.on("error", () =>
          reject(new Error("Neither xclip nor xsel is available")),
        );
        child.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`xsel exited with code ${code ?? -1}`));
        });
        child.stdin?.end(text);
      });
      child.on("exit", (code) => {
        if (!connected) return; // handled in error branch
        if (code === 0) resolve();
        else {
          // try xsel if xclip returns non-zero
          const fallback = spawn("xsel", ["--clipboard", "--input"], {
            stdio: ["pipe", "ignore", "ignore"],
          });
          fallback.on("error", () =>
            reject(new Error("Neither xclip nor xsel is available")),
          );
          fallback.on("exit", (code2) => {
            if (code2 === 0) resolve();
            else reject(new Error(`xsel exited with code ${code2 ?? -1}`));
          });
          fallback.stdin?.end(text);
        }
      });
      child.stdin?.end(text);
    };

    if (platform === "darwin") {
      const child = spawn("pbcopy", [], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      child.on("error", (err) => reject(err));
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pbcopy exited with code ${code ?? -1}`));
      });
      child.stdin?.end(text);
      return;
    }

    if (platform === "win32") {
      const child = spawn("clip", [], { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", (err) => reject(err));
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`clip exited with code ${code ?? -1}`));
      });
      child.stdin?.end(text);
      return;
    }

    // Linux and others
    tryLinux();
  });
}

export function copyCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/copy",
    description: "Copy the last assistant response to the clipboard",
    result: "continue",
    async getSubCommands() {
      return [];
    },
    async execute(_args: string[]) {
      const { messageHistory, terminal } = options;
      const history = messageHistory.get();

      const lastText = extractLastAssistantText(history);
      if (!lastText) {
        terminal.info("No assistant response to copy.");
        return;
      }

      try {
        await writeToClipboard(lastText);
        terminal.success("Copied last response to clipboard.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        terminal.error(`Could not copy to clipboard: ${message}`);
      }
    },
  };
}
