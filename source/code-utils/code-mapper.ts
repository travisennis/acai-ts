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
          featureType = captureName.substring("reference.".length); // "class"
          // For references, the 'name' is often the text of the reference itself
          // or a sub-node if the query is structured that way.
          // If a specific @name.reference.X capture exists, it will be handled by the "name." condition.
          // Otherwise, we might use the primaryNode's text for the name of the reference.
          if (!nameNode && primaryNode) {
            // Default name for reference if no specific @name.reference capture
            featureName = primaryNode.text;
          }
        } else if (!captureName.startsWith("name")) {
          // Handles other captures like "interface.property", "interface.method", "import", etc.
          // These are assumed to be primary defining captures for their type if not 'name.*'.

          // Avoid re-processing 'name' if it didn't fit 'name.*' logic for some reason
          primaryNode = node; // The full node for this type
          featureType = captureName; // Use the full capture name as type, e.g., "interface.property"
          // The @name capture within the same match should provide the featureName.
        }
        // Add other conditions for different capture patterns if needed (e.g. "call.")
      }

      // Ensure we have a primary node to define the feature's code and position
      if (primaryNode && featureType) {
        const normalizedPrimaryType =
          normalizeType(featureType as keyof typeof typeMap) || featureType;
        features.push({
          type: normalizedPrimaryType,
          name: featureName, // Name of the definition itself, if applicable (e.g. class name for class def)
          code: sourceCode.slice(primaryNode.startIndex, primaryNode.endIndex),
          start: primaryNode.startPosition,
          end: primaryNode.endPosition,
          filePath,
        });
        // If a separate name was captured (e.g. @name for a @definition.function match)
        // create a separate, more specific "name" feature for the identifier itself.
        if (nameNode && featureName) {
          // The type of the name feature should be the same as its corresponding definition.
          const normalizedNameType =
            normalizeType(featureType as keyof typeof typeMap) || featureType;
          if (primaryNode !== nameNode) {
            // Only add if nameNode is truly a sub-component or different node
            features.push({
              type: normalizedNameType, // Same normalized type as the definition it names
              name: nameNode.text, // The text of the name identifier itself
              code: nameNode.text, // Code is just the identifier itself
              start: nameNode.startPosition,
              end: nameNode.endPosition,
              filePath,
            });
          }
        }
      } else if (nameNode && featureType && !primaryNode) {
        // Fallback if only a name node was captured (e.g. a reference not part of a larger definition context in this match)
        const normalizedFallbackType =
          normalizeType(featureType as keyof typeof typeMap) || featureType;
        features.push({
          type: normalizedFallbackType,
          name: featureName, // Should be nameNode.text if this is purely a name feature
          code: nameNode.text, // Code will just be the name itself
          start: nameNode.startPosition,
          end: nameNode.endPosition,
          filePath,
        });
      }
    }

    // Deduplicate features based on path, type, name, and exact start/end positions
    const uniqueFeatures: Feature[] = [];
    const seenFeatures = new Set<string>();

    for (const feature of features) {
      const key = `${feature.filePath}:${feature.start.row}:${feature.start.column}:${feature.end.row}:${feature.end.column}:${feature.type}:${feature.name || ""}`;
      if (!seenFeatures.has(key)) {
        seenFeatures.add(key);
        uniqueFeatures.push(feature);
      }
    }
    return uniqueFeatures;
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
