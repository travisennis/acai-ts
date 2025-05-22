import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { globby } from "globby";
import type Parser from "tree-sitter";
import type { Query, SyntaxNode } from "tree-sitter";
import type { TreeSitterManager } from "./tree-sitter-manager.ts";
import { type SupportedLanguage, extensionToLanguage } from "./types.ts";

export type SymbolType =
  | "import"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum";

interface ImportInfo {
  name: string;
  source: string;
}

interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
}

interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
}

interface ParameterInfo {
  name: string;
  parameterType: string;
}

interface ClassInfo {
  name: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
}

interface PropertyInfo {
  name: string;
  propertyType: string;
}

interface InterfaceInfo {
  name: string;
  properties: PropertyInfo[];
  methods: FunctionInfo[];
}

interface TypeInfo {
  name: string;
  typeValue: string;
}

interface EnumMemberInfo {
  name: string;
  value?: string;
}

interface EnumInfo {
  name: string;
  members: EnumMemberInfo[];
}

interface SymbolLocation {
  filePath: string;
  start: { row: number; column: number };
  end: { row: number; column: number };
  type: "definition" | "reference";
  context?: string; // Snippet of code for context
}

interface BaseSymbol {
  name: string;
  type: SymbolType;
  language: SupportedLanguage;
  definition: SymbolLocation;
  references: SymbolLocation[];
}

export interface ImportSymbol extends BaseSymbol, ImportInfo {
  type: "import";
  // Add any additional fields specific to imports if needed
}

export interface InterfaceSymbol extends BaseSymbol, InterfaceInfo {
  type: "interface";
}

export interface ClassSymbol extends BaseSymbol, ClassInfo {
  type: "class";
}

export interface TypeSymbol extends BaseSymbol, TypeInfo {
  type: "type";
}

export interface EnumSymbol extends BaseSymbol, EnumInfo {
  type: "enum";
}

export interface FunctionSymbol extends BaseSymbol, FunctionInfo {
  type: "function";
}

export type Symbol =
  | ImportSymbol
  | InterfaceSymbol
  | ClassSymbol
  | TypeSymbol
  | EnumSymbol
  | FunctionSymbol;

export class CodeNavigator {
  private symbols: Map<string, Symbol> = new Map();
  private treeSitterManager: TreeSitterManager;

  constructor(treeSitterManager: TreeSitterManager) {
    this.treeSitterManager = treeSitterManager;
  }

  /**
   * Indexing a project directory
   */
  async indexProject(projectDir: string): Promise<void> {
    const files = await this.findAllFiles(projectDir);

    // First pass: Find all definitions
    for (const file of files) {
      await this.findDefinitionsInFile(file);
    }

    // Second pass: Find all references
    for (const file of files) {
      this.findReferencesInFile(file);
    }
  }

  /**
   * Indexing a file
   */
  indexFile(file: string): Promise<void> {
    return this.findDefinitionsInFile(file);
  }

  /**
   * Indexing source
   */
  indexSource(filePath: string, code: string): void {
    const extension = extname(filePath);
    const parser = this.treeSitterManager.getParser(extension);
    if (!parser) {
      throw new Error(`No parser for extension: ${extension}`);
    }

    const query = this.treeSitterManager.getQuery(extension);
    if (!query) {
      throw new Error(`No query for extension: ${extension}`);
    }

    const tree = parser.parse(code);

    const lang = extensionToLanguage(extension);

    if (!lang) {
      throw new Error(`No registered language: ${extension}`);
    }

    this.findDefinitions(filePath, query, tree, lang, code);
  }

  /**
   * Find definition of a symbol at a specific position
   */
  async findDefinitionAtPosition(
    filePath: string,
    line: number,
    column: number,
  ): Promise<Symbol | null> {
    // Get the symbol name at the specified position
    const symbolName = await this.getSymbolNameAtPosition(
      filePath,
      line,
      column,
    );
    if (!symbolName) {
      return null;
    }

    return this.symbols.get(this.getSymbolKey(filePath, symbolName)) || null;
  }

  /**
   * Find all usages of a symbol
   */
  findUsages(filePath: string, symbolName: string): SymbolLocation[] {
    const symbol = this.symbols.get(this.getSymbolKey(filePath, symbolName));
    if (!symbol) {
      return [];
    }

    // Return definition and all references
    return [symbol.definition, ...symbol.references];
  }

