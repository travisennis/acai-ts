import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import { CodeMap } from "../../source/code-utils/code-map.ts";

describe("CodeMap", () => {
  it("should generate XML CodeMap for a TypeScript interface snippet", () => {
    const codeSnippet = `
export interface MyInterface {
  propertyA: string;
  propertyB: number;
  methodSignature(param: boolean): string;
}
    `;
    const fileName = "test-interface.ts";

    // The TreeSitterManager and its parsers are instantiated internally by fromSource
    const codeMap = CodeMap.fromSource(codeSnippet, fileName);
    const xmlOutput = codeMap.format("xml", fileName);

    ok(xmlOutput.length > 0, "XML output should not be empty");
    strictEqual(
      xmlOutput.includes("<codeMap>"),
      true,
      "Should contain <codeMap> tag",
    );
    strictEqual(
      xmlOutput.includes(`<filePath>${fileName}</filePath>`),
      true,
      `Should contain <filePath>${fileName}</filePath>`,
    );
    strictEqual(
      xmlOutput.includes("Interfaces:"),
      true,
      "Should contain Interfaces section",
    );
    strictEqual(
      xmlOutput.includes("MyInterface"),
      true,
      "Should contain interface name MyInterface",
    );
    strictEqual(
      xmlOutput.includes("Property: propertyA: string"),
      true,
      "Should contain propertyA",
    );
    strictEqual(
      xmlOutput.includes("Property: propertyB: number"),
      true,
      "Should contain propertyB",
    );
    strictEqual(
      xmlOutput.includes("Method: methodSignature(param: boolean): string"),
      true,
      "Should contain methodSignature",
    );
    strictEqual(
      xmlOutput.includes("</codeMap>"),
      true,
      "Should contain </codeMap> tag",
    );
  });

  it("should generate XML CodeMap for a TypeScript enum snippet", () => {
    const enumSnippet = `
export enum MyTestEnum {
  OptionA,
  OptionB = "ValueB",
  OptionC = 10,
}
    `;
    const fileName = "test-enum.ts";

    const codeMap = CodeMap.fromSource(enumSnippet, fileName);
    const xmlOutput = codeMap.format("xml", fileName);
    // console.info('Enum XML Output:\n', xmlOutput); // For debugging

    ok(xmlOutput.length > 0, "XML output should not be empty");
    strictEqual(
      xmlOutput.includes("<codeMap>"),
      true,
      "Should contain <codeMap> tag",
    );
    strictEqual(
      xmlOutput.includes(`<filePath>${fileName}</filePath>`),
      true,
      `Should contain <filePath>${fileName}</filePath>`,
    );
    strictEqual(
      xmlOutput.includes("</codeMap>"),
      true,
      "Should contain </codeMap> tag",
    );

    // CodeMap.analyzeSourceTree does not have specific logic to create a structure.enums section.
    // So, we don't expect to find "MyTestEnum" or its members in a structured way in the map content for now.
    // The <map>...</map> section might be empty or only contain imports if any were present.
    const mapContent = xmlOutput.substring(
      xmlOutput.indexOf("<map>\n") + "\n<map>".length,
      xmlOutput.indexOf("\n</map>"),
    );
    // Check if the map content is empty or only newlines/whitespace, effectively not listing the enum.
    strictEqual(
      mapContent.trim(),
      "",
      "Map content should be empty for a standalone enum as CodeMap does not explicitly process enums into its structure",
    );
  });

  it("should generate XML CodeMap for a TypeScript class snippet", () => {
    const classSnippet = `
export class MyTestClass {
  public name: string;
  private count: number;

  constructor(name: string) {
    this.name = name;
    this.count = 0;
  }

  public increment(): void {
    this.count++;
  }

  public getName(): string {
    return this.name;
  }
}
    `;
    const fileName = "test-class.ts";

    const codeMap = CodeMap.fromSource(classSnippet, fileName);
    const xmlOutput = codeMap.format("xml", fileName);
    // console.info('Class XML Output:\n', xmlOutput); // For debugging if needed

    ok(xmlOutput.length > 0, "XML output should not be empty");
    strictEqual(
      xmlOutput.includes("<codeMap>"),
      true,
      "Should contain <codeMap> tag",
    );
    strictEqual(
      xmlOutput.includes(`<filePath>${fileName}</filePath>`),
      true,
      `Should contain <filePath>${fileName}</filePath>`,
    );
    strictEqual(
      xmlOutput.includes("Classes:"),
      true,
      "Should contain Classes section",
    );
    strictEqual(
      xmlOutput.includes("MyTestClass"),
      true,
      "Should contain class name MyTestClass",
    );

    // Check for properties - CodeMap.analyzeSourceTree logic for properties:
    // It looks for "definition.property" captures. The SCM ties this to `public_field_definition`.
    // If CodeMap's logic or the query match is strict to public, 'count' might be missing.
    strictEqual(
      xmlOutput.includes("Property: name: string"),
      true,
      "Should contain public property name",
    );

    // Check for methods
    // Constructor return type might be 'any' if not explicitly void or other.
    // Parameter parsing in CodeMap: getParameters -> getNodeText(typeNode?.lastChild || typeNode)
    strictEqual(
      xmlOutput.includes("Method: constructor(name: string): any"),
      true,
      "Should contain constructor method - check return type if fails",
    );
    strictEqual(
      xmlOutput.includes("Method: increment(): void"),
      true,
      "Should contain increment method",
    );
    strictEqual(
      xmlOutput.includes("Method: getName(): string"),
      true,
      "Should contain getName method",
    );
    strictEqual(
      xmlOutput.includes("</codeMap>"),
      true,
      "Should contain </codeMap> tag",
    );

    // Assertion for the private 'count' property depends on whether CodeMap picks it up.
    // If the SCM query for @definition.property (public_field_definition) also matches private fields
    // for CodeMap's analyzer, then it should be present.
    const includesCountProperty = xmlOutput.includes("Property: count: number");
    // For now, let's assume it might not be there due to public_field_definition in SCM
    // If the test fails here, and 'count' IS present, this assertion needs to change.
    // Based on TreeSitterSymbolExtractor behavior, it WAS picked up. Let's assume CodeMap also picks it up.
    strictEqual(
      includesCountProperty,
      true,
      "Should contain private property count",
    );
  });

  it("should generate XML CodeMap for a TypeScript function snippet", () => {
    const functionSnippet = `
export function myFunction(name: string, age?: number): MyInterface {
  return {
    propertyA: \`Name: \${name}\`,
    propertyB: age || 30,
    methodSignature: (p) => (p ? "Yes" : "No"),
  };
}

export const myArrowFunction = (value: number): string => {
  return \`Value is \${value}\`;
};
    `;
    const fileName = "test-function.ts";

    const codeMap = CodeMap.fromSource(functionSnippet, fileName);
    const xmlOutput = codeMap.format("xml", fileName);
    // console.info('Function XML Output:\n', xmlOutput); // For debugging

    ok(xmlOutput.length > 0, "XML output should not be empty");
    strictEqual(
      xmlOutput.includes("<codeMap>"),
      true,
      "Should contain <codeMap> tag",
    );
    strictEqual(
      xmlOutput.includes(`<filePath>${fileName}</filePath>`),
      true,
      `Should contain <filePath>${fileName}</filePath>`,
    );
    strictEqual(
      xmlOutput.includes("Functions:"),
      true,
      "Should contain Functions section",
    );
    strictEqual(
      xmlOutput.includes("myFunction(name: string, age: number): MyInterface"),
      true,
      "Should contain myFunction signature",
    );
    strictEqual(
      xmlOutput.includes("myArrowFunction(value: number): string"),
      true,
      "Should contain myArrowFunction signature",
    );
    strictEqual(
      xmlOutput.includes("</codeMap>"),
      true,
      "Should contain </codeMap> tag",
    );
  });
});
