import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { globby } from "globby";
import Parser, { type SyntaxNode } from "tree-sitter";
import Java from "tree-sitter-java";
import JavaScript from "tree-sitter-javascript";
import Python from "tree-sitter-python";
import TypeScript from "tree-sitter-typescript";
import type {
  TypeInfo,
  TypeScriptTypeChecker,
} from "./typescript-type-checker.ts";

interface SymbolLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  type: "definition" | "reference";
  context?: string; // Snippet of code for context
}

interface Symbol {
  name: string;
  type: "class" | "function" | "variable" | "interface" | "type" | "enum";
  language: "typescript" | "javascript" | "python" | "java";
  definition: SymbolLocation;
  references: SymbolLocation[];
  typeInfo?: TypeInfo; // Type information for this symbol
  returnType?: TypeInfo; // Return type for functions
  parameters?: Array<{
    // Parameters for functions
    name: string;
    type?: TypeInfo;
    defaultValue?: string;
  }>;
  heritage?: string[];
}

class CodeNavigator {
  private symbols: Map<string, Symbol> = new Map();
  private parsers: Map<string, Parser> = new Map();
  private typeChecker: TypeScriptTypeChecker | null = null;

  constructor() {
    // Initialize parsers for each language
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript);
    this.parsers.set("ts", tsParser);

    const jsParser = new Parser();
    jsParser.setLanguage(JavaScript);
    this.parsers.set("js", jsParser);

    const pyParser = new Parser();
    pyParser.setLanguage(Python);
    this.parsers.set("py", pyParser);

    const javaParser = new Parser();
    javaParser.setLanguage(Java);
    this.parsers.set("java", javaParser);

