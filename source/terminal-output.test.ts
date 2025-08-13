#!/usr/bin/env -S node --no-warnings

/**
 * Terminal Output Test Module
 *
 * Exercises all methods and features of the Terminal class for testing purposes.
 * Demonstrates various markdown rendering capabilities.
 */

import { initTerminal } from "./terminal/index.ts";

// Initialize terminal
const terminal = initTerminal({
  useColors: true,
  showProgressIndicators: true,
});

// Test all terminal methods and features
function testTerminalOutput(): void {
  // Clear screen and show welcome
  terminal.clear();
  terminal.displayWelcome();

  // Test basic output methods
  terminal.header("Basic Output Methods");
  terminal.writeln("This is a basic write line");
  terminal.write("This is a basic write without newline");
  terminal.lineBreak();
  terminal.emphasize("This is emphasized text");
  terminal.info("This is an info message");
  terminal.success("This is a success message");
  terminal.warn("This is a warning message");
  terminal.error("This is an error message");
  terminal.lineBreak();

  // Test markdown display
  terminal.header("Markdown Display Features");

  // Headers
  terminal.display("# This is an H1 Header");
  terminal.display("## This is an H2 Header");
  terminal.display("### This is an H3 Header");
  terminal.display("#### This is an H4 Header");
  terminal.display("##### This is an H5 Header");
  terminal.display("###### This is an H6 Header");

  // Text formatting
  terminal.display("**This is bold text**");
  terminal.display("*This is italic text*");
  terminal.display("***This is bold and italic text***");
  terminal.display("This is `inline code` text");
  terminal.display("~~This is strikethrough text~~");

  // Links
  terminal.display("This is a [link](https://example.com)");

  // Images
  terminal.display("This is an ![image](https://example.com/image.jpg)");

  // Blockquotes
  terminal.display("> This is a blockquote");
  terminal.display("> This is a\n> multi-line blockquote");

  // Horizontal rule
  terminal.display("---");

  // Lists
  terminal.display("- This is an unordered list item");
  terminal.display("- This is another unordered list item");
  terminal.display("  - This is a nested list item");
  terminal.display("    - This is a double nested list item");

  terminal.display("1. This is an ordered list item");
  terminal.display("2. This is another ordered list item");
  terminal.display("   1. This is a nested ordered list item");
  terminal.display("   2. This is another nested ordered list item");

  // Code blocks
  terminal.display(
    "```javascript\nconst greeting = 'Hello World';\nconsole.log(greeting);\n```",
  );
  terminal.display("```python\ndef hello():\n    print('Hello World')\n```");
  terminal.display("```\nThis is a plain code block\n```");

  // Tables
  terminal.display(
    "| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |",
  );

  // Paragraphs
  terminal.display(
    "This is a paragraph with some **bold** and *italic* text. " +
      "It also contains `inline code` and a [link](https://example.com). " +
      "Here's an ![image](image.jpg) for good measure.",
  );

  terminal.display(
    "This is another paragraph that demonstrates how line breaks work " +
      "in markdown with the terminal display. It should wrap appropriately based " +
      "on the terminal width.",
  );

  // Complex markdown example
  const complexMarkdown = `
# Complex Markdown Example

This is a complex example showing various **markdown** features in *one* document.

## Features Demonstrated

1. **Headers** of different levels
2. *Text formatting* options
3. \`Code elements\` of various types
4. [External links](https://example.com)
5. ![Images](image.jpg)
6. Blockquotes

   > Blockquotes

7. Horizontal rules
8. Lists (ordered and unordered)
9. Tables
10. Code blocks

## Code Example

Here's some JavaScript code:

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
~~strikethrough text~~, [a link](https://example.com), and ![an image](image.jpg).

The end of this complex example.
  `;

  terminal.header("Complex Markdown Example");
  terminal.display(complexMarkdown);

  // Test other terminal features
  terminal.header("Other Terminal Features");

  // Box display
  terminal.box("Info Box", "This is content inside a box with a header");
  terminal.box(
    "Code",
    `
\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`
`,
  );

  terminal.box(
    "Markdown Block",
    `
This paragraph contains **bold text**, *italic text*, \`inline code\`, 
~~strikethrough text~~, [a link](https://example.com), and ![an image](image.jpg).
`,
  );

  // Horizontal rule
  terminal.hr();

  // Table
  terminal.table(
    [
      ["Headers", "Working"],
      ["Text Formatting", "Working"],
      ["Lists", "Working"],
      ["Code Blocks", "Working"],
      ["Tables", "Working"],
      ["Links", "Working"],
      ["Images", "Working"],
      ["Blockquotes", "Working"],
    ],
    { header: ["Feature", "Status"] },
  );

  // Progress bar
  terminal.header("Progress Bar Example");
  for (let i = 0; i <= 100; i += 10) {
    terminal.displayProgressBar(i, 100);
  }

  // Spinner (demonstration)
  // terminal.header("Spinner Example");
  // const spinner = terminal.spinner("Loading...");
  // setTimeout(() => {
  //   spinner.succeed("Loading complete!");
  // }, 2000);

  // Terminal info
  terminal.header("Terminal Information");
  terminal.writeln(
    `Terminal size: ${terminal["terminalWidth"]}x${terminal["terminalHeight"]}`,
  );
  terminal.writeln(`Is interactive: ${terminal["isInteractive"]}`);

  // Link example
  terminal.header("Link Example");
  terminal.writeln(
    `Visit ${terminal.link("Google", "https://google.com")} for search`,
  );

  // Alert
  terminal.alert();

  // Final message
  terminal.success("All terminal features tested successfully!");
}

// Run the test
testTerminalOutput();
