import { dirname, isAbsolute, join } from "node:path";
import {
  sys,
  type ArrowFunction,
  type ClassDeclaration,
  type FunctionDeclaration,
  type FunctionExpression,
  type InterfaceDeclaration,
  type MethodDeclaration,
  type Node,
  ObjectFlags,
  type ObjectType,
  type Program,
  SignatureKind,
  type SourceFile,
  SymbolFlags,
  type Type,
  type TypeChecker,
  TypeFlags,
  TypeFormatFlags, // Add this
  type TypeReference,
  createProgram,
  forEachChild,
  getPositionOfLineAndCharacter,
  isArrowFunction,
  isClassDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignature,
  isPropertyAccessExpression,
  isPropertyDeclaration,
  isPropertySignature,
  parseJsonConfigFileContent,
  readConfigFile,
} from "typescript";

export interface TypeInfo {
  name: string; // Type name like 'string', 'number', 'MyClass', etc.
  isArray?: boolean; // Whether this is an array type
  isOptional?: boolean; // Whether this is an optional type
  isUnion?: boolean; // Whether this is a union type
  unionTypes?: TypeInfo[]; // For union types, the constituent types
  typeArguments?: TypeInfo[]; // For generic types, the type arguments
  members?: Map<string, TypeInfo>; // For object/class types, member properties and their types
}

/**
 * A class to handle TypeScript type checking and type resolution
 * using the TypeScript Compiler API
 */
export class TypeScriptTypeChecker {
  private program: Program | null = null;
  private checker: TypeChecker | null = null;
  private projectPath: string | null = null;

  /**
   * Initialize the TypeScript compiler with a project
   */
  initialize(projectPath: string, tsConfigPath: string): void {
    this.projectPath = projectPath;

    // Read tsconfig.json
    const configFile = readConfigFile(tsConfigPath, sys.readFile);
    if (configFile.error) {
      throw new Error(
        `Error reading tsconfig.json: ${configFile.error.messageText}`,
      );
    }

    // Parse the config
    const parsedCommandLine = parseJsonConfigFileContent(
      configFile.config,
      sys,
      dirname(tsConfigPath),
    );

    if (parsedCommandLine.errors.length > 0) {
      const firstError = parsedCommandLine.errors[0];
      throw new Error(
        `Error parsing tsconfig.json: ${firstError ? firstError.messageText : "Unknown error"}`,
      );
    }

    // Create the program
    this.program = createProgram({
      rootNames: parsedCommandLine.fileNames,
      options: parsedCommandLine.options,
    });

    // Get the type checker
    if (this.program) {
      this.checker = this.program.getTypeChecker();
    } else {
      throw new Error("TypeScript program is null after creation.");
    }
  }

  /**
   * Get type information for a symbol at a specific location
   */
  getTypeAtLocation(
    filePath: string,
    line: number,
    column: number,
  ): TypeInfo | null {
    if (!(this.program && this.checker)) {
      return null;
    }

    // Convert to absolute path if necessary
    const absFilePath = isAbsolute(filePath)
      ? filePath
      : join(this.projectPath ?? "", filePath);

    // Find the source file
    const sourceFile = this.program.getSourceFile(absFilePath);
    if (!sourceFile) {
      return null;
    }

    // Convert line/column to position
    const position = getPositionOfLineAndCharacter(sourceFile, line, column);

    // Get the node at the position
    const node = this.findNodeAtPosition(sourceFile, position);
    if (!node) {
      return null;
    }

    // Get the symbol
    const symbol = this.checker.getSymbolAtLocation(node);
    if (!symbol) {
      return null;
    }

    // Get the type
    const type = this.checker.getTypeOfSymbolAtLocation(symbol, node);

    // Convert to our TypeInfo format
    return this.convertTypeToTypeInfo(type);
  }

