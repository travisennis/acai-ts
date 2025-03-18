import Table from "cli-table3";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const contextCommand = ({
  terminal,
  contextManager,
}: CommandOptions) => {
  return {
    command: "/context",
    description: "Manage project context for AI prompts",
    result: "continue" as const,
    execute: async (args: string[]) => {
      if (!args || args.length === 0) {
        terminal.warn(
          "Please provide a subcommand. Usage: /context [analyze|query|info|refresh|clear]",
        );
        return;
      }

      const subCommand = args[0].toLowerCase();
      try {
        switch (subCommand) {
          case "analyze": {
            terminal.header("Analyzing project context...");
            await contextManager.performFullAnalysis();
            terminal.success("Project context analysis completed");
            break;
          }

          case "query": {
            if (args.length < 2) {
              terminal.warn(
                "Please provide a query. Usage: /context query <your question>",
              );
              return;
            }

            const query = args.slice(1).join(" ");
            terminal.header(`Querying context: "${query}"`);

            const results = await contextManager.query(query);

            if (results.length === 0) {
              terminal.info("No relevant context found");
              return;
            }

            // Display results grouped by type
            const grouped: Record<string, any[]> = results.reduce(
              (acc, item) => {
                const type = item.type;
                if (!acc[type]) {
                  acc[type] = [];
                }
                acc[type].push(item);
                return acc;
              },
              {} as Record<string, any[]>,
            );

            for (const [type, items] of Object.entries(grouped)) {
              terminal.writeln(`${type} (${items.length})`);

              const table = new Table({
                head: ["ID", "Details"],
                colWidths: [30, 50],
              });

              for (const item of items) {
                table.push([
                  item.id.substring(0, 28) + (item.id.length > 28 ? "..." : ""),
                  item.properties?.description ||
                    item.properties?.name ||
                    (item.properties?.path
                      ? `Path: ${item.properties.path}`
                      : ""),
                ]);
              }

              console.info(table.toString());
            }
            break;
          }

          case "info": {
            terminal.header("Project Context Information");
            terminal.display(`Project root: ${process.cwd()}`);

            // Get information about the context database
            const graphInfo = `Context database is ${
              contextManager.isInitialized ? "initialized" : "not initialized"
            }`;
            terminal.display(graphInfo);

            // Show the next prompt will use context
            terminal.display(
              "Next AI prompt will include relevant context automatically",
            );
            break;
          }

          case "refresh": {
            terminal.header("Refreshing project context...");
            await contextManager.performIncrementalUpdate();
            terminal.success("Project context updated");
            break;
          }

          case "clear": {
            contextManager.dispose();
            terminal.info("Context manager disposed");
            break;
          }

          default:
            terminal.warn(
              `Unknown subcommand: ${subCommand}. Available commands: analyze, query, info, refresh, enable, disable, clear`,
            );
        }
      } catch (error) {
        terminal.error(
          `Error executing context command: ${(error as Error).message}`,
        );
      }
    },
  } satisfies ReplCommand;
};
