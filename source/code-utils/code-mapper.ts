import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type Parser from "tree-sitter";
import type { Query } from "tree-sitter";
import type { TreeSitterManager } from "./tree-sitter-manager.ts";

const typeMap = {
  // biome-ignore lint/style/useNamingConvention: <explanation>
  function_declaration: "function",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  arrow_function: "function",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  method_definition: "method",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  method_declaration: "method",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  class_declaration: "class",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  interface_declaration: "interface",
  // biome-ignore lint/style/useNamingConvention: <explanation>
  type_alias_declaration: "type",
} as const;

export function normalizeType(nodeType: keyof typeof typeMap) {
  return typeMap[nodeType] || nodeType;
}

type Feature = {
  type: string; // e.g., "interface", "class", "function", "method", "enum", "type", "module", "call", "reference"
  name: string | undefined; // Name of the defined entity, or undefined for calls/references if not applicable
  code: string; // Full text of the node associated with the primary capture (e.g., the whole class definition)
  start: { row: number; column: number };
  end: { row: number; column: number };
  filePath: string; // Optional: to store the file path, can be added later if needed by consumers
};

export class CodeMapper {
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

  parseFile(filePath: string) {
    const extension = extname(filePath);
    const parser = this.treeSitterManager.getParser(extension);
    if (!parser) {
      throw new Error(`Unsupported file extension: ${extension}`);
    }
    const sourceCode = readFileSync(filePath, "utf8");
    const tree = parser.parse(sourceCode);
    return { tree, sourceCode };
  }

  extractFeatures(
    filePath: string,
    query: Query,
    tree: Parser.Tree,
    sourceCode: string,
  ) {
    const matches = query.matches(tree.rootNode);
    const features: Feature[] = [];

    for (const match of matches) {
      let featureName: string | undefined;
      let featureType: string | undefined;
      let primaryNode: Parser.SyntaxNode | undefined;
      let nameNode: Parser.SyntaxNode | undefined;

      // Iterate over captures in this match to find the primary definition/reference and its name
      for (const capture of match.captures) {
        const captureName = capture.name; // e.g., "definition.interface", "name.definition.interface"
        const node = capture.node;

        if (captureName.startsWith("name")) {
          // e.g., "name.definition.interface"
          nameNode = node;
          featureName = node.text;
          // Infer type from the "name." capture if primaryNode hasn't set it yet
          // e.g., from "name.definition.interface", infer "interface"
          if (!featureType) {
            const parts = captureName.split("."); // ["name", "definition", "interface"]
            if (parts.length > 2) {
              featureType = parts[2];
            } else if (
              parts.length > 1 &&
              parts[0] === "name" &&
              parts[1] !== "reference"
            ) {
              featureType = parts[1];
            }
          }
        } else if (captureName.startsWith("definition.")) {
          // e.g., "definition.interface"
          primaryNode = node;
          const parts = captureName.split("."); // ["definition", "interface"]
          if (parts.length > 1) {
            featureType = parts[1]; // "interface"
          }
        } else if (captureName.startsWith("reference.")) {
          // e.g., "reference.class"
          primaryNode = node; // The node that constitutes the reference
          const parts = captureName.split("."); // ["reference", "class"]
          if (parts.length > 1) {
            featureType = parts[1]; // "class" (the type being referenced)
          }
          // For references, the 'name' is often the text of the reference itself
          // or a sub-node if the query is structured that way.
          // If a specific @name.reference.X capture exists, it will be handled by the "name." condition.
          // Otherwise, we might use the primaryNode's text for the name of the reference.
          if (!nameNode && primaryNode) {
            featureName = primaryNode.text; // Use primaryNode's text if no specific name capture
          }
        }
        // Add other conditions for different capture patterns if needed (e.g. "call.")
      }

      // Ensure we have a primary node to define the feature's code and position
      if (primaryNode && featureType) {
        features.push({
          type: featureType,
          name: featureName, // Will be the text from nameNode if found, otherwise might be primaryNode.text for simple references
          code: sourceCode.slice(primaryNode.startIndex, primaryNode.endIndex),
          start: primaryNode.startPosition,
          end: primaryNode.endPosition,
          filePath,
        });
      } else if (nameNode && featureType && !primaryNode) {
        // Fallback if only a name node was captured for a definition type (less ideal)
        // This case might indicate a query that needs adjustment or a very simple named entity.
        features.push({
          type: featureType,
          name: featureName,
          code: nameNode.text, // Code will just be the name itself
          start: nameNode.startPosition,
          end: nameNode.endPosition,
          filePath,
        });
      }
    }
    return features;
  }

  processFile(filePath: string) {
    const extension = extname(filePath);
    const query = this.treeSitterManager.getQuery(extension);
    if (!query) {
      throw new Error(`No query for extension: ${extension}`);
    }

    const { tree, sourceCode } = this.parseFile(filePath);
    const features = this.extractFeatures(filePath, query, tree, sourceCode);
    return features;
  }
}