  /**
   * Get detailed type information for a class or interface
   */
  getClassOrInterfaceInfo(
    filePath: string,
    name: string,
  ): {
    typeInfo: TypeInfo;
    heritage: string[];
    members: Map<string, TypeInfo>;
  } | null {
    if (!(this.program && this.checker)) {
      return null;
    }

    // Convert to absolute path if necessary
    const absFilePath = isAbsolute(filePath)
      ? filePath
      : join(this.projectPath || "", filePath);

    // Find the source file
    const sourceFile = this.program.getSourceFile(absFilePath);
    if (!sourceFile) {
      return null;
    }

    // Find the class or interface declaration
    const node = this.findClassOrInterfaceDeclaration(sourceFile, name);
    if (!node) {
      return null;
    }

    // Get the symbol
    if (!node.name) {
      return null;
    }
    const symbol = this.checker.getSymbolAtLocation(node.name);
    if (!symbol) {
      return null;
    }

    // Get the type
    const type = this.checker.getDeclaredTypeOfSymbol(symbol);

    // Get heritage clause info (extends/implements)
    const heritage: string[] = [];
    if (isClassDeclaration(node) || isInterfaceDeclaration(node)) {
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const type of clause.types) {
            const expression = type.expression;
            if (isIdentifier(expression)) {
              heritage.push(expression.text);
            } else if (isPropertyAccessExpression(expression)) {
              heritage.push(expression.getText());
            }
          }
        }
      }
    }

    // Get members
    const members = new Map<string, TypeInfo>();

    symbol.members?.forEach((memberSymbol, key) => {
      // Get the declaration
      const decl = memberSymbol.declarations?.[0];
      if (!decl) {
        return;
      }

      // Get the type of the member
      let memberType: Type | undefined;

      if (isPropertyDeclaration(decl) || isPropertySignature(decl)) {
        memberType = decl.type
          ? this.checker?.getTypeFromTypeNode(decl.type)
          : this.checker?.getTypeOfSymbolAtLocation(memberSymbol, decl);
      } else if (isMethodDeclaration(decl) || isMethodSignature(decl)) {
        memberType = this.checker?.getTypeOfSymbolAtLocation(
          memberSymbol,
          decl,
        );
      }

      if (memberType) {
        members.set(key.toString(), this.convertTypeToTypeInfo(memberType));
      }
    });

    return {
      typeInfo: this.convertTypeToTypeInfo(type),
      heritage,
      members,
    };
  }

  /**
   * Get detailed type information for a function
   */
  getFunctionInfo(
    filePath: string,
    line: number,
    column: number,
  ): {
    returnType: TypeInfo;
    parameters: Array<{ name: string; type: TypeInfo }>;
  } | null {
    if (!(this.program && this.checker)) {
      return null;
    }

    // Convert to absolute path if necessary
    const absFilePath = isAbsolute(filePath)
      ? filePath
      : join(this.projectPath || "", filePath);

    // Find the source file
    const sourceFile = this.program.getSourceFile(absFilePath);
    if (!sourceFile) {
      return null;
    }

    // Convert line/column to position
    const position = getPositionOfLineAndCharacter(sourceFile, line, column);

    // Find the function declaration
    const node = this.findFunctionDeclaration(sourceFile, position);
    if (!node) {
      return null;
    }

    // Get the symbol
    const symbol = this.checker.getSymbolAtLocation(
      "name" in node && node.name && isIdentifier(node.name) ? node.name : node,
    );
    if (!symbol) {
      return null;
    }

    // Get the signature
    const signatures = this.checker.getSignaturesOfType(
      this.checker.getTypeOfSymbolAtLocation(symbol, node),
      SignatureKind.Call,
    );

    if (signatures.length === 0) {
      return null;
    }

    const signature = signatures[0];
    if (!signature) {
      return null;
    }

    // Get return type
    const returnType = this.checker.getReturnTypeOfSignature(signature);

    // Get parameters
    const parameters: Array<{ name: string; type: TypeInfo }> = [];

    for (const param of signature.parameters) {
      const paramType = this.checker.getTypeOfSymbolAtLocation(
        param,
        param.declarations?.[0] || node,
      );

      parameters.push({
        name: param.getName(),
        type: this.convertTypeToTypeInfo(paramType),
      });
    }

    return {
      returnType: this.convertTypeToTypeInfo(returnType),
      parameters,
    };
  }

  /**
   * Helper method to convert a TS type to our TypeInfo interface
   * Added depth limiting and visited set to prevent stack overflow with recursive types.
   */
  private convertTypeToTypeInfo(
    type: Type,
    depth = 0,
    visited = new Set<Type>(),
  ): TypeInfo {
    if (!this.checker) {
      return { name: "unknown" };
    }

    // Prevent infinite recursion
    if (depth > 10 || visited.has(type)) {
      // Return a placeholder for recursive or too deep types
      return {
        name:
          this.checker.typeToString(
            type,
            undefined,
            TypeFormatFlags.NoTruncation |
              TypeFormatFlags.UseFullyQualifiedType,
          ) + " (recursive/too deep)",
      };
    }

    visited.add(type); // Mark this type as visited for the current path

    const typeInfo: TypeInfo = {
      name: this.checker.typeToString(type),
    };

    // Check if it's an array type
    if (this.checker.isArrayType(type)) {
      const typeArguments = this.checker.getTypeArguments(
        type as TypeReference,
      );
      if (typeArguments && typeArguments.length > 0) {
        const elementType = typeArguments[0];
        if (elementType) {
          typeInfo.isArray = true;
          // Recursively convert element type
          const elementTypeInfo = this.convertTypeToTypeInfo(
            elementType,
            depth + 1,
            new Set(visited),
          );
          typeInfo.name = `${elementTypeInfo.name}[]`;
        }
      } else {
        typeInfo.isArray = true;
        typeInfo.name = "unknown[]";
      }
    }
    // Check if it's a union type
    else if (type.isUnion()) {
      typeInfo.isUnion = true;
      typeInfo.unionTypes = type.types.map((t) =>
        // Recursively convert union members
        this.convertTypeToTypeInfo(t, depth + 1, new Set(visited)),
      );
      // Reconstruct name from potentially truncated member names
      typeInfo.name = typeInfo.unionTypes.map((ut) => ut.name).join(" | ");
    }
    // Check if it's a type reference (like classes or interfaces) or object literal
    else if (
      type.getSymbol() ||
      (type.flags & TypeFlags.Object &&
        (type as ObjectType).objectFlags & ObjectFlags.Anonymous)
    ) {
      const symbol = type.getSymbol();
      if (
        symbol &&
        (symbol.flags & SymbolFlags.Class ||
          symbol.flags & SymbolFlags.Interface ||
          symbol.flags & SymbolFlags.TypeAlias)
      ) {
        // Use symbol name if available for potentially complex types
        typeInfo.name = symbol.getName();
      }

      // Get type arguments for generic types
      if (isTypeReference(type)) {
        const typeRef = type as TypeReference;
        if (typeRef.typeArguments && typeRef.typeArguments.length > 0) {
          typeInfo.typeArguments = typeRef.typeArguments.map((t) =>
            // Recursively convert type arguments
            this.convertTypeToTypeInfo(t, depth + 1, new Set(visited)),
          );
          // Add type arguments to name if not already present
          if (!typeInfo.name.includes("<")) {
            typeInfo.name += `<${typeInfo.typeArguments.map((ta) => ta.name).join(", ")}>`;
          }
        }
      }

      // Get properties/members
      const properties = type.getProperties();
      if (properties.length > 0) {
        typeInfo.members = new Map();

        for (const prop of properties) {
          const decl = prop.declarations?.[0];
          if (decl) {
            try {
              const propType = this.checker.getTypeOfSymbolAtLocation(
                prop,
                decl,
              );
              // Recursively convert member type
              typeInfo.members.set(
                prop.getName(),
                this.convertTypeToTypeInfo(
                  propType,
                  depth + 1,
                  new Set(visited),
                ),
              );
            } catch (e) {
              console.warn(
                `Could not resolve type for property ${prop.getName()} in ${typeInfo.name}: ${e}`,
              );
              typeInfo.members.set(prop.getName(), {
                name: "error resolving type",
              });
            }
          }
        }
      }
    }

    // Remove type from visited set when returning up the stack
    // visited.delete(type); // Note: Creating new Sets for recursive calls avoids the need for this delete

    return typeInfo;
  }

  /**
   * Find node at a specific position
   */
  private findNodeAtPosition(
    sourceFile: SourceFile,
    position: number,
  ): Node | null {
    function find(node: Node): Node | null {
      if (position >= node.getStart() && position < node.getEnd()) {
        // Check children
        for (const child of node.getChildren()) {
          const found = find(child);
          if (found) {
            return found;
          }
        }
        return node;
      }
      return null;
    }

    return find(sourceFile);
  }

  /**
   * Find class or interface declaration by name
   */
  private findClassOrInterfaceDeclaration(
    sourceFile: SourceFile,
    name: string,
  ): ClassDeclaration | InterfaceDeclaration | null {
    let result: ClassDeclaration | InterfaceDeclaration | null = null;

    function visit(node: Node) {
      if (
        (isClassDeclaration(node) || isInterfaceDeclaration(node)) &&
        node.name &&
        node.name.text === name
      ) {
        result = node;
        return;
      }

      forEachChild(node, visit);
    }

    visit(sourceFile);
    return result;
  }

  /**
   * Find function declaration at position
   */
  private findFunctionDeclaration(
    sourceFile: SourceFile,
    position: number,
  ):
    | FunctionDeclaration
    | MethodDeclaration
    | ArrowFunction
    | FunctionExpression
    | null {
    let result:
      | FunctionDeclaration
      | MethodDeclaration
      | ArrowFunction
      | FunctionExpression
      | null = null;

    function visit(node: Node) {
      if (position >= node.getStart() && position < node.getEnd()) {
        if (
          isFunctionDeclaration(node) ||
          isMethodDeclaration(node) ||
          isArrowFunction(node) ||
          isFunctionExpression(node)
        ) {
          result = node;
          return;
        }

        forEachChild(node, visit);
      }
    }

    visit(sourceFile);
    return result;
  }
}

function isTypeReference(type: Type): type is TypeReference {
  return (
    (type.flags & TypeFlags.Object) !== 0 &&
    ((type as ObjectType).objectFlags & ObjectFlags.Reference) !== 0
  );
}
