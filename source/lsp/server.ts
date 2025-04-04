import { isNullOrUndefined } from "@travisennis/stdlib/typeguards";
import { generateObject, generateText } from "ai";
import type { Logger } from "pino";
import { type Range, TextDocument } from "vscode-languageserver-textdocument";
import {
  type CodeAction,
  CodeActionKind,
  type CodeActionParams,
  type Diagnostic,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  createConnection,
} from "vscode-languageserver/node.js";
import { z } from "zod";
import { dedent } from "../dedent.ts";
import { formatCodeSnippet, formatFile } from "../formatting.ts";
import type { ModelManager } from "../models/manager.ts";
import { type Selection, saveSelection } from "../savedSelections/index.ts";
import {
  type EmbeddedInstructions,
  parseInstructions,
} from "./embedding-instructions.ts";

function getSystemPrompt(mode: "ask" | "edit") {
  const promptPrefix =
    "You are acai, a coding assistant that helps with software engineering. You are called when the user activates code actions in a Language Server Protocol service. Your task is to provide concise, accurate, and efficient solutions to the user's coding requests. Focus on best practices, code optimization, and maintainability in your solutions.";
  if (mode === "ask") {
    return dedent`${promptPrefix} Add a code comment that answers the user's question. DO NOT make any edits to the code itself. This comment should be prepended to the code provided. Return the comment that contains your answer and the code. Do not wrap the code in Markdown code blocks. Ensure your response is in plain text without any Markdown formatting.
      <example>
      <request>
      \`\`\` javascript
      function add(a,b) {
        return a + b;
      }
      \`\`\`

      What does this code do?
      </request>

      <response>
      // This function takes two numbers and returns the sum.
      function add(a,b) {
        return a + b;
      }
      </response>
      </example>
      `;
  }
  return dedent`${promptPrefix} Please respond with only the revised code. If your response is a new addition to the code, then return your additions along with the original code. Only return the code. Do not wrap the code in Markdown code blocks. Ensure your answer is in plain text without any Markdown formatting.`;
}

function getEditSystemPrompt() {
  const promptPrefix =
    "You are acai, a coding assistant that helps with software engineering. You are called when the user activates code actions in a Language Server Protocol service. Your task is to analyze the given code and determine the precise modifications needed to implement the requested update. You should do this in the curent file only. Focus on best practices, code optimization, and maintainability in your solutions.";
  return dedent`${promptPrefix}
Response Format:
Return a JSON array of edits where each edit is an object with the following fields:
- "pattern": A regex pattern matching the code section to change.
- "replacement": The new code that should replace the matched pattern.

Ensure the edits are minimal, precise, and maintain code correctness. Only return the JSON.`;
}

// Store recent edits per file
const editHistory: Map<string, string[]> = new Map();

// Store mappings between files for context lookup
const fileRelations: Map<string, string[]> = new Map();

const MAX_HISTORY = 5;
// const CONTEXT_WINDOW = 5; // Number of surrounding lines

interface CodeActionData {
  id: string;
  documentUri: string;
  range: Range;
  diagnostics: Diagnostic[];
}

export function createTextDocuments() {
  // Create a text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );
  return documents;
}

