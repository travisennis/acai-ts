import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type Parser from "tree-sitter";
import type { Query, SyntaxNode } from "tree-sitter";
import { TreeSitterManager } from "./tree-sitter-manager.ts";

interface FileStructure {
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
}

interface ImportInfo {
  name: string;
  fileName: string;
}

interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
}

interface ParameterInfo {
  name: string;
  type: string;
}

interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
}

interface PropertyInfo {
  name: string;
  type: string;
}

interface InterfaceInfo {
  name: string;
  properties: PropertyInfo[];
  methods: FunctionInfo[];
}

interface TypeInfo {
  name: string;
  type: string;
}

type FormatType = "xml" | "markdown" | "bracket";

export class CodeMap {
  private readonly structure: FileStructure;

  private constructor(structure: FileStructure) {
    this.structure = structure;
  }

  static fromFile(filePath: string): CodeMap {
    const extension = extname(filePath);
    const treeSitterManager = new TreeSitterManager();
    const sourceText = readFileSync(filePath, "utf8");
    const parser = treeSitterManager.getParser(extension);
    const query = treeSitterManager.getQuery(extension);
    if (parser && query) {
      const tree = parser.parse(sourceText);
      const structure = CodeMap.analyzeSourceTree(tree, query, sourceText);
      return new CodeMap(structure);
    }
    throw new Error("Unsupported code file.");
  }

  static fromSource(source: string, fileName = "source.ts"): CodeMap {
    const extension = extname(fileName);
    const treeSitterManager = new TreeSitterManager();
    const parser = treeSitterManager.getParser(extension);
    const query = treeSitterManager.getQuery(extension);
    if (parser && query) {
      const tree = parser.parse(source);
      // Note: fileName is not used by tree-sitter in this context but kept for interface consistency
      const structure = CodeMap.analyzeSourceTree(tree, query, source);
      return new CodeMap(structure);
    }
    throw new Error("Unsupported code file.");
  }

  getStructure(): FileStructure {
    return this.structure;
  }

  format(formatType: FormatType = "xml", filePath = ""): string {
    let output = "";
    switch (formatType) {
      case "xml":
        output += `<codeMap>\n<filePath>${filePath}</filePath>\n<map>\n`;
        break;
      case "markdown":
        output += `## CodeMap\nFilePath: ${filePath}\n\n\`\`\`\n`;
        break;
      case "bracket":
        output += `[code map ${filePath} begin]\n\n`;
        break;
      default:
        output += `<codeMap>\n<filePath>${filePath}</filePath>\n<map>\n`;
    }

    if (this.structure.imports.length > 0) {
      output += "Imported files:\n";
      for (const relativeImport of this.structure.imports) {
        output += `  ${relativeImport.fileName}\n`;
      }
      output += "\n\n";
    }

    if (this.structure.functions.length > 0) {
      output += "Functions:\n";
      for (const func of this.structure.functions) {
        output += `  ${func.name}(${func.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${func.returnType}\n`;
      }
      output += "\n\n";
    }

    if (this.structure.classes.length > 0) {
      output += "Classes:\n";
      for (const cls of this.structure.classes) {
        output += `  ${cls.name}\n`;
        for (const prop of cls.properties) {
          output += `    Property: ${prop.name}: ${prop.type}\n`;
        }
        for (const method of cls.methods) {
          output += `    Method: ${method.name}(${method.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${method.returnType}\n`;
        }
      }
      output += "\n\n";
    }

    if (this.structure.interfaces.length > 0) {
      output += "Interfaces:\n";
      for (const intf of this.structure.interfaces) {
        output += `  ${intf.name}\n`;
        for (const prop of intf.properties) {
          output += `    Property: ${prop.name}: ${prop.type}\n`;
        }
        for (const method of intf.methods) {
          output += `    Method: ${method.name}(${method.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${method.returnType}\n`;
        }
      }
      output += "\n\n";
    }

    if (this.structure.types.length > 0) {
      output += "Type Aliases:\n";
      for (const type of this.structure.types) {
        output += `  ${type.name} = ${type.type}\n`;
      }
    }

    switch (formatType) {
      case "xml":
        output += "</map>\n</codeMap>\n";
        break;
      case "markdown":
        output += "\n```\n\n";
        break;
      case "bracket":
        output += `[code map ${filePath} end]\n\n`;
        break;
      default:
        output += "</map>\n</codeMap>\n";
    }
    return output;
  }

