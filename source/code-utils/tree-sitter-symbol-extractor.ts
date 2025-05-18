import type Parser from "tree-sitter";
import type { Query, SyntaxNode, Tree } from "tree-sitter";
import { logger } from "../logger.ts";
import type { TreeSitterManager } from "./tree-sitter-manager.ts";

export interface SymbolInfo {
  name: string;
  type: string;
  startLine: number;
  endLine: number;
  code: string;
  subtype?: string;
}

export class TreeSitterSymbolExtractor {
  private treeSitterManager: TreeSitterManager;
  constructor(treeSitterManager: TreeSitterManager) {
    this.treeSitterManager = treeSitterManager;
  }

  getParser(ext: string): Parser | undefined {
    return this.treeSitterManager.getParser(ext);
  }

  getQuery(ext: string): Query | undefined {
    return this.treeSitterManager.getQuery(ext);
  }

  async extractSymbols(ext: string, sourceCode: string): Promise<SymbolInfo[]> {
    logger.debug(`[EXTRACT] Attempting to extract symbols for ext: ${ext}`);
    const symbols: SymbolInfo[] = [];

    const query = this.getQuery(ext);
    const parser = this.getParser(ext);

    if (!(query && parser)) {
      logger.warn(
        `[EXTRACT] No query or parser available for extension: ${ext}`,
      );
      return [];
    }

    try {
      const tree: Tree = parser.parse(sourceCode);
      const root: SyntaxNode = tree.rootNode;

      const matches = query.matches(root);
      logger.debug(`[EXTRACT] Found ${matches.length} matches.`);

      for (const match of matches) {
        logger.debug(
          `[MATCH pattern=${match.pattern}] Processing match with captures: ${Object.keys(match.captures).join("")}`,
        );

        const captures = match.captures.reduce(
          (acc, cap) => {
            acc[cap.name] = cap.node;
            return acc;
          },
          {} as Record<string, SyntaxNode | SyntaxNode[]>,
        );

        let nodeCandidate: SyntaxNode | undefined;
        if (captures["name"]) {
          nodeCandidate = Array.isArray(captures["name"])
            ? captures["name"][0]
            : (captures["name"] as SyntaxNode);
        } else if (captures["type"]) {
          nodeCandidate = Array.isArray(captures["type"])
            ? captures["type"][0]
            : (captures["type"] as SyntaxNode);
        } else {
          const firstCaptureNode = Object.values(captures)[0];
          if (!firstCaptureNode) {
            continue;
          }
          nodeCandidate = Array.isArray(firstCaptureNode)
            ? firstCaptureNode[0]
            : (firstCaptureNode as SyntaxNode);
        }

        if (!nodeCandidate) {
          continue;
        }

        const symbolName = nodeCandidate.text; // This is usually the @name capture

        let symbolType = "symbol";
        // let subtype: string | undefined; // Not currently used robustly, but kept for potential future use
        let nodeForMainSymbolCode = nodeCandidate; // Default to nameCandidate if no other defining node found

        // Determine the primary defining capture for the main symbol
        let mainDefiningCaptureName: string | undefined;
        let mainDefiningNode: SyntaxNode | undefined;

        // 1. Prioritize 'definition.*' captures
        const definitionCap = Object.entries(captures).find(([capName]) =>
          capName.startsWith("definition."),
        );
        if (definitionCap) {
          mainDefiningCaptureName = definitionCap[0];
          mainDefiningNode = Array.isArray(definitionCap[1])
            ? definitionCap[1][0]
            : (definitionCap[1] as SyntaxNode);
        }

        // 2. If no 'definition.*', find the first non-'name' capture (e.g., 'interface.property')
        if (!mainDefiningNode) {
          const nonNameCap = Object.entries(captures).find(
            ([capName]) => !capName.startsWith("name"),
          );
          if (nonNameCap) {
            mainDefiningCaptureName = nonNameCap[0];
            mainDefiningNode = Array.isArray(nonNameCap[1])
              ? nonNameCap[1][0]
              : (nonNameCap[1] as SyntaxNode);
          }
        }

        // 3. Fallback if no other defining capture was found
        if (!mainDefiningNode) {
          mainDefiningNode = nodeCandidate; // The node from which symbolName was derived
          // Try to find the capture name that yielded nodeCandidate, or default to 'symbol'
          mainDefiningCaptureName =
            Object.keys(captures).find((key) => {
              const capNode = captures[key];
              return (
                (Array.isArray(capNode) ? capNode[0] : capNode) ===
                mainDefiningNode
              );
            }) || "symbol";
        } else if (!mainDefiningCaptureName) {
          // if mainDefiningNode was set by fallback but capture name is still missing
          mainDefiningCaptureName = "symbol";
        }

        // Ensure we have a node to get code from for the main symbol
        nodeForMainSymbolCode = mainDefiningNode || nodeCandidate;
        if (!nodeForMainSymbolCode) {
          logger.debug(
            "[EXTRACT] No node found for main symbol code. Skipping match.",
          );
          continue;
        }

        // Determine symbolType from the mainDefiningCaptureName
        if (mainDefiningCaptureName.startsWith("definition.")) {
          symbolType = mainDefiningCaptureName.substring("definition.".length);
        } else if (mainDefiningCaptureName.includes(".")) {
          // e.g., "interface.property"
          symbolType = mainDefiningCaptureName; // Keep full string like "interface.property"
        } else {
          symbolType = mainDefiningCaptureName; // e.g., "import" or fallback "symbol"
        }

        const mainSymbol: SymbolInfo = {
          name: symbolName, // Name is from @name or nodeCandidate.text
          type: symbolType,
          startLine: nodeForMainSymbolCode.startPosition.row,
          endLine: nodeForMainSymbolCode.endPosition.row,
          code: sourceCode.substring(
            nodeForMainSymbolCode.startIndex,
            nodeForMainSymbolCode.endIndex,
          ),
        };
        symbols.push(mainSymbol);

        // If an explicit @name capture exists and it's different from the main defining node,
        // add a separate symbol for the name identifier itself.
        const nameCaptureNode = captures["name"]
          ? Array.isArray(captures["name"])
            ? captures["name"][0]
            : (captures["name"] as SyntaxNode)
          : undefined;
        if (
          nameCaptureNode &&
          mainDefiningNode &&
          nameCaptureNode !== mainDefiningNode
        ) {
          symbols.push({
            name: nameCaptureNode.text,
            type: symbolType, // The name symbol has the same type as the definition it refers to
            startLine: nameCaptureNode.startPosition.row,
            endLine: nameCaptureNode.endPosition.row,
            code: nameCaptureNode.text,
          });
        }
      }
    } catch (e) {
      logger.error(
        `[EXTRACT] Error parsing or processing file with ext ${ext}: ${e instanceof Error ? e.message : String(e)}`,
      );
      logger.error(
        e instanceof Error && e.stack ? e.stack : "No stack trace available",
      );
      return []; // Return empty list on error
    }

    logger.debug(
      `[EXTRACT] Finished extraction for ext ${ext}. Found ${symbols.length} symbols.`,
    );
    return symbols;
  }
}