export function initConnection({
  modelManager,
  documents,
  logger,
}: {
  modelManager: ModelManager;
  documents: TextDocuments<TextDocument>;
  logger: Logger;
}) {
  // Create a connection for the server
  const connection = createConnection(
    ProposedFeatures.all,
    process.stdin,
    process.stdout,
  );

  connection.onInitialize((_params: InitializeParams) => {
    logger.info("Initializing LSP server...");
    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Enable code actions
        codeActionProvider: {
          codeActionKinds: [CodeActionKind.QuickFix],
          resolveProvider: true,
        },
      },
    };
    return result;
  });

  // Register code action handler
  connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) {
      return [];
    }

    const range = params.range;

    const codeActions: CodeAction[] = [];

    // Create the Instruct code action
    const instructAction: CodeAction = {
      title: "Acai - Instruct",
      kind: CodeActionKind.QuickFix,
      diagnostics: params.context.diagnostics,
      data: {
        id: "ai.instruct",
        documentUri: params.textDocument.uri,
        range,
        diagnostics: params.context.diagnostics,
      },
      isPreferred: false,
    };
    codeActions.push(instructAction);

    // Create the Edit code action
    const editAction: CodeAction = {
      title: "Acai - Edit",
      kind: CodeActionKind.QuickFix,
      diagnostics: params.context.diagnostics,
      data: {
        id: "ai.edit",
        documentUri: params.textDocument.uri,
        range,
        diagnostics: params.context.diagnostics,
      },
      isPreferred: false,
    };
    codeActions.push(editAction);

    // Create the Save code action
    const saveAction: CodeAction = {
      title: "Acai - Save",
      kind: CodeActionKind.QuickFix,
      diagnostics: params.context.diagnostics,
      data: {
        id: "ai.save",
        documentUri: params.textDocument.uri,
        range,
        diagnostics: params.context.diagnostics,
      },
      isPreferred: false,
    };
    codeActions.push(saveAction);

    return codeActions;
  });

  connection.onCodeActionResolve(async (params) => {
    logger.info("Resolving code action...");
    logger.info(params.data.id);
    const data = params.data as CodeActionData | undefined;
    if (data?.documentUri && data?.range) {
      const documentUri = data.documentUri as string;
      const textDocument = documents.get(documentUri);
      if (!textDocument) {
        return params;
      }

      const actionId = data.id;

      const range = data.range;

      switch (actionId) {
        case "ai.instruct": {
          const filePath = documentUri;
          const recentEdits = editHistory.get(filePath) || [];

          // Get the text from the range where the code action was triggered
          const documentText = textDocument.getText(range);

          // Get surrounding code
          // const fullText = textDocument.getText();
          // const cursorPosition = editor.selection.active;
          // const surroundingCode = extractSurroundingCode(
          //   fullText,
          //   cursorPosition,
          // );

          // Get related files and their recent edits
          const relatedContext = getRelatedFilesContext(filePath, documents);

          // Parse the selected text
          const instructions = parseInstructions(documentText);

          logger.debug(instructions);

          const userPrompt = createUserPrompt(
            documentUri,
            textDocument,
            recentEdits,
            relatedContext,
            instructions,
          ).trim();

          try {
            const { text } = await generateText({
              model: modelManager.getModel("lsp-code-action"),
              system: getSystemPrompt(instructions.mode),
              temperature: instructions.mode === "edit" ? 0.3 : 1.0,
              prompt: userPrompt,
            });

            params.edit = {
              changes: {
                [data.documentUri]: [
                  TextEdit.replace(range, extractCode(text)),
                ],
              },
            };
          } catch (error) {
            logger.error("Error generating text:");
            logger.error(error);
            // Optionally, you can set an error message on the code action
            params.diagnostics = [
              {
                range: range,
                message: "Failed to generate text. Please try again.",
              },
            ];
          }
          break;
        }
        case "ai.edit": {
          // Request a progress token
          const token = crypto.randomUUID();
          connection.sendNotification("window/workDoneProgress/create", {
            token,
          });
          const filePath = documentUri;
          const recentEdits = editHistory.get(filePath) || [];

          // Get surrounding code
          // const fullText = textDocument.getText();
          // const cursorPosition = editor.selection.active;
          // const surroundingCode = extractSurroundingCode(
          //   fullText,
          //   cursorPosition,
          // );

          // Get related files and their recent edits
          const relatedContext = getRelatedFilesContext(filePath, documents);

          // Parse the selected text
          const instructions = parseInstructions(
            textDocument.getText({
              start: { line: range.start.line, character: 0 },
              end: { line: range.end.line, character: Number.MAX_SAFE_INTEGER },
            }),
          );

          logger.debug(instructions);

          const userPrompt = createUserPrompt(
            documentUri,
            textDocument,
            recentEdits,
            relatedContext,
            instructions,
          ).trim();

          // Start the progress
          connection.sendNotification("$/progress", {
            token,
            value: {
              kind: "begin",
              message: "Calling LLM...",
              percentage: 25,
              cancellable: false, // Set to true if you support cancellation
            },
          });

          try {
            const { object } = await generateObject({
              model: modelManager.getModel("lsp-code-action"),
              system: getEditSystemPrompt(),
              temperature: 0.3,
              schema: z.object({
                edits: z
                  .array(
                    z.object({
                      pattern: z
                        .string()
                        .describe(
                          "The precise pattern to search for in the file.",
                        ),
                      replacement: z.string().describe("The replacement text."),
                    }),
                  )
                  .describe(
                    "The array of edits to make to the current code file.",
                  ),
              }),
              prompt: userPrompt,
            });

            const edits = object.edits;

            // Get the text from the range where the code action was triggered
            const documentText = removeLspPrompt(textDocument.getText());

            // The sendProgress method is deprecated, use sendNotification instead
            connection.sendNotification("$/progress", {
              token,
              value: {
                kind: "report",
                message: "Applying edits...",
                percentage: 50,
                cancellable: false, // Set to true if you support cancellation
              },
            });

            // Apply all regex pattern replacements to the document text
            let updatedText = documentText;
            for (const edit of edits) {
              try {
                const regex = new RegExp(edit.pattern, "g");
                updatedText = updatedText.replace(regex, edit.replacement);
              } catch (error) {
                logger.error(
                  `Error applying regex pattern: ${edit.pattern}`,
                  error,
                );
              }
            }

            params.edit = {
              changes: {
                [data.documentUri]: [
                  TextEdit.replace(
                    {
                      start: { line: 0, character: 0 },
                      end: { line: textDocument.lineCount, character: 0 },
                    },
                    updatedText,
                  ),
                ],
              },
            };

            connection.sendNotification("$/progress", {
              token,
              value: {
                kind: "report",
                message: "Finished",
                percentage: 100,
                cancellable: false, // Set to true if you support cancellation
              },
            });
          } catch (error) {
            logger.error("Error generating text:");
            logger.error(error);
            // Optionally, you can set an error message on the code action
            params.diagnostics = [
              {
                range: range,
                message: "Failed to generate text. Please try again.",
              },
            ];
          }
          break;
        }
        case "ai.save": {
          // Get the text from the range where the code action was triggered
          const documentText = textDocument.getText(range);

          const selection: Selection = {
            documentUri,
            range,
            documentText,
          };

          try {
            await saveSelection(selection);
            logger.info("Selection saved successfully");
          } catch (error) {
            logger.error("Error saving selection:", error);
            // Optionally, you can set an error message on the code action
            params.diagnostics = [
              {
                range: range,
                message: "Failed to save selection. Please try again.",
              },
            ];
            throw error;
          }
          break;
        }
        default: {
          logger.error(`Unrecognized command: ${actionId}`);
          // Optionally, you can set an error message on the code action
          params.diagnostics = [
            {
              range: range,
              message: `Unrecognized command: ${actionId}`,
            },
          ];
        }
      }
    }
    return params;
  });

  // Register diagnostic handler
  connection.onDidChangeTextDocument((params) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (textDocument) {
      validateTextDocument(textDocument);
      const document = params.textDocument;
      const filePath = document.uri;

      // Track recent edits
      const changes = params.contentChanges.map((change) => change.text);
      if (!editHistory.has(filePath)) {
        editHistory.set(filePath, []);
      }

      const history = editHistory.get(filePath);
      if (history) {
        history.push(...changes);

        // Keep only the last N edits
        if (history.length > MAX_HISTORY) {
          history.splice(0, history.length - MAX_HISTORY);
        }
      }
      // Discover related files
      updateFileRelations(filePath, textDocument);
    }
  });

  function validateTextDocument(textDocument: TextDocument): void {
    // const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    // Add diagnostics where the Instruct code action might be helpful
    // For this example, we'll look for function declarations
    // const functionRegex = /function\s+(\w+)/g;
    // let match;

    // while ((match = functionRegex.exec(text)) !== null) {
    //   const diagnostic: Diagnostic = {
    //     severity: DiagnosticSeverity.Information,
    //     range: {
    //       start: textDocument.positionAt(match.index),
    //       end: textDocument.positionAt(match.index + match[0].length),
    //     },
    //     message: `Consider adding instructions for function '${match[1]}'`,
    //     source: "Instruct LSP",
    //   };

    //   diagnostics.push(diagnostic);
    // }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }

  return connection;
}

