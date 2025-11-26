import { Container } from "../tui.ts";
import { Markdown } from "./markdown.ts";
import { Spacer } from "./spacer.ts";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
  private markdown: Markdown;

  constructor(text: string) {
    super();

    this.addChild(new Spacer(1));

    // User messages with dark gray background
    this.markdown = new Markdown(text, {
      customBgRgb: {
        r: 52,
        g: 53,
        b: 65,
      },
    });
    this.addChild(this.markdown);

    this.addChild(new Spacer(1));
  }
}