  findSymbolsByFilePath(filePath: string): Symbol[] {
    const result: Symbol[] = [];
    for (const symbol of this.symbols.values()) {
      if (symbol.definition.filePath === filePath) {
        result.push(symbol);
      }
    }
    return result;
  }

  private getSymbolKey(filePath: string, symbolName: string) {
    return `${filePath}:${symbolName}`;
  }

  private findDefinitions(
    filePath: string,
    query: Query,
    tree: Parser.Tree,
    lang: SupportedLanguage,
    sourceCode: string,
  ) {
    const matches = query.matches(tree.rootNode);

    function getNodeText(node: SyntaxNode | undefined | null): string {
      return node ? sourceCode.slice(node.startIndex, node.endIndex) : "any";
    }

    function getParameters(
      paramsNode: SyntaxNode | undefined | null,
    ): ParameterInfo[] {
      if (!paramsNode) {
        return [];
      }
      // Assuming formal_parameters contains parameter nodes directly or nested
      // This might need refinement based on actual tree structure for parameters
      return paramsNode.namedChildren
        .filter(
          (c) =>
            c.type === "required_parameter" || c.type === "optional_parameter",
        )
        .map((paramNode) => {
          const nameNode =
            paramNode.childForFieldName("pattern") ||
            paramNode.childForFieldName("name"); // 'name' for optional_parameter in some cases
          const typeNode = paramNode.childForFieldName("type");
          return {
            name: getNodeText(nameNode),
            parameterType: getNodeText(typeNode?.lastChild || typeNode), // Handles type_annotation nesting
          };
        });
    }

    for (const match of matches) {
      const captureName = match.captures[0]?.name; // e.g., "function", "class"
      const node = match.captures[0]?.node;

      if (!node) {
        continue;
      }

      if (captureName === "definition.import") {
        // From queries for named, default, namespace imports
        const nameNode = match.captures.find((c) => c.name === "name")?.node;
        const sourceCapture = match.captures.find(
          (c) => c.name === "import.source",
        );
        // For these captures, 'node' is usually the import_specifier or the identifier of the default/namespace import.

        if (nameNode && sourceCapture) {
          const importSourceText = getNodeText(sourceCapture.node).replace(
            /^['"]|['"]$/g,
            "",
          );
          const featureName = getNodeText(nameNode);
          // Key should be unique per imported symbol
          const symbolKeyName = featureName;

          const loc = this.nodeToLocation(
            node, // Node associated with @definition.import (e.g., import_specifier)
            filePath,
            "definition",
            sourceCode,
          );

          this.symbols.set(this.getSymbolKey(filePath, symbolKeyName), {
            name: featureName,
            type: "import",
            language: lang,
            source: importSourceText,
            definition: loc,
            references: [],
          });
        }
      } else if (captureName === "definition.import.side_effect") {
        // From query for side-effect imports
        // For this capture, 'node' is the import_statement itself.
        const sourceCapture = match.captures.find(
          (c) => c.name === "import.source",
        );

        // Check if the import_statement node has an import_clause child.
        // If it does, it means it was (or should have been) handled by a more specific import query.
        const hasImportClause = node.children.some(
          (child) => child.type === "import_clause",
        );

        if (sourceCapture && !hasImportClause) {
          const importSourceText = getNodeText(sourceCapture.node).replace(
            /^['"]|['"]$/g,
            "",
          );
          const featureName = ""; // Side-effect imports have no name
          const symbolKeyName = importSourceText; // Use source for key uniqueness

          const loc = this.nodeToLocation(
            node, // The import_statement node
            filePath,
            "definition",
            sourceCode,
          );

          this.symbols.set(this.getSymbolKey(filePath, symbolKeyName), {
            name: featureName,
            type: "import",
            language: lang,
            source: importSourceText,
            definition: loc,
            references: [],
          });
        }
      } else if (captureName === "definition.function") {
        const nameNode = match.captures.find((c) => c.name === "name")?.node;
        let functionNode = node;
        // If the definition.function is a variable_declarator (e.g., for arrow functions),
        // the actual function details are in its 'value' child.
        if (
          node?.type === "variable_declarator" ||
          node?.type === "lexical_declaration" ||
          node?.type === "variable_declaration"
        ) {
          // The SCM query for arrow functions might point to variable_declaration or lexical_declaration
          // We need to find the actual arrow_function node.
          let actualFunctionValueNode = node.childForFieldName("value");
          if (
            !actualFunctionValueNode &&
            node.type === "variable_declaration" &&
            node.firstNamedChild?.type === "variable_declarator"
          ) {
            actualFunctionValueNode =
              node.firstNamedChild.childForFieldName("value");
          } else if (
            !actualFunctionValueNode &&
            node.type === "lexical_declaration" &&
            node.firstNamedChild?.type === "variable_declarator"
          ) {
            // This handles `export const myArrowFunction = ...` where definition.function might be on lexical_declaration
            const varDeclarator = node
              .descendantsOfType("variable_declarator")
              .find(
                (d) =>
                  getNodeText(d.childForFieldName("name")) ===
                  getNodeText(nameNode),
              );
            if (varDeclarator) {
              actualFunctionValueNode =
                varDeclarator.childForFieldName("value");
            }
          }

          if (
            actualFunctionValueNode?.type === "arrow_function" ||
            actualFunctionValueNode?.type === "function_expression"
          ) {
            functionNode = actualFunctionValueNode;
          }
        }

        const featureName = getNodeText(nameNode);
        const paramsNode = functionNode?.childForFieldName("parameters");
        const returnTypeNode = functionNode?.childForFieldName("return_type");
        const loc = this.nodeToLocation(
          node,
          filePath,
          "definition",
          sourceCode,
        );
        this.symbols.set(this.getSymbolKey(filePath, featureName), {
          name: featureName,
          type: "function",
          language: lang,
          parameters: getParameters(paramsNode),
          returnType: getNodeText(returnTypeNode?.lastChild || returnTypeNode), // Handles type_annotation nesting
          definition: loc,
          references: [],
        });
      } else if (captureName === "definition.class") {
        const classNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;
        const featureName = getNodeText(classNameNode);
        // Find or create class entry
        const classInfo = this.symbols.get(
          this.getSymbolKey(filePath, featureName),
        );
        if (!classInfo) {
          const loc = this.nodeToLocation(
            node,
            filePath,
            "definition",
            sourceCode,
          );
          this.symbols.set(this.getSymbolKey(filePath, featureName), {
            name: featureName,
            type: "class",
            language: lang,
            methods: [],
            properties: [],
            definition: loc,
            references: [],
          });
        }
      } else if (captureName === "definition.property") {
        const propNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        if (propNameNode?.parent) {
          // Find the class this property belongs to
          let classNode: Parser.SyntaxNode | null = propNameNode.parent;
          while (classNode && !classNode.type.includes("class_declaration")) {
            classNode = classNode.parent;
          }

          if (classNode) {
            const className = getNodeText(classNode.childForFieldName("name"));
            const classInfo = this.symbols.get(
              this.getSymbolKey(filePath, className),
            );

            if (classInfo) {
              // Get the property type if available
              const typeNode = propNameNode.parent.childForFieldName("type");
              if (classInfo.type === "class") {
                classInfo.properties.push({
                  name: getNodeText(propNameNode),
                  propertyType: typeNode
                    ? getNodeText(typeNode.lastChild || typeNode)
                    : "any",
                });
              }
            }
          }
        }
      } else if (captureName === "definition.method") {
        const methodNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        if (methodNameNode?.parent) {
          // Find the class this method belongs to
          let classNode: Parser.SyntaxNode | null = methodNameNode.parent;
          while (classNode && !classNode.type.includes("class_declaration")) {
            classNode = classNode.parent;
          }

          if (classNode) {
            const className = getNodeText(classNode.childForFieldName("name"));
            const classInfo = this.symbols.get(
              this.getSymbolKey(filePath, className),
            );

            if (classInfo) {
              const paramsNode =
                methodNameNode.parent.childForFieldName("parameters");
              const returnTypeNode =
                methodNameNode.parent.childForFieldName("return_type");

              if (classInfo.type === "class") {
                classInfo.methods.push({
                  name: getNodeText(methodNameNode),
                  parameters: getParameters(paramsNode),
                  returnType: returnTypeNode
                    ? getNodeText(returnTypeNode.lastChild || returnTypeNode)
                    : "any",
                });
              }
            }
          }
        }
      } else if (captureName === "definition.interface") {
        const interfaceNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        const featureName = getNodeText(interfaceNameNode);
        // Find or create interface entry
        const interfaceInfo = this.symbols.get(
          this.getSymbolKey(filePath, featureName),
        );
        if (!interfaceInfo) {
          const loc = this.nodeToLocation(
            node,
            filePath,
            "definition",
            sourceCode,
          );
          this.symbols.set(this.getSymbolKey(filePath, featureName), {
            name: featureName,
            type: "interface",
            language: lang,
            methods: [],
            properties: [],
            definition: loc,
            references: [],
          });
        }
      } else if (captureName === "interface.property") {
        const propNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        if (propNameNode?.parent) {
          // Find the interface this property belongs to
          let interfaceNode: Parser.SyntaxNode | null = propNameNode.parent;
          while (
            interfaceNode &&
            !interfaceNode.type.includes("interface_declaration")
          ) {
            interfaceNode = interfaceNode.parent;
          }

          if (interfaceNode) {
            const interfaceName = getNodeText(
              interfaceNode.childForFieldName("name"),
            );
            const interfaceInfo = this.symbols.get(
              this.getSymbolKey(filePath, interfaceName),
            );

            if (interfaceInfo) {
              // Get the property type if available
              const typeNode = propNameNode.parent.childForFieldName("type");
              if (interfaceInfo.type === "interface") {
                interfaceInfo.properties.push({
                  name: getNodeText(propNameNode),
                  propertyType: typeNode
                    ? getNodeText(typeNode.lastChild || typeNode)
                    : "any",
                });
              }
            }
          }
        }
      } else if (captureName === "interface.method") {
        const methodNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        if (methodNameNode?.parent) {
          // Find the interface this method belongs to
          let interfaceNode: Parser.SyntaxNode | null = methodNameNode.parent;
          while (
            interfaceNode &&
            !interfaceNode.type.includes("interface_declaration")
          ) {
            interfaceNode = interfaceNode.parent;
          }

          if (interfaceNode) {
            const interfaceName = getNodeText(
              interfaceNode.childForFieldName("name"),
            );
            const interfaceInfo = this.symbols.get(
              this.getSymbolKey(filePath, interfaceName),
            );

            if (interfaceInfo) {
              const paramsNode =
                methodNameNode.parent.childForFieldName("parameters");
              const returnTypeNode =
                methodNameNode.parent.childForFieldName("return_type") ??
                methodNameNode.parent.childForFieldName("type");

              if (interfaceInfo.type === "interface") {
                interfaceInfo.methods.push({
                  name: getNodeText(methodNameNode),
                  parameters: getParameters(paramsNode),
                  returnType: returnTypeNode
                    ? getNodeText(returnTypeNode.lastChild || returnTypeNode)
                    : "any",
                });
              }
            }
          }
        }
      } else if (captureName === "definition.type") {
        const typeNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;
        const typeValueNode = match.captures.find(
          (c) => c.name === "value",
        )?.node;
        const featureName = getNodeText(typeNameNode);
        const loc = this.nodeToLocation(
          node,
          filePath,
          "definition",
          sourceCode,
        );
        this.symbols.set(this.getSymbolKey(filePath, featureName), {
          name: featureName,
          type: "type",
          language: lang,
          typeValue: getNodeText(typeValueNode),
          definition: loc,
          references: [],
        });
      } else if (captureName === "definition.enum") {
        const enumNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;
        if (node && enumNameNode) {
          // Added check for node

          const featureName = getNodeText(enumNameNode);
          const members: EnumMemberInfo[] = [];

          const enumBodyNode = node.childForFieldName("body");
          if (enumBodyNode) {
            for (const memberNode of enumBodyNode.namedChildren) {
              if (memberNode.type === "property_identifier") {
                members.push({
                  name: getNodeText(memberNode),
                });
              } else if (memberNode.type === "enum_assignment") {
                const memberNameNode = memberNode.childForFieldName("name");
                const memberValueNode = memberNode.childForFieldName("value");
                members.push({
                  name: getNodeText(memberNameNode),
                  value: getNodeText(memberValueNode),
                });
              }
            }
          }
          const loc = this.nodeToLocation(
            node,
            filePath,
            "definition",
            sourceCode,
          );
          this.symbols.set(this.getSymbolKey(filePath, featureName), {
            name: featureName,
            type: "enum",
            language: lang,
            members,
            definition: loc,
            references: [],
          });
        }
      }
    }
  }

  /**
   * Find symbol name at a specific position in a file
   */
  private async getSymbolNameAtPosition(
    filePath: string,
    line: number,
    column: number,
  ): Promise<string | null> {
    const extension = extname(filePath);
    const parser = this.treeSitterManager.getParser(extension);
    if (!parser) {
      throw new Error(`No parser for extension: ${extension}`);
    }

    const code = await readFile(filePath, "utf8");
    const tree = parser.parse(code);

    // Find the node at the position
    const point = { row: line, column: column };
    const node = this.findNodeAtPosition(tree.rootNode, point);

    if (node && this.isIdentifier(node)) {
      return node.text;
    }

    return null;
  }

  /**
   * Find all definitions in a file
   */
  private async findDefinitionsInFile(filePath: string): Promise<void> {
    const extension = extname(filePath);
    const parser = this.treeSitterManager.getParser(extension);
    if (!parser) {
      throw new Error(`No parser for extension: ${extension}`);
    }

    const query = this.treeSitterManager.getQuery(extension);
    if (!query) {
      throw new Error(`No query for extension: ${extension}`);
    }

    const code = await readFile(filePath, "utf8");
    const tree = parser.parse(code);

    const lang = extensionToLanguage(extension);

    if (!lang) {
      throw new Error(`No registered language: ${extension}`);
    }

    this.findDefinitions(filePath, query, tree, lang, code);
  }

  /**
   * Find all references in a file
   */
  private async findReferencesInFile(filePath: string): Promise<void> {
    const extension = extname(filePath);
    const parser = this.treeSitterManager.getParser(extension);
    if (!parser) {
      return;
    }

    const code = await readFile(filePath, "utf8");
    const tree = parser.parse(code);

    // For all identifiers, check if they're in our symbols map
    this.findIdentifierReferences(tree.rootNode, filePath, code);
  }

  /**
   * Helper method to find all files in a directory
   */
  private async findAllFiles(dir: string): Promise<string[]> {
    const allFiles = await globby("**/*", { cwd: dir, gitignore: true });

    const files = allFiles.filter((file) => {
      // Check if the file has a supported extension
      const ext = extname(file).slice(1);
      return ["ts", "js", "py", "java"].includes(ext);
    });
    return files;
  }

  /**
   * Find identifier references in a syntax tree
   */
  private findIdentifierReferences(
    node: SyntaxNode,
    filePath: string,
    code: string,
  ): void {
    if (this.isIdentifier(node)) {
      const identifierName = node.text;

      // Check if this identifier is in our symbols map
      const symbol = this.symbols.get(
        this.getSymbolKey(filePath, identifierName),
      );
      if (symbol) {
        // Check if this is not the definition
        const defLoc = symbol.definition;
        if (
          defLoc.filePath !== filePath ||
          defLoc.start.row !== node.startPosition.row ||
          defLoc.start.column !== node.startPosition.column
        ) {
          // Add as a reference
          const refLoc = this.nodeToLocation(node, filePath, "reference", code);

          symbol.references.push(refLoc);
        }
      }
    }

    // Recursively search children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.findIdentifierReferences(child, filePath, code);
      }
    }
  }