function removeLspPrompt(text: string) {
  const filteredText = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//%"))
    .join("\n");
  return filteredText;
}

function getCurrentFileContext(
  documentUri: string,
  textDocument: TextDocument,
) {
  const text = textDocument.getText();
  const filteredText = removeLspPrompt(text);

  return `In order to help me with my task, read the entire file for context:
${formatCodeSnippet(documentUri, filteredText, "markdown")}`;
}

function getRecentEdits(recentEdits: string[]): string {
  if (recentEdits.length === 0) {
    return "";
  }

  return `Here are recent edits:
${recentEdits.join("\n")}`;
}

function getRelatedFilesContextString(relatedContext: string): string {
  if (!relatedContext || relatedContext.trim() === "") {
    return "";
  }

  return `Here is related file context:
${relatedContext}`;
}

function getCodeContext(documentUri: string, context: string) {
  if (!context || context.trim() === "") {
    return "";
  }
  return `Now focus on this specific code to complete the task:
${formatCodeSnippet(documentUri, context, "markdown")}`;
}

function createUserPrompt(
  documentUri: string,
  textDocument: TextDocument,
  recentEdits: string[],
  relatedContext: string,
  instructions: EmbeddedInstructions,
) {
  return dedent`
${getCurrentFileContext(documentUri, textDocument)}

${getRecentEdits(recentEdits)};

${getRelatedFilesContextString(relatedContext)}

${getCodeContext(documentUri, instructions.context)}

${instructions.prompt ?? ""}
  `;
}