    // Initialize TypeScript type checker
    this.typeChecker = null; // new TypeScriptTypeChecker();
  }

  /**
   * Indexing a project directory
   */
  async indexProject(projectDir: string): Promise<void> {
    const files = await this.findAllFiles(projectDir);

    // Initialize TypeScript compiler for the project
    if (this.typeChecker) {
      const tsConfigPath = join(projectDir, "tsconfig.json");
      if (existsSync(tsConfigPath)) {
        await this.typeChecker.initialize(projectDir, tsConfigPath);
      } else {
        // TODO: Handle case where tsconfig.json does not exist
        console.warn("tsconfig.json not found in project root. TypeScript type checking may be incomplete.");
      }
    }

    // First pass: Find all definitions
    for (const file of files) {
      this.findDefinitionsInFile(file);
    }

    // Second pass: Find all references
    for (const file of files) {
      await this.findReferencesInFile(file);
    }

    // Third pass: Resolve types for TypeScript files
    if (this.typeChecker) {
      for (const [_name, symbol] of this.symbols.entries()) {
        if (symbol.language === "typescript") {
          await this.enrichSymbolWithTypeInfo(symbol);
        }
      }
    }
  }

  /**
   * Find definition of a symbol at a specific position
   */
  findDefinitionAtPosition(
    filePath: string,
    line: number,
    column: number,
  ): Symbol | null {
    // Get the symbol name at the specified position
    const symbolName = this.getSymbolNameAtPosition(filePath, line, column);
    if (!symbolName) {
      return null;
    }

    return this.symbols.get(symbolName) || null;
  }

  /**
   * Find all usages of a symbol
   */
  findUsages(symbolName: string): SymbolLocation[] {
    const symbol = this.symbols.get(symbolName);
    if (!symbol) {
      return [];
    }

    // Return definition and all references
    return [symbol.definition, ...symbol.references];
  }

  /**
   * Find symbol name at a specific position in a file
   */
  private getSymbolNameAtPosition(
    filePath: string,
    line: number,
    column: number,
  ): string | null {
    const extension = extname(filePath).slice(1);
    const parser = this.parsers.get(extension);
    if (!parser) {
      return null;
    }

    const code = readFileSync(filePath, "utf8");
    const tree = parser.parse(code);

    // Find the node at the position
    const point = { row: line, column: column };
    const node = this.findNodeAtPosition(tree.rootNode, point);

    if (node && this.isIdentifier(node)) {
      return node.text;
    }

    return null;
  }

  private extensionToLanguage(
    extension: string,
  ): "typescript" | "javascript" | "python" | "java" | null {
    switch (extension) {
      case "ts":
        return "typescript";
      case "js":
        return "javascript";
      case "py":
        return "python";
      case "java":
        return "java";
      default:
        return null;
    }
  }

  /**
   * Find all definitions in a file
   */
  private findDefinitionsInFile(filePath: string): void {
    const extension = extname(filePath).slice(1);
    const parser = this.parsers.get(extension);
    if (!parser) {
      return;
    }

    const code = readFileSync(filePath, "utf8");
    const tree = parser.parse(code);

    const lang = this.extensionToLanguage(extension);

    if (!lang) {
      return;
    }

    // Example: Find class definitions
    this.findClassDefinitions(tree.rootNode, filePath, lang);

    // Example: Find function definitions
    this.findFunctionDefinitions(tree.rootNode, filePath, lang);

    // Example: Find variable definitions
    this.findVariableDefinitions(tree.rootNode, filePath, lang);
  }

  /**
   * Find all references in a file
   */
  private findReferencesInFile(filePath: string): void {
    const extension = extname(filePath).slice(1);
    const parser = this.parsers.get(extension);
    if (!parser) {
      return;
    }

    const code = readFileSync(filePath, "utf8");
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
   * Find class definitions in a syntax tree
   */
  private findClassDefinitions(
    node: SyntaxNode,
    filePath: string,
    language: "typescript" | "javascript" | "python" | "java",
  ): void {
    // Different node types for different languages
    const classNodeTypes = {
      typescript: ["class_declaration"],
      javascript: ["class_declaration"],
      python: ["class_definition"],
      java: ["class_declaration"],
    };

    if (classNodeTypes[language].includes(node.type)) {
      // Find the class name (identifier node)
      const nameNode = this.findNameNode(node, language);

      if (nameNode) {
        const className = nameNode.text;
        const loc = this.nodeToLocation(nameNode, filePath, "definition");

        this.symbols.set(className, {
          name: className,
          type: "class",
          language,
          definition: loc,
          references: [],
        });
      }
    }

    // Recursively search children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.findClassDefinitions(child, filePath, language);
      }
    }
  }

  /**
   * Find function definitions in a syntax tree
   */
  private findFunctionDefinitions(
    node: SyntaxNode,
    filePath: string,
    language: "typescript" | "javascript" | "python" | "java",
  ): void {
    // Different node types for different languages
    const funcNodeTypes = {
      typescript: ["function_declaration", "method_definition"],
      javascript: ["function_declaration", "method_definition"],
      python: ["function_definition"],
      java: ["method_declaration"],
    };

    if (funcNodeTypes[language].includes(node.type)) {
      // Find the function name (identifier node)
      const nameNode = this.findNameNode(node, language);

      if (nameNode) {
        const funcName = nameNode.text;
        const loc = this.nodeToLocation(nameNode, filePath, "definition");

        this.symbols.set(funcName, {
          name: funcName,
          type: "function",
          language,
          definition: loc,
          references: [],
        });
      }
    }

    // Recursively search children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.findFunctionDefinitions(child, filePath, language);
      }
    }
  }

  /**
   * Find variable definitions in a syntax tree
   */
  private findVariableDefinitions(
    node: SyntaxNode,
    filePath: string,
    language: "typescript" | "javascript" | "python" | "java",
  ): void {
    // Different node types for different languages
    const varNodeTypes = {
      typescript: ["variable_declarator"],
      javascript: ["variable_declarator"],
      python: ["assignment"],
      java: ["variable_declarator"],
    };

    if (varNodeTypes[language].includes(node.type)) {
      // Find the variable name (identifier node)
      const nameNode = this.findNameNode(node, language);

      if (nameNode) {
        const varName = nameNode.text;
        const loc = this.nodeToLocation(nameNode, filePath, "definition");

        this.symbols.set(varName, {
          name: varName,
          type: "variable",
          language,
          definition: loc,
          references: [],
        });
      }
    }

    // Recursively search children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.findVariableDefinitions(child, filePath, language);
      }
    }
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
      const symbol = this.symbols.get(identifierName);
      if (symbol) {
        // Check if this is not the definition
        const defLoc = symbol.definition;
        if (
          defLoc.filePath !== filePath ||
          defLoc.startLine !== node.startPosition.row ||
          defLoc.startColumn !== node.startPosition.column
        ) {
          // Add as a reference
          const refLoc = this.nodeToLocation(node, filePath, "reference");

          // Add context (a snippet of code around the reference)
          const lineStart = code.split("\n")[node.startPosition.row];
          refLoc.context = lineStart?.trim();

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
   * Helper method to find the name node of a definition
   */
  private findNameNode(
    node: SyntaxNode,
    language: "typescript" | "javascript" | "python" | "java",
  ): SyntaxNode | null {
    // Different strategies for different languages
    switch (language) {
      case "typescript":
      case "javascript": {
        // For classes and functions, usually the second child is the name
        if (
          node.type === "class_declaration" ||
          node.type === "function_declaration"
        ) {
          return node.childForFieldName("name");
        }
        // For methods, it's also the name field
        if (node.type === "method_definition") {
          return node.childForFieldName("name");
        }
        // For variables, the first child is the name
        if (node.type === "variable_declarator") {
          return node.childForFieldName("name");
        }
        break;
      }
      case "python": {
        // For classes and functions, look for the identifier child
        if (
          node.type === "class_definition" ||
          node.type === "function_definition"
        ) {
          return node.childForFieldName("name");
        }
        // For assignments, the first child is typically the target (variable name)
        if (node.type === "assignment") {
          const target = node.childForFieldName("left");
          if (target && target.type === "identifier") {
            return target;
          }
        }
        break;
      }
      case "java": {
        // For classes and methods, find the identifier
        if (
          node.type === "class_declaration" ||
          node.type === "method_declaration"
        ) {
          return node.childForFieldName("name");
        }
        // For variables, the child after type is the name
        if (node.type === "variable_declarator") {
          return node.childForFieldName("name");
        }
        break;
      }
      default:
        return null;
    }

    return null;
  }

  /**
   * Convert a syntax node to a location object
   */
  private nodeToLocation(
    node: SyntaxNode,
    filePath: string,
    type: "definition" | "reference",
  ): SymbolLocation {
    return {
      filePath,
      startLine: node.startPosition.row,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row,
      endColumn: node.endPosition.column,
      type,
    };
  }
  /**
   * Enrich a symbol with type information using TypeScript's type checker
   */
  private async enrichSymbolWithTypeInfo(symbol: Symbol): Promise<void> {
    if (!this.typeChecker || symbol.language !== "typescript") {
      return;
    }

    try {
      // Handle different symbol types
      switch (symbol.type) {
        case "class":
        case "interface": {
          const classInfo = await this.typeChecker.getClassOrInterfaceInfo(
            symbol.definition.filePath,
            symbol.name,
          );

          if (classInfo) {
            symbol.typeInfo = classInfo.typeInfo;
            symbol.heritage = classInfo.heritage;
            // Store member info in the typeInfo
            if (classInfo.members.size > 0) {
              symbol.typeInfo.members = classInfo.members;
            }
          }
          break;
        }

        case "function": {
          const funcInfo = await this.typeChecker.getFunctionInfo(
            symbol.definition.filePath,
            symbol.definition.startLine,
            symbol.definition.startColumn,
          );

          if (funcInfo) {
            symbol.returnType = funcInfo.returnType;
            symbol.parameters = funcInfo.parameters.map((p) => ({
              name: p.name,
              type: p.type,
            }));
          }
          break;
        }

        case "variable": {
          const typeInfo = await this.typeChecker.getTypeAtLocation(
            symbol.definition.filePath,
            symbol.definition.startLine,
            symbol.definition.startColumn,
          );

          if (typeInfo) {
            symbol.typeInfo = typeInfo;
          }
          break;
        }
        default:
          console.warn(`Unsupported symbol type: ${symbol.type}`);
          break;
      }
    } catch (error) {
      console.error(
        `Error enriching symbol ${symbol.name} with type info:`,
        error,
      );
    }
  }
}

// Example usage
async function main() {
  const navigator = new CodeNavigator();

  console.info(`Indexing ${process.cwd()}`);
  // Index a project
  await navigator.indexProject(process.cwd());

  // Find definition of a symbol at position
  const definition = navigator.findDefinitionAtPosition(
    join(process.cwd(), "source/prompts.ts"),
    222,
    17,
  );
  console.info(
    `Symbol: ${definition?.name}, Defintion: ${JSON.stringify(definition?.definition)}`,
  );

  if (definition) {
    // Display type information if available
    if (definition.typeInfo) {
      if (definition.typeInfo.isArray) {
        console.info(
          "definition.typeInfo.isArray: ",
          definition.typeInfo.isArray,
        );
      }

      if (definition.typeInfo.isUnion) {
        console.info(
          "definition.typeInfo.isUnion: ",
          definition.typeInfo.isUnion,
        );
      }

      if (definition.typeInfo.members && definition.typeInfo.members.size > 0) {
        console.info(
          "definition.typeInfo.members: ",
          definition.typeInfo.members,
        );
        definition.typeInfo.members.forEach((memberType, memberName) => {
          console.info(
            `Member: ${memberName}, Type: ${JSON.stringify(memberType)}`,
          );
        });
      }
    }

    if (definition.type === "function") {
      // Display function information if available
      if (definition.parameters) {
        for (const param of definition.parameters) {
          console.info("definition.parameters: ", param);
        }
      }

      if (definition.returnType) {
        console.info("definition.returnType: ", definition.returnType);
      }
    }

    // Display class/interface information if available
    if (definition.type === "class" || definition.type === "interface") {
      if (definition.heritage && definition.heritage.length > 0) {
        console.info("definition.heritage: ", definition.heritage);
      }
    }
  } else {
    console.info("Definition not found.");
  }

  // Find usages of a symbol
  const usages = navigator.findUsages("systemPrompt");

  for (const usage of usages) {
    if (usage.context) {
      console.info("Usage context: ", usage.context);
    }
    console.info("Usage: ", usage);
  }
}

main().catch(console.error);
