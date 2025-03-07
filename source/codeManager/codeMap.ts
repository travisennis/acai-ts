import {
  createSourceFile,
  ScriptTarget,
  type TypeNode,
  type Node,
  isFunctionDeclaration,
  isClassDeclaration,
  isMethodDeclaration,
  isPropertyDeclaration,
  isInterfaceDeclaration,
  isMethodSignature,
  isPropertySignature,
  isTypeAliasDeclaration,
  forEachChild,
} from "typescript";
import { readFileSync } from "node:fs";

interface FileStructure {
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
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

export function analyzeTypeScriptFile(filePath: string): FileStructure {
  // Read and parse the source file
  const sourceFile = createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ScriptTarget.Latest,
    true,
  );

  const structure: FileStructure = {
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

  function visitNode(node: Node) {
    if (isFunctionDeclaration(node)) {
      const functionInfo: FunctionInfo = {
        name: node.name?.getText(sourceFile) || "anonymous",
        parameters: node.parameters.map((param) => ({
          name: param.name.getText(sourceFile),
          type: getTypeAsString(param.type),
        })),
        returnType: getTypeAsString(node.type),
      };
      structure.functions.push(functionInfo);
    } else if (isClassDeclaration(node)) {
      const classInfo: ClassInfo = {
        name: node.name?.getText(sourceFile) || "anonymous",
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
    }

    forEachChild(node, visitNode);
  }

  visitNode(sourceFile);
  return structure;
}

type FormatType = "xml" | "markdown" | "bracket";

export function outputFileStructure(filePath: string, format?: FormatType) {
  const structure = analyzeTypeScriptFile(filePath);

  let output = "";
  switch (format) {
    case "xml": {
      output += `<codeMap>\n<filePath>${filePath}</filePath>\n<map>\n`;
      break;
    }
    case "markdown": {
      output += `## CodeMap\nFilePath: ${filePath}\n\n\`\`\`\n`;
      break;
    }
    case "bracket": {
      output += `[code map ${filePath} begin]\n\n`;
      break;
    }
    default: {
      output += `<codeMap>\n<filePath>${filePath}</filePath>\n<map>\n`;
    }
  }

  if (structure.functions.length > 0) {
    output += "Functions:\n";
    for (const func of structure.functions) {
      output += `  ${func.name}(${func.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${func.returnType}\n`;
    }
    output += "\n\n";
  }

  if (structure.classes.length > 0) {
    output += "Classes:\n";
    for (const cls of structure.classes) {
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

  if (structure.interfaces.length > 0) {
    output += "Interfaces:\n";
    for (const intf of structure.interfaces) {
      output += `  ${intf.name}\n`;
      for (const prop of intf.properties) {
        output += `    Property: ${prop.name}: ${prop.type}\n`;
      }
      for (const method of intf.methods) {
        output += `    Method: ${method.name}(${method.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${method.returnType}\n`;
      }
    }
    output += "\n\n";

    if (structure.types.length > 0) {
      output += "Type Aliases:\n";
      for (const type of structure.types) {
        output += `  ${type.name} = ${type.type}\n`;
      }
    }
  }
  switch (format) {
    case "xml": {
      output += "</map>\n</codeMap>\n";
      break;
    }
    case "markdown": {
      output += "\n```\n\n";
      break;
    }
    case "bracket": {
      output += `[code map ${filePath} end]\n\n`;
      break;
    }
    default: {
      output += "</map>\n</codeMap>\n";
    }
  }
  return output;
}
