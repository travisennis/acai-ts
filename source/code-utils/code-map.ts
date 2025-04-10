import { readFileSync } from "node:fs";
import {
  type Node,
  ScriptTarget,
  type SourceFile,
  type TypeNode,
  createSourceFile,
  forEachChild,
  isClassDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignature,
  isPropertyDeclaration,
  isPropertySignature,
  isTypeAliasDeclaration,
} from "typescript";

export interface FileStructure {
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
}

export interface ImportInfo {
  name: string;
  fileName: string;
}

export interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
}

export interface ParameterInfo {
  name: string;
  type: string;
}

export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
}

export interface PropertyInfo {
  name: string;
  type: string;
}

export interface InterfaceInfo {
  name: string;
  properties: PropertyInfo[];
  methods: FunctionInfo[];
}

export interface TypeInfo {
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
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = createSourceFile(
      filePath,
      sourceText,
      ScriptTarget.Latest,
      true,
    );
    const structure = CodeMap.analyzeSourceFile(sourceFile);
    return new CodeMap(structure);
  }

  static fromSource(source: string, fileName = "source.ts"): CodeMap {
    const sourceFile = createSourceFile(
      fileName,
      source,
      ScriptTarget.Latest,
      true,
    );
    const structure = CodeMap.analyzeSourceFile(sourceFile);
    return new CodeMap(structure);
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

  private static analyzeSourceFile(sourceFile: SourceFile): FileStructure {
    const structure: FileStructure = {
      imports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
    };

    function getTypeAsString(type: TypeNode | undefined): string {
      if (!type) {
        return "any";
      }
      return type.getText(sourceFile);
    }

    function visitNode(node: Node): void {
      if (isFunctionDeclaration(node)) {
        const functionInfo: FunctionInfo = {
          name: node.name ? node.name.getText(sourceFile) : "anonymous",
          parameters: node.parameters.map((param) => ({
            name: param.name.getText(sourceFile),
            type: getTypeAsString(param.type),
          })),
          returnType: getTypeAsString(node.type),
        };
        structure.functions.push(functionInfo);
      } else if (isClassDeclaration(node)) {
        const classInfo: ClassInfo = {
          name: node.name ? node.name.getText(sourceFile) : "anonymous",
          methods: [],
          properties: [],
        };

        for (const member of node.members) {
          if (isMethodDeclaration(member)) {
            classInfo.methods.push({
              name: member.name.getText(sourceFile),
              parameters: member.parameters.map((param) => ({
                name: param.name.getText(sourceFile),
                type: getTypeAsString(param.type),
              })),
              returnType: getTypeAsString(member.type),
            });
          } else if (isPropertyDeclaration(member)) {
            classInfo.properties.push({
              name: member.name.getText(sourceFile),
              type: getTypeAsString(member.type),
            });
          }
        }

        structure.classes.push(classInfo);
      } else if (isInterfaceDeclaration(node)) {
        const interfaceInfo: InterfaceInfo = {
          name: node.name.getText(sourceFile),
          properties: [],
          methods: [],
        };

        for (const member of node.members) {
          if (isMethodSignature(member)) {
            interfaceInfo.methods.push({
              name: member.name.getText(sourceFile),
              parameters: member.parameters.map((param) => ({
                name: param.name.getText(sourceFile),
                type: getTypeAsString(param.type),
              })),
              returnType: getTypeAsString(member.type),
            });
          } else if (isPropertySignature(member)) {
            interfaceInfo.properties.push({
              name: member.name.getText(sourceFile),
              type: getTypeAsString(member.type),
            });
          }
        }

        structure.interfaces.push(interfaceInfo);
      } else if (isTypeAliasDeclaration(node)) {
        structure.types.push({
          name: node.name.getText(sourceFile),
          type: node.type.getText(sourceFile),
        });
      } else if (isImportDeclaration(node)) {
        const importDecl = node;
        const moduleSpecifier = importDecl.moduleSpecifier
          .getText(sourceFile)
          .replace(/^['"]|['"]$/g, "");
        structure.imports.push({
          name: "",
          fileName: moduleSpecifier,
        });
      }

      forEachChild(node, visitNode);
    }

    visitNode(sourceFile);
    return structure;
  }
}
