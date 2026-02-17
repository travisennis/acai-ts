import { Container } from "../tui.ts";
import { Markdown } from "./markdown.ts";

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
  private contentContainer: Container;

  constructor(message?: {
    type: "message-start" | "message" | "message-end";
    role: "assistant";
    content: string;
  }) {
    super();

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    if (message) {
      this.updateContent(message);
    }
  }

  updateContent(message: {
    type: "message-start" | "message" | "message-end";
    role: "assistant";
    content: string;
  }): void {
    // Clear content container
    this.contentContainer.clear();

    const content = message.content;
    // Assistant text messages with no background - trim the text
    // Set paddingY=0 to avoid extra spacing before tool executions
    this.contentContainer.addChild(
      new Markdown(content.trim(), { paddingX: 1, paddingY: 0 }),
    );
  }
}
