import style from "../../terminal/style.ts";
import { Container } from "../tui.ts";
import { Markdown } from "./markdown.ts";
import { Spacer } from "./spacer.ts";
import { Text } from "./text.ts";

/**
 * Component that renders a thinking block
 */
export class ThinkingBlockComponent extends Container {
  private contentContainer: Container;
  private verboseMode: boolean;
  private animationFrame = 0;
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

    if (this.lastContent.length > 0) {
      this.contentContainer.addChild(new Spacer(1));
    }

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
      // Non-verbose mode: show animated "Thinking..."
      this.animationFrame++;
      const dots = ".".repeat((this.animationFrame % 3) + 1);
      this.contentContainer.addChild(
        new Text(style.dim(`Thinking${dots}`), 1, 0),
      );
    } else if (this.thinkingComplete) {
      // Non-verbose mode: show "Thinking ✓" when complete
      this.contentContainer.addChild(new Text(style.dim("Thinking ✓"), 1, 0));
    }
    // If not verbose and not thinking, show nothing
  }
}
