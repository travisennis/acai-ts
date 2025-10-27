import { input } from "./terminal/input-prompt.ts";
import { select } from "./terminal/select-prompt.ts";
import style from "./terminal/style.ts";

interface AskContext {
  toolName: string;
  toolCallId: string;
  message: string;
  choices: {
    accept: string;
    acceptAll: string;
    reject: string;
  };
}

export type AskResponse =
  | { result: "accept" | "accept-all"; reason?: string }
  | { result: "reject"; reason: string };

export class ToolExecutor {
  private autoAcceptAll: boolean;
  private autoAcceptMap = new Map<string, boolean>();

  constructor(autoAcceptAll: boolean) {
    this.autoAcceptAll = autoAcceptAll;
  }

  autoAccept(toolName: string) {
    return !!this.autoAcceptMap.get(toolName);
  }

  async ask(
    ctx: AskContext,
    { abortSignal }: { abortSignal?: AbortSignal },
  ): Promise<AskResponse> {
    if (this.autoAcceptAll) {
      return {
        result: "accept-all",
      };
    }
    if (this.autoAcceptMap.has(ctx.toolName)) {
      if (this.autoAcceptMap.get(ctx.toolName) === true) {
        return {
          result: "accept-all",
        };
      }
    }

    let userChoice: "accept" | "accept-all" | "reject";
    try {
      userChoice = await select({
        message: `${style.blue.bold("●")} ${ctx.message}`,
        choices: [
          { name: ctx.choices.accept, value: "accept" },
          {
            name: ctx.choices.acceptAll,
            value: "accept-all",
          },
          { name: ctx.choices.reject, value: "reject" },
        ],
        initial: 0,
        signal: abortSignal,
      });
    } catch (e) {
      // Handle Ctrl-C cancellation
      if (e instanceof Error && "isCanceled" in e && e.isCanceled === true) {
        throw new Error("Operation cancelled by user");
      }
      if ((e as Error).name === "AbortError") {
        throw new Error("Operation aborted during user input");
      }
      throw e;
    }

    if (userChoice === "reject") {
      let reason: string;
      try {
        reason = await input({
          message: `${style.yellowBright.bold("●")} Feedback`,
          signal: abortSignal,
        });
      } catch (e) {
        // Handle Ctrl-C cancellation
        if (e instanceof Error && "isCanceled" in e && e.isCanceled === true) {
          throw new Error("Operation cancelled by user");
        }
        if ((e as Error).name === "AbortError") {
          throw new Error("Operation aborted during user input");
        }
        throw e;
      }

      return {
        result: userChoice,
        reason,
      };
    }

    if (userChoice === "accept-all") {
      this.autoAcceptMap.set(ctx.toolName, true);
    }

    return {
      result: userChoice,
    };
  }
}
