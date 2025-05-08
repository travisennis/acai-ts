import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.ts";
import type { TokenCounter } from "../token-utils.ts";
import { createTextDocuments, initConnection } from "./server.ts";

export function initializeLsp({
  modelManager,
  tokenCounter,
}: { modelManager: ModelManager; tokenCounter: TokenCounter }) {
  try {
    const documents = createTextDocuments();

    const connection = initConnection({
      modelManager,
      documents,
      tokenCounter,
    });

    // Make the text document manager listen on the connection
    documents.listen(connection);

    // Listen on the connection
    connection.listen();

    logger.info("acai lsp is listening");
  } catch (error) {
    logger.error(`Error starting server: ${(error as Error).message}`);
  }
}
