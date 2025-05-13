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

        const symbolName = nodeCandidate.text;

        let symbolType = "symbol";
        let subtype: string | undefined;
        let nodeForBodySpanAndCode: SyntaxNode = nodeCandidate;

        const definitionCaptureEntry = Object.entries(captures).find(([name]) =>
          name.startsWith("definition."),
        );

        if (definitionCaptureEntry) {
          const [definitionCaptureName, capturedNodeOrNodes] =
            definitionCaptureEntry;
          const capturedNode = Array.isArray(capturedNodeOrNodes)
            ? capturedNodeOrNodes[0]
            : capturedNodeOrNodes;

          if (capturedNode) {
            nodeForBodySpanAndCode = capturedNode;
            symbolType = definitionCaptureName.split(".").pop() || "symbol";
          }
        } else {
          const fallbackLabel = Object.keys(captures)[0] || "symbol";
          symbolType = fallbackLabel.replace(/^definition\.|\\@/g, "");
        }

        const symbolStartLine = nodeForBodySpanAndCode.startPosition.row;
        const symbolEndLine = nodeForBodySpanAndCode.endPosition.row;
        const symbolCodeContent = sourceCode.substring(
          nodeForBodySpanAndCode.startIndex,
          nodeForBodySpanAndCode.endIndex,
        );

        const symbol: SymbolInfo = {
          name: symbolName,
          type: symbolType,
          startLine: symbolStartLine,
          endLine: symbolEndLine,
          code: symbolCodeContent,
        };
        if (subtype) {
          symbol.subtype = subtype;
        }
        symbols.push(symbol);
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
