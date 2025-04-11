import { existsSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { anthropic } from "@ai-sdk/anthropic";
import type { SendData } from "./index.ts";

interface TextEditorOptions {
  modelId: string;
  workingDir: string;
  // This is optional and may be used in future implementations
  sendData?: SendData;
}

export const createTextEditorTool = ({
  modelId,
  workingDir,
  sendData,
}: TextEditorOptions) => {
  if (modelId.includes("3-7-sonnet")) {
    return {
      // biome-ignore lint/style/useNamingConvention: <explanation>
      str_replace_editor: anthropic.tools.textEditor_20250124({
        execute: async ({
          command,
          path,
          file_text,
          insert_line,
          new_str,
          old_str,
          view_range,
        }) => {
          const uuid = crypto.randomUUID();
          // Make sure the path is under the workingDir
          if (!path.startsWith(workingDir)) {
            return `Error: Path ${path} is not within the working directory ${workingDir}`;
          }
          // Send event for tool initialization
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Executing ${command} operation on ${path}`,
          });

          let result: string;
          try {
            switch (command) {
              case "view":
                result = await view({
                  path,
                  viewRange: view_range || undefined,
                });
                break;
              case "create":
                result = await create({ path, fileText: file_text || "" });
                break;
              case "str_replace":
                result = await strReplace({
                  path,
                  oldStr: old_str || "",
                  newStr: new_str || "",
                });
                break;
              case "insert":
                result = await insert({
                  path,
                  insertLine: insert_line || 0,
                  newStr: new_str || "",
                });
                break;
              case "undo_edit":
                result = await undoEdit({ path });
                break;
              default:
                result = "Unrecognized command.";
            }

            // Send completion event
            sendData?.({
              event: "tool-completion",
              id: uuid,
              data: `${command} operation completed successfully`,
            });

            return result;
          } catch (error) {
            // Send error event
            sendData?.({
              event: "tool-error",
              id: uuid,
              data: `Error in ${command} operation: ${error instanceof Error ? error.message : String(error)}`,
            });

            return `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    };
  }
  if (modelId.includes("3-5-sonnet")) {
    return {
      // biome-ignore lint/style/useNamingConvention: <explanation>
      str_replace_editor: anthropic.tools.textEditor_20241022({
        execute: async ({
          command,
          path,
          file_text,
          insert_line,
          new_str,
          old_str,
          view_range,
        }) => {
          const uuid = crypto.randomUUID();
          // Make sure the path is under the workingDir
          if (!path.startsWith(workingDir)) {
            return `Error: Path ${path} is not within the working directory ${workingDir}`;
          }
          // Send event for tool initialization
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Executing ${command} operation on ${path}`,
          });

          let result: string;
          try {
            switch (command) {
              case "view":
                result = await view({
                  path,
                  viewRange: view_range || undefined,
                });
                break;
              case "create":
                result = await create({ path, fileText: file_text || "" });
                break;
              case "str_replace":
                result = await strReplace({
                  path,
                  oldStr: old_str || "",
                  newStr: new_str || "",
                });
                break;
              case "insert":
                result = await insert({
                  path,
                  insertLine: insert_line || 0,
                  newStr: new_str || "",
                });
                break;
              case "undo_edit":
                result = await undoEdit({ path });
                break;
              default:
                result = "Unrecognized command.";
            }

            // Send completion event
            sendData?.({
              event: "tool-completion",
              id: uuid,
              data: `${command} operation completed successfully`,
            });

            return result;
          } catch (error) {
            // Send error event
            sendData?.({
              event: "tool-error",
              id: uuid,
              data: `Error in ${command} operation: ${error instanceof Error ? error.message : String(error)}`,
            });

            return `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    };
  }
  throw new Error("Unsupported tools.");
};

/**
 * The view command allows Claude to examine the contents of a file. It can read the entire file or a specific range of lines.
 *
 * @param {Object} params - The parameters object
 * @param {string} params.path - The path to the file to view
 * @param {number[]} [params.viewRange] - An array of two integers specifying the start and end line numbers to view.
 *                                        Line numbers are 1-indexed, and -1 for the end line means read to the end of the file.
 * @returns {Promise<string>} The content of the file or an error message
 */
async function view({
  path,
  viewRange,
}: { path: string; viewRange?: number[] | undefined }): Promise<string> {
  try {
    // Check if file exists
    try {
      await access(path);
    } catch {
      return `File not found: ${path}`;
    }

    const content = await readFile(path, "utf8");

    if (!viewRange) {
      return content;
    }

    const lines = content.split("\n");
    const [start, end] = viewRange;
    const startIdx = Math.max(0, (start ?? 0) - 1);
    const endIdx = end === -1 ? lines.length : Math.min(lines.length, end ?? 0);

    return lines.slice(startIdx, endIdx).join("\n");
  } catch (error) {
    return `Error viewing file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// The str_replace command allows Claude to replace a specific string in a file with a new string. This is used for making precise edits.

// The str_replace command requires an exact match for the text to be replaced. Your application should ensure that there is exactly one match for the old text or provide appropriate error messages.

// Parameters:

// command: Must be “str_replace”
// path: The path to the file to modify
// old_str: The text to replace (must match exactly, including whitespace and indentation)
// new_str: The new text to insert in place of the old text
async function strReplace({
  path,
  oldStr,
  newStr,
}: { path: string; oldStr: string; newStr: string }) {
  try {
    // Check if file exists
    try {
      await access(path);
    } catch {
      return `File not found: ${path}`;
    }

    const content = await readFile(path, "utf8");

    if (!content.includes(oldStr)) {
      return `Error: Could not find the text to replace in ${path}`;
    }

    // Create backup before modifying
    await backupFile(path);

    const newContent = content.replace(oldStr, newStr);
    await writeFile(path, newContent);

    return `Successfully replaced text in ${path}`;
  } catch (error) {
    return `Error replacing text: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// The create command allows Claude to create a new file with specified content.

// Parameters:

// command: Must be “create”
// path: The path where the new file should be created
// file_text: The content to write to the new file
async function create({ path, fileText }: { path: string; fileText: string }) {
  try {
    // Check if file exists
    if (existsSync(path)) {
      return `File already exists: ${path}`;
    }

    await writeFile(path, fileText);
    return `Successfully created file: ${path}`;
  } catch (error) {
    return `Error creating file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// The insert command allows Claude to insert text at a specific location in a file.

// Parameters:

// command: Must be “insert”
// path: The path to the file to modify
// insert_line: The line number after which to insert the text (0 for beginning of file)
// new_str: The text to insert
async function insert({
  path,
  insertLine,
  newStr,
}: { path: string; insertLine: number; newStr: string }) {
  try {
    // Check if file exists
    try {
      await access(path);
    } catch {
      return `File not found: ${path}`;
    }

    const content = await readFile(path, "utf8");
    const lines = content.split("\n");

    // Create backup before modifying
    await backupFile(path);

    // If insertLine is 0, insert at the beginning
    // Otherwise, insert after the specified line
    const insertIndex =
      insertLine === 0 ? 0 : Math.min(insertLine, lines.length);
    lines.splice(insertIndex, 0, newStr);

    const newContent = lines.join("\n");
    await writeFile(path, newContent);

    return `Successfully inserted text at line ${insertLine} in ${path}`;
  } catch (error) {
    return `Error inserting text: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// The undo_edit command allows Claude to revert the last edit made to a file. A .backup file should have been created during strReplace or insert

// Parameters:

// command: Must be “undo_edit”
// path: The path to the file whose last edit should be undone
async function undoEdit({ path }: { path: string }) {
  try {
    const backupPath = `${path}.backup`;

    // Check if backup file exists
    try {
      await access(backupPath);
    } catch {
      return `No backup file found for ${path}`;
    }

    // Check if original file exists
    try {
      await access(path);
    } catch {
      return `Original file not found: ${path}`;
    }

    // Restore from backup
    const backupContent = await readFile(backupPath, "utf8");
    await writeFile(path, backupContent);

    // Remove backup content (but keep file for tracking purposes)
    await writeFile(backupPath, "");

    return `Successfully restored ${path} from backup`;
  } catch (error) {
    return `Error restoring from backup: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function backupFile(filePath: string): Promise<void> {
  /**
   * Create a backup of a file before editing.
   */
  const backupPath = `${filePath}.backup`;
  try {
    const content = await readFile(filePath, "utf8");
    await writeFile(backupPath, content);
  } catch (error) {
    // If we can't create a backup, just log the error
    console.error(`Failed to create backup of ${filePath}: ${error}`);
  }
}
