#!/usr/bin/env -S node --no-warnings

/**
 * TUI Output Test Module
 *
 * Exercises all methods and features of the TUI system for testing purposes.
 * Demonstrates various TUI components and rendering capabilities.
 */

import { Editor } from "./components/editor.ts";
import { Input } from "./components/input.ts";
import { Loader } from "./components/loader.ts";
import { Markdown } from "./components/markdown.ts";
// import { Modal, ModalTable, ModalText } from "./components/modal.ts";
import { type SelectItem, SelectList } from "./components/select-list.ts";
import { Spacer } from "./components/spacer.ts";
import { Text } from "./components/text.ts";
import { Welcome } from "./components/welcome.ts";
import { ProcessTerminal, type Terminal } from "./terminal.ts";
import { Container, TUI } from "./tui.ts";

// Initialize TUI
const terminal: Terminal = new ProcessTerminal();
const tui = new TUI(terminal);

// Test all TUI components and features
function testTuiOutput(): void {
  const container = new Container();

  container.addChild(new Welcome({ type: "simple" }));

  // Test basic text components
  container.addChild(new Text("TUI Output Test", 1, 1));
  container.addChild(new Spacer(1));

  // Test Markdown component with various features
  container.addChild(
    new Markdown(
      "# TUI Markdown Test\n\nThis demonstrates the TUI markdown rendering capabilities.",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Headers
  container.addChild(
    new Markdown(
      "# H1 Header\n## H2 Header\n### H3 Header\n#### H4 Header\n##### H5 Header\n###### H6 Header",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Text formatting
  container.addChild(
    new Markdown(
      "**Bold text**\n*Italic text*\n***Bold and italic***\n`Inline code`\n~~Strikethrough~~",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Links
  container.addChild(
    new Markdown("[Link to example](https://example.com)", {
      paddingX: 1,
      paddingY: 0,
    }),
  );

  // Lists
  container.addChild(
    new Markdown(
      "- Unordered list item 1\n- Unordered list item 2\n  - Nested item\n    - Double nested\n\n1. Ordered list item 1\n2. Ordered list item 2\n   1. Nested ordered\n   2. Another nested",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Code blocks
  container.addChild(
    new Markdown(
      "```javascript\nconst greeting = 'Hello World';\nconsole.log(greeting);\n```\n\n```python\ndef hello():\n    print('Hello World')\n```",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Tables
  container.addChild(
    new Markdown(
      "| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Blockquotes
  container.addChild(
    new Markdown(
      "> This is a blockquote\n> \n> With multiple lines\n> \n> > And nested blockquotes",
      {
        paddingX: 1,
        paddingY: 0,
      },
    ),
  );

  // Horizontal rule
  container.addChild(new Markdown("---", { paddingX: 1, paddingY: 0 }));

  // Complex markdown example
  const complexMarkdown = `
# Complex Markdown Example

This is a complex example showing various **markdown** features in *one* document.

## Features Demonstrated

1. **Headers** of different levels
2. *Text formatting* options
3. \`Code elements\` of various types
4. [External links](https://example.com)
5. Lists (ordered and unordered)
6. Blockquotes
7. Horizontal rules
8. Tables
9. Code blocks

## Code Example

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`

## Table Example

| Name | Age | City |
|------|-----|------|
| John | 30  | New York |
| Jane | 25  | Boston |
| Bob  | 35  | Chicago |

## Blockquote Example

> This is a blockquote.
> 
> It can span multiple lines.
> 
> > It can also contain nested blockquotes.

---

## List Examples

### Unordered List

- Item 1
- Item 2
  - Nested item 2.1
  - Nested item 2.2
    - Double nested item 2.2.1
- Item 3

### Ordered List

1. First item
2. Second item
   1. Nested item 2.1
   2. Nested item 2.2
      1. Double nested item 2.2.1
3. Third item

## Inline Elements

This paragraph contains **bold text**, *italic text*, \`inline code\`, 
~~strikethrough text~~, [a link](https://example.com).

The end of this complex example.
  `;

  container.addChild(
    new Markdown(complexMarkdown, { paddingX: 1, paddingY: 0 }),
  );

  // Test Text component with different backgrounds
  container.addChild(new Spacer(2));
  container.addChild(new Text("Text Component Examples", 1, 1));
  container.addChild(new Spacer(1));

  // Regular text
  container.addChild(
    new Text(
      "This is regular text with padding and word wrapping capabilities.",
      2,
      1,
    ),
  );

  // Text with custom background
  container.addChild(
    new Text("Text with custom background color", 2, 1, {
      r: 50,
      g: 50,
      b: 100,
    }),
  );

  // Long text that should wrap
  container.addChild(
    new Text(
      "This is a very long line of text that should wrap to multiple lines when displayed in the terminal. It demonstrates the word wrapping functionality of the Text component.",
      2,
      1,
    ),
  );

  // Test Markdown with custom backgrounds
  container.addChild(new Spacer(2));
  container.addChild(
    new Markdown(
      "# Markdown with Background\n\nThis markdown has a custom background color.",
      {
        customBgRgb: { r: 30, g: 60, b: 30 },
        paddingX: 2,
        paddingY: 1,
      },
    ),
  );

  // Test SelectList component
  container.addChild(new Spacer(2));
  container.addChild(new Text("Select List Example", 1, 1));
  container.addChild(new Spacer(1));

  const selectItems: SelectItem[] = [
    { label: "Option 1", value: "1" },
    { label: "Option 2", value: "2" },
    { label: "Option 3", value: "3" },
    { label: "Option 4", value: "4" },
    { label: "Option 5", value: "5" },
  ];

  const selectList = new SelectList(selectItems, 5);
  container.addChild(selectList);

  // Test Loader component
  container.addChild(new Spacer(2));
  container.addChild(new Text("Loader Component", 1, 1));
  container.addChild(new Spacer(1));

  const loader = new Loader(tui, "Loading TUI components...");
  container.addChild(loader);

  // Test Input component
  container.addChild(new Spacer(2));
  container.addChild(new Text("Input Component", 1, 1));
  container.addChild(new Spacer(1));

  const input = new Input();
  container.addChild(input);

  // Test Editor component
  container.addChild(new Spacer(2));
  container.addChild(new Text("Editor Component", 1, 1));
  container.addChild(new Spacer(1));

  const editor = new Editor({
    borderColor: (str: string) => str, // Simple identity function for test
  });
  editor.setText("This is some initial text in the editor.");
  container.addChild(editor);

  // Add all components to TUI
  tui.addChild(container);

  // Start the TUI
  tui.start();

  // Demonstrate modal functionality after a delay
  // setTimeout(() => {
  //   // Show a modal with text
  //   const modalText = new Modal(
  //     "TUI Test Complete",
  //     new ModalText(
  //       "All TUI components have been successfully tested and rendered.\n\nPress any key to continue or ESC to close.",
  //       1,
  //       1,
  //     ),
  //     true,
  //   );
  //   tui.showModal(modalText);

  //   // Show a table modal after another delay
  //   setTimeout(() => {
  //     const modalTable = new Modal(
  //       "Test Results",
  //       new ModalTable(
  //         [
  //           ["Component", "Status"],
  //           ["Text", "✓ Working"],
  //           ["Markdown", "✓ Working"],
  //           ["SelectList", "✓ Working"],
  //           ["Loader", "✓ Working"],
  //           ["Input", "✓ Working"],
  //           ["Editor", "✓ Working"],
  //           ["Modal", "✓ Working"],
  //         ],
  //         ["Component", "Status"],
  //       ),
  //       true,
  //     );
  //     tui.showModal(modalTable);
  //   }, 3000);
  // }, 2000);

  // Set up exit handler
  process.on("SIGINT", () => {
    console.log("\nSIGINT received - exiting TUI test...");
    tui.stop();
    process.exit(0);
  });

  // Auto-exit after 10 seconds for testing
  setTimeout(() => {
    console.log("\nAuto-exiting TUI test after 10 seconds...");
    tui.stop();
    process.exit(0);
  }, 10000);
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTuiOutput();
}

export { testTuiOutput };