  private static analyzeSourceTree(
    tree: Parser.Tree,
    query: Query,
    sourceCode: string,
  ): FileStructure {
    const structure: FileStructure = {
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
    };

    // Define Tree-sitter queries for different constructs
    // These queries are inspired by source/code-utils/code-mapper.ts and adapted for code-map.ts needs
    //     const tsQuery = new Query(
    //       TypeScript.typescript,
    //       `
    // (import_statement source: (string) @import.source) @import

    // (function_declaration
    //   name: (identifier) @function.name
    //   parameters: (formal_parameters) @function.parameters
    //   return_type: (type_annotation) @function.returnType
    // ) @function

    // (export_statement
    //   declaration: (variable_declaration
    //     (variable_declarator
    //       name: (identifier) @function.name
    //       value: (arrow_function
    //                 parameters: (formal_parameters) @function.parameters
    //                 return_type: (type_annotation) @function.returnType
    //              )
    //     ) @function
    //   ))

    // (export_statement
    //   declaration: (lexical_declaration
    //     (variable_declarator
    //       name: (identifier) @function.name
    //       value: (arrow_function
    //                 parameters: (formal_parameters) @function.parameters
    //                 return_type: (type_annotation) @function.returnType
    //              )
    //     ) @function
    //   ))

    // (class_declaration
    //   name: (type_identifier) @class.name
    // ) @class

    // (public_field_definition
    //   name: (property_identifier) @class.property.name
    // ) @class.property

    // (method_definition
    //   name: (property_identifier) @class.method.name
    // ) @class.method

    // (interface_declaration
    //   name: (type_identifier) @interface.name
    // ) @interface

    // (property_signature
    //   name: (property_identifier) @interface.property.name
    // ) @interface.property

    // (method_signature
    //   name: (property_identifier) @interface.method.name
    // ) @interface.method

    // (enum_declaration
    //   name: (identifier) @name @definition.enum)

    // (type_alias_declaration
    //   name: (type_identifier) @type.name
    //   value: (_) @type.value
    // ) @type`,
    //     );

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
            type: getNodeText(typeNode?.lastChild || typeNode), // Handles type_annotation nesting
          };
        });
    }

    for (const match of matches) {
      const captureName = match.captures[0]?.name; // e.g., "function", "class"
      const node = match.captures[0]?.node;

      if (captureName === "import") {
        const sourceCapture = match.captures.find(
          (c) => c.name === "import.source",
        );
        if (sourceCapture) {
          structure.imports.push({
            name: "", // Tree-sitter query doesn't easily provide named imports here, focusing on source file
            fileName: getNodeText(sourceCapture.node).replace(
              /^['"]|['"]$/g,
              "",
            ),
          });
        }
      } else if (captureName === "definition.function") {
        const nameNode = match.captures.find((c) => c.name === "name")?.node;
        // const paramsNode = match.captures.find(
        //   (c) => c.name === "function.parameters",
        // )?.node;
        // const returnTypeNode = match.captures.find(
        //   (c) => c.name === "function.returnType",
        // )?.node;
        // if (nameNode?.parent) {
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

        const paramsNode = functionNode?.childForFieldName("parameters");
        const returnTypeNode = functionNode?.childForFieldName("return_type");
        structure.functions.push({
          name: getNodeText(nameNode),
          parameters: getParameters(paramsNode),
          returnType: getNodeText(returnTypeNode?.lastChild || returnTypeNode), // Handles type_annotation nesting
        });
        // }
      } else if (captureName === "definition.class") {
        const classNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        // Find or create class entry
        let classInfo = structure.classes.find(
          (c) => c.name === getNodeText(classNameNode),
        );
        if (!classInfo) {
          classInfo = {
            name: getNodeText(classNameNode),
            methods: [],
            properties: [],
          };
          structure.classes.push(classInfo);
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
            const classInfo = structure.classes.find(
              (c) => c.name === className,
            );

            if (classInfo) {
              // Get the property type if available
              const typeNode = propNameNode.parent.childForFieldName("type");
              classInfo.properties.push({
                name: getNodeText(propNameNode),
                type: typeNode
                  ? getNodeText(typeNode.lastChild || typeNode)
                  : "any",
              });
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
            const classInfo = structure.classes.find(
              (c) => c.name === className,
            );

            if (classInfo) {
              const paramsNode =
                methodNameNode.parent.childForFieldName("parameters");
              const returnTypeNode =
                methodNameNode.parent.childForFieldName("return_type");

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
      } else if (captureName === "definition.interface") {
        const interfaceNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;

        // Find or create interface entry
        let interfaceInfo = structure.interfaces.find(
          (i) => i.name === getNodeText(interfaceNameNode),
        );
        if (!interfaceInfo) {
          interfaceInfo = {
            name: getNodeText(interfaceNameNode),
            methods: [],
            properties: [],
          };
          structure.interfaces.push(interfaceInfo);
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
            const interfaceInfo = structure.interfaces.find(
              (i) => i.name === interfaceName,
            );

            if (interfaceInfo) {
              // Get the property type if available
              const typeNode = propNameNode.parent.childForFieldName("type");
              interfaceInfo.properties.push({
                name: getNodeText(propNameNode),
                type: typeNode
                  ? getNodeText(typeNode.lastChild || typeNode)
                  : "any",
              });
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
            const interfaceInfo = structure.interfaces.find(
              (i) => i.name === interfaceName,
            );

            if (interfaceInfo) {
              const paramsNode =
                methodNameNode.parent.childForFieldName("parameters");
              const returnTypeNode =
                methodNameNode.parent.childForFieldName("return_type") ??
                methodNameNode.parent.childForFieldName("type");

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
      } else if (captureName === "definition.type") {
        const typeNameNode = match.captures.find(
          (c) => c.name === "name",
        )?.node;
        const typeValueNode = match.captures.find(
          (c) => c.name === "value",
        )?.node;
        structure.types.push({
          name: getNodeText(typeNameNode),
          type: getNodeText(typeValueNode),
        });
      }
    }
    return structure;
  }
}
