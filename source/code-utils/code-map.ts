import { CodeNavigator, type Symbol as CodeSymbol } from "./code-navigator.ts";
import { TreeSitterManager } from "./tree-sitter-manager.ts";

type FormatType = "xml" | "markdown" | "bracket";

export class CodeMap {
  private readonly symbols: CodeSymbol[];

  private constructor(symbols: CodeSymbol[]) {
    this.symbols = symbols;
  }

  static async fromFile(filePath: string): Promise<CodeMap> {
    const treeSitterManager = new TreeSitterManager();
    const navigator = new CodeNavigator(treeSitterManager);
    await navigator.indexFile(filePath);
    const symbols = navigator.findSymbolsByFilePath(filePath);
    return new CodeMap(symbols);
  }

  static fromSource(source: string, filePath = "source.ts"): CodeMap {
    const treeSitterManager = new TreeSitterManager();
    const navigator = new CodeNavigator(treeSitterManager);
    navigator.indexSource(filePath, source);
    const symbols = navigator.findSymbolsByFilePath(filePath);
    return new CodeMap(symbols);
  }

  getSymbols() {
    return this.symbols;
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

    const imports = this.symbols.filter((s) => s.type === "import");
    if (imports.length > 0) {
      output += "Imported files:\n";
      for (const relativeImport of imports) {
        output += `  ${relativeImport.source}\n`;
      }
      output += "\n";
    }

    const functions = this.symbols.filter((s) => s.type === "function");
    if (functions.length > 0) {
      output += "Functions:\n";
      for (const func of functions) {
        output += `  ${func.name}(${func.parameters.map((p) => `${p.name}: ${p.parameterType}`).join(", ")}): ${func.returnType}\n`;
      }
      output += "\n";
    }

    const classes = this.symbols.filter((s) => s.type === "class");
    if (classes.length > 0) {
      output += "Classes:\n";
      for (const cls of classes) {
        output += `  ${cls.name}\n`;
        for (const prop of cls.properties) {
          output += `    Property: ${prop.name}: ${prop.propertyType}\n`;
        }
        for (const method of cls.methods) {
          output += `    Method: ${method.name}(${method.parameters.map((p) => `${p.name}: ${p.parameterType}`).join(", ")}): ${method.returnType}\n`;
        }
      }
      output += "\n";
    }

    const interfaces = this.symbols.filter((s) => s.type === "interface");
    if (interfaces.length > 0) {
      output += "Interfaces:\n";
      for (const intf of interfaces) {
        output += `  ${intf.name}\n`;
        for (const prop of intf.properties) {
          output += `    Property: ${prop.name}: ${prop.propertyType}\n`;
        }
        for (const method of intf.methods) {
          output += `    Method: ${method.name}(${method.parameters.map((p) => `${p.name}: ${p.parameterType}`).join(", ")}): ${method.returnType}\n`;
        }
      }
      output += "\n";
    }

    const types = this.symbols.filter((s) => s.type === "type");
    if (types.length > 0) {
      output += "Type Aliases:\n";
      for (const type of types) {
        output += `  ${type.name} = ${type.typeValue}\n`;
      }
      output += "\n";
    }

    const enums = this.symbols.filter((s) => s.type === "enum");
    if (enums.length > 0) {
      output += "Enums:\n";
      for (const enm of enums) {
        output += `  ${enm.name}\n`;
        for (const member of enm.members) {
          output += `    Member: ${member.name}${member.value ? ` = ${member.value}` : ""}\n`;
        }
      }
      output += "\n";
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
}
