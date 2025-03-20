import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import Table from "cli-table3";
import type { ReplCommand, CommandOptions } from "./types.ts";
import { grepFiles } from "../tools/grep.ts";

export const todoCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/todo",
    description: "List or add TODOs across the project",
    result: "continue" as const,
    execute: async function (args: string[]) {
      if (args.length > 0 && args[0] === "add") {
        // Add a new TODO
        if (args.length < 2) {
          terminal.warn("Usage: /todo add <message> [file]");
          return;
        }

        const message = args
          .slice(1, args.length - (args.length > 2 ? 1 : 0))
          .join(" ");
        const targetFile = args.length > 2 ? args[args.length - 1] : undefined;

        await addTodo.call(this, message, targetFile);
        return;
      }

      // List TODOs
      terminal.header("Finding TODOs in project...");

      // Common TODO patterns in code
      const patterns = [
        "TODO:",
        "TODO",
        "FIXME:",
        "FIXME",
        "HACK:",
        "HACK",
        "NOTE:",
        "NOTE",
        "XXX:",
        "XXX",
        "@todo",
      ];

      const patternRegex = patterns
        .map((p) => p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"))
        .join("|");

      try {
        // Use grep to find TODOs across files
        const todoResults = await Promise.all([
          // Check code files
          grepFilesWithContext.call(this, {
            pattern: `(//|#|<!--|\\\\*|;)[ ]*(${patternRegex})`,
            path: process.cwd(),
            recursive: true,
            ignoreCase: true,
            contextLines: 0,
            filePattern:
              "*.{js,ts,tsx,jsx,py,rb,html,css,md,go,rust,java,c,cpp,cs,php}",
          }),
          // Check markdown files for task lists
          grepFilesWithContext.call(this, {
            pattern: "- \\\\[ \\\\]",
            path: process.cwd(),
            recursive: true,
            ignoreCase: false,
            contextLines: 0,
            filePattern: "*.md",
          }),
        ]);

        // Parse and display results
        const todos = parseTodoResults(todoResults);

        if (todos.length === 0) {
          terminal.info("No TODOs found in project");
          return;
        }

        // Group TODOs by file
        const todosByFile = groupTodosByFile(todos);

        // Display results in a nice format
        displayTodos.call(this, todosByFile);
      } catch (error) {
        terminal.error(`Error finding TODOs: ${(error as Error).message}`);
      }
    },
  } satisfies ReplCommand;
};

// Helper functions
async function addTodo(this: any, message: string, targetFile?: string) {
  try {
    if (!targetFile) {
      // Ask for file if not provided
      targetFile = await input({
        message: "Which file to add the TODO to?",
        default: "docs/todo.md",
      });
    }

    // Add TODO to file
    const fileExtension = path.extname(targetFile).toLowerCase();
    let todoContent = "";

    if (fileExtension === ".md") {
      // Add as markdown task
      todoContent = `- [ ] ${message}\
`;

      try {
        // Read existing file
        const content = await readFile(targetFile, "utf8");
        // Append the new TODO
        await writeFile(targetFile, content + todoContent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          // Create file if it doesn't exist
          await writeFile(targetFile, `# TODOs ${todoContent}`);
        } else {
          throw error;
        }
      }
    } else {
      // Add as code comment
      const commentPrefix = getCommentPrefixForFile(targetFile);
      todoContent = `${commentPrefix} TODO: ${message}\
`;

      const content = await readFile(targetFile, "utf8");
      // Insert at current cursor position or top of file
      await writeFile(targetFile, content + todoContent);
    }

    this.terminal.success(`Added TODO to ${targetFile}`);
  } catch (error) {
    this.terminal.error(`Error adding TODO: ${(error as Error).message}`);
  }
}

function getCommentPrefixForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
    case ".ts":
    case ".jsx":
    case ".tsx":
    case ".css":
    case ".java":
    case ".c":
    case ".cpp":
    case ".cs":
      return "//";
    case ".py":
      return "#";
    case ".html":
      return "<!--";
    case ".rb":
      return "#";
    case ".php":
      return "//";
    default:
      return "//";
  }
}

function grepFilesWithContext(options: {
  pattern: string;
  path: string;
  recursive: boolean;
  ignoreCase: boolean;
  contextLines: number;
  filePattern?: string;
}): string {
  return grepFiles(options.pattern, options.path, options);
}

function parseTodoResults(
  results: string[],
): Array<{ file: string; line: number; content: string }> {
  const todos: Array<{ file: string; line: number; content: string }> = [];

  for (const result of results.flat()) {
    const lines =
      result.split(
        "\
",
      );
    for (const line of lines) {
      // Match grep output format (filepath:line:content)
      const match = line.match(/^([^:]+):(\\d+):(.*)/);
      if (match) {
        const [, file, lineNum, content] = match;
        if (file && lineNum && content) {
          todos.push({
            file,
            line: Number.parseInt(lineNum, 10),
            content: content.trim(),
          });
        }
      }
    }
  }

  return todos;
}

function groupTodosByFile(
  todos: Array<{ file: string; line: number; content: string }>,
) {
  const result: Record<string, Array<{ line: number; content: string }>> = {};

  for (const todo of todos) {
    if (!result[todo.file]) {
      result[todo.file] = [];
    }
    result[todo.file]?.push({
      line: todo.line,
      content: todo.content,
    });
  }

  return result;
}

function displayTodos(
  this: any,
  todosByFile: Record<string, Array<{ line: number; content: string }>>,
) {
  this.terminal.writeln("");

  for (const [file, todos] of Object.entries(todosByFile)) {
    this.terminal.subHeader(`${file} (${todos.length})`);

    const table = new Table({
      head: ["Line", "TODO"],
      colWidths: [8, 70],
    });

    for (const todo of todos) {
      table.push([todo.line.toString(), todo.content]);
    }

    console.info(table.toString());
    this.terminal.writeln("");
  }

  const totalTodos = Object.values(todosByFile).reduce(
    (sum, todos) => sum + todos.length,
    0,
  );

  this.terminal.success(
    `Found ${totalTodos} TODOs in ${Object.keys(todosByFile).length} files`,
  );
}
