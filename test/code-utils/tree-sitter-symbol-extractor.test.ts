import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert/strict";
import { TreeSitterManager } from "../../source/code-utils/tree-sitter-manager.ts";
import { TreeSitterSymbolExtractor } from "../../source/code-utils/tree-sitter-symbol-extractor.ts";

describe("TreeSitterSymbolExtractor", () => {
  it("should extract symbols from a TypeScript interface", async () => {
    const treeSitterManager = new TreeSitterManager();
    const extractor = new TreeSitterSymbolExtractor(treeSitterManager);

    const codeSnippet = `
export interface MyInterface {
  propertyA: string;
  propertyB: number;
  methodSignature(param: boolean): string;
}
    `;

    // Parsers are initialized in the TreeSitterManager constructor.
    const actualSymbols = await extractor.extractSymbols(".ts", codeSnippet);
    // Assertions based on the flat list structure observed.
    deepStrictEqual(
      actualSymbols.length,
      5,
      "Should find 5 symbols in total for the interface snippet",
    );

    const mainInterfaceSymbol = actualSymbols.find(
      (s) =>
        s.name === "MyInterface" &&
        s.type === "interface" &&
        s.code?.includes("propertyA"), // Differentiate from the name-only symbol
    );
    if (!mainInterfaceSymbol) {
      throw new Error("Main MyInterface symbol definition not found");
    }
    deepStrictEqual(
      mainInterfaceSymbol.name,
      "MyInterface",
      "Main interface symbol name mismatch",
    );
    deepStrictEqual(
      mainInterfaceSymbol.type,
      "interface",
      "Main interface symbol type mismatch",
    );

    const propertyASymbol = actualSymbols.find((s) => s.name === "propertyA");
    if (!propertyASymbol) {
      throw new Error("propertyA symbol not found");
    }
    deepStrictEqual(
      propertyASymbol.type,
      "interface.property",
      "propertyA type mismatch",
    );

    const propertyBSymbol = actualSymbols.find((s) => s.name === "propertyB");
    if (!propertyBSymbol) {
      throw new Error("propertyB symbol not found");
    }
    deepStrictEqual(
      propertyBSymbol.type,
      "interface.property",
      "propertyB type mismatch",
    );

    const methodSignatureSymbol = actualSymbols.find(
      (s) => s.name === "methodSignature",
    );
    if (!methodSignatureSymbol) {
      throw new Error("methodSignature symbol not found");
    }
    deepStrictEqual(
      methodSignatureSymbol.type,
      "interface.method",
      "methodSignature type mismatch",
    );
  });

  it("should extract symbols from a TypeScript enum", async () => {
    const treeSitterManager = new TreeSitterManager();
    const extractor = new TreeSitterSymbolExtractor(treeSitterManager);

    const enumSnippet = `
export enum MyTestEnum {
  OptionA,
  OptionB = \"ValueB\",
  OptionC = 10,
}
    `;

    const actualSymbols = await extractor.extractSymbols(".ts", enumSnippet);
    // console.info('Enum Symbols:', JSON.stringify(actualSymbols, null, 2)); // Debug if needed

    // Based on SCM `(enum_declaration name: (identifier) @name) @definition.enum`,
    // we expect 2 symbols: one for the name, one for the full definition.
    // Enum members are not explicitly captured by @definition tags in the current SCM.

    const enumDefSymbol = actualSymbols.find(
      (s) =>
        s.type === "enum" &&
        s.name === "MyTestEnum" &&
        s.code?.includes("OptionA"),
    );
    if (!enumDefSymbol) {
      throw new Error("MyTestEnum definition symbol not found");
    }

    const enumNameSymbol = actualSymbols.find(
      (s) =>
        s.type === "enum" && s.name === "MyTestEnum" && s.code === "MyTestEnum",
    );
    if (!enumNameSymbol) {
      throw new Error("MyTestEnum name symbol not found");
    }

    // Verify no unexpected symbols for enum members are present if SCM doesn't define them as top-level symbols
    const optionASymbol = actualSymbols.find((s) => s.name === "OptionA");
    deepStrictEqual(
      optionASymbol,
      undefined,
      "OptionA should not be a separate top-level symbol based on current SCM for enums",
    );

    deepStrictEqual(
      actualSymbols.length,
      2,
      "Expected 2 symbols for the enum snippet (definition and name)",
    );
  });

  it("should extract symbols from a TypeScript class", async () => {
    const treeSitterManager = new TreeSitterManager();
    const extractor = new TreeSitterSymbolExtractor(treeSitterManager);

    const codeSnippet = `
export class MyTestClass {
  public name: string;
  private count: number; // Tree-sitter might not capture private fields with @definition.property by default

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

    const actualSymbols = await extractor.extractSymbols(".ts", codeSnippet);

    // Expected symbols: MyTestClass (name), MyTestClass (def),
    // name (prop), count (prop), constructor (method), increment (method), getName (method)
    // Total = 7 symbols.

    const classDefSymbol = actualSymbols.find(
      (s) =>
        s.type === "class" &&
        s.name === "MyTestClass" &&
        s.code?.includes("public name: string"),
    );
    if (!classDefSymbol) {
      throw new Error("MyTestClass definition symbol not found");
    }

    const classNameSymbol = actualSymbols.find(
      (s) =>
        s.type === "class" &&
        s.name === "MyTestClass" &&
        s.code === "MyTestClass",
    );
    if (!classNameSymbol) {
      throw new Error("MyTestClass name symbol not found");
    }

    const namePropertySymbol = actualSymbols.find(
      (s) => s.type === "property" && s.name === "name",
    );
    if (!namePropertySymbol) {
      throw new Error("name property symbol not found");
    }
    deepStrictEqual(
      namePropertySymbol.code,
      "public name: string",
      "name property code mismatch",
    );

    const countPropertySymbol = actualSymbols.find(
      (s) => s.type === "property" && s.name === "count",
    );
    if (!countPropertySymbol) {
      throw new Error("count property symbol not found");
    }
    deepStrictEqual(
      countPropertySymbol.code,
      "private count: number",
      "count property code mismatch",
    );

    const constructorSymbol = actualSymbols.find(
      (s) => s.type === "method" && s.name === "constructor",
    );
    if (!constructorSymbol) {
      throw new Error("constructor method symbol not found");
    }

    const incrementMethodSymbol = actualSymbols.find(
      (s) => s.type === "method" && s.name === "increment",
    );
    if (!incrementMethodSymbol) {
      throw new Error("increment method symbol not found");
    }

    const getNameMethodSymbol = actualSymbols.find(
      (s) => s.type === "method" && s.name === "getName",
    );
    if (!getNameMethodSymbol) {
      throw new Error("getName method symbol not found");
    }

    deepStrictEqual(
      actualSymbols.length,
      7,
      "Expected 7 symbols for the class snippet",
    );
  });
});
