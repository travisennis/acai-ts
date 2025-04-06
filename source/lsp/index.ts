import { logger } from "../logger.ts";
import type { ModelManager } from "../models/manager.ts";
import { createTextDocuments, initConnection } from "./server.ts";

export function initializeLsp({
  modelManager,
}: { modelManager: ModelManager }) {
  try {
    const documents = createTextDocuments();

    const connection = initConnection({ modelManager, documents });

    // Make the text document manager listen on the connection
    documents.listen(connection);

    // Listen on the connection
    connection.listen();

    logger.info("acai lsp is listening");
  } catch (error) {
    logger.error(`Error starting server: ${(error as Error).message}`);
  }
}
