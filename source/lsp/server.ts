import { generateText } from "ai";
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
import type { ModelManager } from "../models/manager.ts";
import { type Selection, saveSelection } from "../savedSelections/index.ts";
import { parseContext } from "./embedding-instructions.ts";

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
      data: {
        id: "ai.instruct",
        documentUri: params.textDocument.uri,
        range,
        diagnostics: params.context.diagnostics,
      },
      isPreferred: false,
    };
    codeActions.push(instructAction);

    // Create the Save code action
    const saveAction: CodeAction = {
      title: "Acai - Save",
      kind: CodeActionKind.QuickFix,
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
    logger.debug(params);
    const data = params.data as CodeActionData | undefined;
    if (data?.documentUri && data?.range) {
      const documentUri = data.documentUri as string;
      const textDocument = documents.get(documentUri);
      if (!textDocument) {
        return params;
      }

      const actionId = data.id;

      // Get the text from the range where the code action was triggered
      const range = data.range;
      const documentText = textDocument.getText(range);

      logger.debug(documentText);

      switch (actionId) {
        case "ai.instruct": {
          const context = parseContext(documentText);

          logger.debug(context);

          const userPrompt = `
\`\`\`
${context.context}
\`\`\`

${context.prompt ?? ""}
    `.trim();

          try {
            const { text } = await generateText({
              model: modelManager.getModel("lsp-code-action"),
              system:
                "You are a highly skilled coding assistant and senior software engineer. Your task is to provide concise, accurate, and efficient solutions to the user's coding requests. Focus on best practices, code optimization, and maintainability in your solutions. Please respond with only the revised code. If your response is a new addition to the code, then return your additions along with the original code. Only return the code. Do not wrap the code in Markdown code blocks. Ensure your answer is in plain text without any Markdown formatting. ",
              temperature: 0.3,
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
        case "ai.save": {
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

const MD_CODE_BLOCK = /```(?:[\w-]+)?\n(.*?)```/s;

export const extractCode = (text: string): string => {
  const pattern = MD_CODE_BLOCK;
  const match = text.match(pattern);
  if (match) {
    return match[1]?.trim() ?? "";
  }
  return text;
};
