import style from "../../terminal/style.ts";
import { Container } from "../tui.ts";
import { Markdown } from "./markdown.ts";
import { Text } from "./text.ts";

/**
 * Component that renders a thinking block
 */
export class ThinkingBlockComponent extends Container {
  private contentContainer: Container;
  private verboseMode: boolean;
  private lastContent = "";
  private isThinking = false;
  private thinkingComplete = false;

  constructor(
    message?: { content: string },
    options?: { verboseMode?: boolean },
  ) {
    super();
    this.verboseMode = options?.verboseMode ?? false;

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    if (message) {
      this.updateContent(message);
    }
  }

  updateContent(message: { content: string }): void {
    this.lastContent = message.content;
    this.isThinking = true;
    this.renderContent();
  }

  endThinking(): void {
    this.isThinking = false;
    this.thinkingComplete = true;
    this.renderContent();
  }

  setVerboseMode(verboseMode: boolean): void {
    this.verboseMode = verboseMode;
    this.renderContent();
  }

  private renderContent(): void {
    // Clear content container
    this.contentContainer.clear();

    const content = this.lastContent;

    if (this.verboseMode) {
      // Verbose mode: show full thinking content
      this.contentContainer.addChild(
        new Markdown(style.dim(content.trim()), {
          paddingX: 1,
          paddingY: 0,
        }),
      );
    } else if (this.isThinking) {
      // Non-verbose mode: show animated "Thinking"
      this.contentContainer.addChild(
        new Text(
          style.dim(`Thinking ${generateRandomChars(10, lowercase)}`),
          1,
          0,
        ),
      );
    } else if (this.thinkingComplete) {
      // Non-verbose mode: show "Thinking ✓" when complete
      this.contentContainer.addChild(new Text(style.dim("Thinking ✓"), 1, 0));
    }
    // If not verbose and not thinking, show nothing
  }
}

// const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lowercase = "abcdefghijklmnopqrstuvwxyz";

function generateRandomChars(length: number, charset?: string): string {
  const chars =
    charset ?? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}
