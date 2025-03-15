import type { ModelManager } from "../models/manager.ts";
import { createTextDocuments, initConnection } from "./server.ts";

export function initializeLsp({
  modelManager,
}: { modelManager: ModelManager }) {
  const documents = createTextDocuments();

  const connection = initConnection({ modelManager, documents });

  // Make the text document manager listen on the connection
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
}
