import { createTextDocuments, initConnection } from "./server.ts";

export function initializeLsp() {
  const documents = createTextDocuments();

  const connection = initConnection(documents);

  // Make the text document manager listen on the connection
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
}
