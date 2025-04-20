import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tool } from "ai";
import {
  JSONRPCEndpoint,
  LspClient,
  SignatureHelpTriggerKind,
} from "ts-lsp-client";
import { z } from "zod";
import type { SendData } from "./types.ts";

const serverPath = "typescript-language-server";

export const lspClient = async () => {
  // start the LSP server
  const lspServerProcess = spawn(serverPath, ["--stdio"], {
    shell: true,
    stdio: "pipe",
  });
  // create an RPC endpoint for the process
  const endpoint = new JSONRPCEndpoint(
    lspServerProcess.stdin,
    lspServerProcess.stdout,
  );

  // create the LSP client
  const client = new LspClient(endpoint);

  await client.initialize({
    processId: lspServerProcess.pid ?? null,
    capabilities: {},
    clientInfo: {
      name: "acai-lsp",
      version: "0.0.1",
    },
    workspaceFolders: [
      {
        name: "workspace",
        uri: pathToFileURL(process.cwd()).href,
      },
    ],
    rootUri: pathToFileURL(process.cwd()).href,
    initializationOptions: {
      tsserver: {
        logDirectory: ".log",
        logVerbosity: "verbose",
        trace: "verbose",
      },
    },
  });

  client.initialized();

  return client;
};
export const createLspTools = (options: {
  client: LspClient;
  sendData?: SendData | undefined;
}) => {
  const { client, sendData } = options;

  return {
    getDefinition: async (path: string, line: number, symbol: string) => {
      const content = readFileSync(path, "utf8");

      const lines = content.split("\n");
      const lineText = lines[line - 1] || "";
      console.info(lineText);
      const character = lineText.indexOf(symbol);
      console.info(line, character);

      const docUri = pathToFileURL(path).href;

      client.didOpen({
        textDocument: {
          uri: docUri,
          text: content,
          version: 1,
          languageId: "typescript",
        },
      });

      // console.info("publish dianostics");
      // const diag = await client.once("textDocument/publishDiagnostics");
      // console.dir(diag);

      const location = await client.definition({
        position: {
          line: line - 1,
          character: character + 1,
        },
        textDocument: {
          uri: docUri,
        },
      });

      console.log("Definition location:", JSON.stringify(location, null, 2));

      console.info("getting type definition");
      const def = await client.typeDefinition({
        position: {
          line: line - 1,
          character: character + 1,
        },
        textDocument: {
          uri: docUri,
        },
      });

      console.log("Type definition location:", JSON.stringify(def, null, 2));

      const result = await client.signatureHelp({
        textDocument: {
          uri: docUri,
        },
        position: {
          line: line - 1,
          character: character + symbol.length + 1,
        },
        context: {
          triggerKind: SignatureHelpTriggerKind.ContentChange,
          isRetrigger: false,
          triggerCharacter: "(",
        },
      });
      console.log("Signature", JSON.stringify(result, null, 2));

      client.didClose({
        textDocument: {
          uri: docUri,
        },
      });
    },
    getSignature: tool({
      description:
        "Use the LSP to find the definition of a symbol in a file. Useful when you are unsure about the implementation of a class, method, or function but need the information to make progress.",
      parameters: z.object({
        path: z.string().describe("The absolute file path"),
        line: z.number().describe("The line number that the symbol occurs on"),
        symbol: z
          .string()
          .describe(
            "The name of the symbol to search for. This is usually a method, class, variable, or attribute.",
          ),
      }),
      execute: async ({ path, line, symbol }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Looking up ${symbol}`,
          });

          const content = readFileSync(path, "utf8");
          const lines = content.split("\n");
          const lineText = lines[line - 1] || "";
          const character = lineText.indexOf(symbol);

          const docUri = pathToFileURL(path).href;

          client.didOpen({
            textDocument: {
              uri: docUri,
              text: content,
              version: 1,
              languageId: "typescript",
            },
          });

          const typeDef = await client.typeDefinition({
            position: {
              line: line - 1,
              character: character + 1,
            },
            textDocument: {
              uri: docUri,
            },
          });

          const signature = await client.signatureHelp({
            textDocument: {
              uri: docUri,
            },
            position: {
              line: line - 1,
              character: character + symbol.length + 1,
            },
            context: {
              triggerKind: SignatureHelpTriggerKind.ContentChange,
              isRetrigger: false,
              triggerCharacter: "(",
            },
          });

          client.didClose({
            textDocument: {
              uri: docUri,
            },
          });

          const result = Object.assign(
            signature as any,
            (typeDef as any)[0] ?? {},
          );

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: "Done",
          });
          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: `Error reading file for ${path}`,
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};

async function main() {
  console.info("Creating lsp tools");
  const client = await lspClient();
  const lspTools = createLspTools({ client });
  console.info("created");
  console.info("getting definition");
  const [, , path, lineStr, symbol] = process.argv;
  if (!(path && lineStr && symbol)) {
    console.error("Usage: node <script> <path> <line> <symbol>");
    process.exit(1);
  }
  const line = Number(lineStr);
  await lspTools.getDefinition(path, line, symbol);
  console.info("done");
  client.exit();
}

main().catch(console.error);