  /**
   * Helper method to find node at a specific position
   */
  private findNodeAtPosition(
    node: SyntaxNode,
    point: { row: number; column: number },
  ): SyntaxNode | null {
    if (!(node.startPosition && node.endPosition)) {
      return null;
    }

    // Check if point is within this node
    if (
      (node.startPosition.row < point.row ||
        (node.startPosition.row === point.row &&
          node.startPosition.column <= point.column)) &&
      (node.endPosition.row > point.row ||
        (node.endPosition.row === point.row &&
          node.endPosition.column >= point.column))
    ) {
      // Check children
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          const found = this.findNodeAtPosition(child, point);
          if (found) {
            return found;
          }
        }
      }

      // If no child contains the point, this node is the most specific one
      return node;
    }

    return null;
  }

  /**
   * Helper method to check if a node is an identifier
   */
  private isIdentifier(node: SyntaxNode): boolean {
    return (
      node.type === "identifier" ||
      node.type === "property_identifier" ||
      node.type === "field_identifier"
    );
  }

  /**
   * Convert a syntax node to a location object
   */
  private nodeToLocation(
    node: SyntaxNode,
    filePath: string,
    type: "definition" | "reference",
    code: string,
  ): SymbolLocation {
    // Add context (a snippet of code around the reference)
    const startLine = node.startPosition.row;
    const endLine = node.endPosition.row;
    let context = "";
    if (startLine === endLine) {
      const firstLine = code.split("\n")[startLine];
      context = firstLine?.trim() ?? "";
    } else {
      const lines = code
        .split("\n")
        .slice(node.startPosition.row, node.endPosition.row + 1);
      context = lines.join("\n");
    }
    // context = code.slice(node.parent?.startIndex, node.parent?.endIndex);
    return {
      filePath,
      start: node.startPosition,
      end: node.endPosition,
      type,
      context,
    };
  }
}