// Extracts related files' content based on imports, requires, or module usage
function updateFileRelations(filePath: string, content: TextDocument) {
  const matches = content
    .getText()
    .match(/import\s+.*?from\s+['"](.*?)['"]|require\(['"](.*?)['"]\)/g);

  if (!matches) {
    return;
  }

  const relatedFiles = matches
    .map((m) => {
      const pathMatch = m.match(/['"](.*?)['"]/);
      return pathMatch ? pathMatch[1] : null;
    })
    .filter((path) => {
      // Only include paths that are relative (start with ./ or ../)
      return (
        !isNullOrUndefined(path) &&
        (path.startsWith("./") || path.startsWith("../"))
      );
    }) as string[];

  fileRelations.set(filePath, relatedFiles);
}

// Retrieves context from related files
function getRelatedFilesContext(
  filePath: string,
  documents: TextDocuments<TextDocument>,
): string {
  const relatedFiles = fileRelations.get(filePath) || [];
  const context: string[] = [];

  for (const related of relatedFiles) {
    try {
      // Try to find the document in the TextDocuments collection
      // We need to convert the relative path to a URI format that matches how documents are stored
      // This is a simplistic approach - in practice you might need more sophisticated URI resolution
      const relatedUri = related.startsWith("file://")
        ? related
        : `file://${related}`;

      // Find the document by URI or by checking if the URI ends with the related path
      const doc = documents
        .all()
        .find((d) => d.uri === relatedUri || d.uri.endsWith(related));

      if (doc) {
        // Since we don't have extractSurroundingCode, we'll just take the first few lines
        // const lines = doc.getText().split("\n");
        // const previewLines = lines
        //   .slice(0, Math.min(lines.length, 10))
        //   .join("\n");

        context.push(formatFile(related, doc.getText(), "markdown"));
      }
    } catch (_error) {
      console.warn(`Could not load related file: ${related}`);
    }
  }

  return context.join("\n\n");
}
const MD_CODE_BLOCK = /```(?:[\w-]+)?\n(.*?)```/s;

export const extractCode = (text: string): string => {
  const pattern = MD_CODE_BLOCK;
  const match = text.match(pattern);
  if (match) {
    return match[1]?.trim() ?? "";
  }
  return text;
};
