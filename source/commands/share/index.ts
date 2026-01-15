import { spawn } from "node:child_process";
import { basename } from "node:path";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Spacer, Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  estimateSessionSize,
  getSessionData,
  renderSessionHtml,
} from "./html-renderer.ts";

async function runCommand(
  cmd: string,
  args: string[],
  stdin?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
  });
}

async function checkGhInstalled(): Promise<boolean> {
  const result = await runCommand("which", ["gh"]);
  return result.exitCode === 0;
}

async function checkGhAuth(): Promise<boolean> {
  const result = await runCommand("gh", ["auth", "status"]);
  return result.exitCode === 0;
}

function extractGistId(output: string): string | null {
  const match = output.match(/gist\.github\.com\/[\w-]+\/([a-f0-9]+)/i);
  return match ? match[1] : null;
}

export const shareCommand = (options: CommandOptions): ReplCommand => {
  return {
    command: "/share",
    description:
      "Share the current session as a GitHub Gist for viewing in a web browser",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const { sessionManager } = options;

      container.addChild(new Spacer(1));

      if (sessionManager.isEmpty()) {
        container.addChild(
          new Text(
            style.yellow("No messages in current session to share."),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      container.addChild(
        new Text(style.gray("Checking GitHub CLI availability..."), 1, 0),
      );
      tui.requestRender();

      const ghInstalled = await checkGhInstalled();
      if (!ghInstalled) {
        container.addChild(
          new Text(
            style.red(
              "GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/",
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const ghAuthed = await checkGhAuth();
      if (!ghAuthed) {
        container.addChild(
          new Text(
            style.red(
              "Not authenticated with GitHub. Please run `gh auth login` first.",
            ),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const project = basename(process.cwd());
      const sessionData = getSessionData(sessionManager, project);
      const { messageCount, contentSizeBytes } =
        estimateSessionSize(sessionData);

      const isLargeSession =
        messageCount > 100 || contentSizeBytes > 100 * 1024;
      if (isLargeSession) {
        const sizeKb = Math.round(contentSizeBytes / 1024);
        container.addChild(
          new Text(
            style.yellow(
              `Large session detected: ${messageCount} messages, ~${sizeKb}KB`,
            ),
            1,
            0,
          ),
        );
        container.addChild(
          new Text(
            style.gray("Proceeding with share... (this may take a moment)"),
            1,
            0,
          ),
        );
        tui.requestRender();
      }

      container.addChild(new Text(style.gray("Creating GitHub Gist..."), 1, 0));
      tui.requestRender();

      const html = renderSessionHtml(sessionData);
      const title = sessionData.title || "Untitled Session";
      const description = `Acai session: ${title}`;

      const result = await runCommand(
        "gh",
        [
          "gist",
          "create",
          "--public",
          "--desc",
          description,
          "--filename",
          "index.html",
          "-",
        ],
        html,
      );

      if (result.exitCode !== 0) {
        container.addChild(
          new Text(
            style.red(`Failed to create Gist: ${result.stderr.trim()}`),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const gistId = extractGistId(result.stdout);
      if (!gistId) {
        container.addChild(
          new Text(style.red("Failed to extract Gist ID from response."), 1, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const gistUrl = `https://gist.github.com/${gistId}`;
      const shareUrl = `https://gistpreview.github.io/?${gistId}`;

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(style.green("Session shared successfully!"), 1, 0),
      );
      container.addChild(new Text(`View:  ${style.blue(gistUrl)}`, 1, 0));
      container.addChild(new Text(`Share: ${style.blue(shareUrl)}`, 1, 0));
      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
