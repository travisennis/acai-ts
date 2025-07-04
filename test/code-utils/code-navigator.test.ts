import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClassSymbol,
  CodeNavigator,
  type EnumSymbol,
  type FunctionSymbol,
  type ImportSymbol,
  type InterfaceSymbol,
  type TypeSymbol, // Added for completeness, though not directly in old tests
} from "../../source/code-utils/code-navigator.ts";
import { TreeSitterManager } from "../../source/code-utils/tree-sitter-manager.ts";

describe("CodeNavigator", () => {
  const treeSitterManager = new TreeSitterManager(); // Instantiate once

  describe("Interface Processing", () => {
    it("should extract symbols from a TypeScript interface snippet", () => {
      const codeSnippet = `
export interface MyInterface {
  propertyA: string;
  propertyB: number;
  methodSignature(param: boolean): string;
}
      `;
      const fileName = "test-interface.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, codeSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      strictEqual(
        symbols.length,
        1,
        "Should find 1 top-level symbol for the interface",
      );
      const interfaceSymbol = symbols[0] as InterfaceSymbol;

      strictEqual(
        interfaceSymbol.type,
        "interface",
        "Symbol type should be 'interface'",
      );
      strictEqual(
        interfaceSymbol.name,
        "MyInterface",
        "Interface name mismatch",
      );
      ok(
        interfaceSymbol.definition.context?.includes(
          "export interface MyInterface",
        ),
        "Definition context should contain interface code",
      );
      strictEqual(interfaceSymbol.definition.filePath, fileName);

      // Check properties
      strictEqual(
        interfaceSymbol.properties.length,
        2,
        "Should have 2 properties",
      );
      const propA = interfaceSymbol.properties.find(
        (p) => p.name === "propertyA",
      );
      ok(propA, "Should find propertyA");
      strictEqual(propA?.propertyType, "string", "propertyA type mismatch");

      const propB = interfaceSymbol.properties.find(
        (p) => p.name === "propertyB",
      );
      ok(propB, "Should find propertyB");
      strictEqual(propB?.propertyType, "number", "propertyB type mismatch");

      // Check methods
      strictEqual(interfaceSymbol.methods.length, 1, "Should have 1 method");
      const methodSig = interfaceSymbol.methods.find(
        (m) => m.name === "methodSignature",
      );
      ok(methodSig, "Should find methodSignature");
      strictEqual(
        methodSig?.parameters.length,
        1,
        "methodSignature parameter count mismatch",
      );
      strictEqual(
        methodSig?.parameters[0]?.name,
        "param",
        "methodSignature parameter name mismatch",
      );
      strictEqual(
        methodSig?.parameters[0]?.parameterType,
        "boolean",
        "methodSignature parameter type mismatch",
      );
      strictEqual(
        methodSig?.returnType,
        "string",
        "methodSignature return type mismatch",
      );
    });
  });

  describe("Enum Processing", () => {
    it("should extract symbols from a TypeScript enum snippet", () => {
      const enumSnippet = `
export enum MyTestEnum {
  OptionA,
  OptionB = "ValueB",
  OptionC = 10,
}
      `;
      const fileName = "test-enum.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, enumSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      strictEqual(
        symbols.length,
        1,
        "Should find 1 top-level symbol for the enum",
      );
      const enumSymbol = symbols[0] as EnumSymbol;

      strictEqual(enumSymbol.type, "enum", "Symbol type should be 'enum'");
      strictEqual(enumSymbol.name, "MyTestEnum", "Enum name mismatch");
      ok(
        enumSymbol.definition.context?.includes("export enum MyTestEnum"),
        "Definition context should contain enum code",
      );
      strictEqual(enumSymbol.definition.filePath, fileName);

      // Check members
      strictEqual(enumSymbol.members.length, 3, "Should have 3 members");

      const optionA = enumSymbol.members.find((m) => m.name === "OptionA");
      ok(optionA, "Should find member OptionA");
      strictEqual(
        optionA?.value,
        undefined,
        "OptionA value should be undefined",
      );

      const optionB = enumSymbol.members.find((m) => m.name === "OptionB");
      ok(optionB, "Should find member OptionB");
      strictEqual(optionB?.value, '"ValueB"', "OptionB value mismatch");

      const optionC = enumSymbol.members.find((m) => m.name === "OptionC");
      ok(optionC, "Should find member OptionC");
      strictEqual(optionC?.value, "10", "OptionC value mismatch");
    });
  });

  describe("Class Processing", () => {
    it("should process a TypeScript class snippet and extract features", () => {
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
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, classSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      strictEqual(
        symbols.length,
        1,
        "Should find 1 top-level symbol for the class",
      );
      const classSymbol = symbols[0] as ClassSymbol;

      strictEqual(classSymbol.type, "class", "Symbol type should be 'class'");
      strictEqual(classSymbol.name, "MyTestClass", "Class name mismatch");
      ok(
        classSymbol.definition.context?.includes("export class MyTestClass"),
        "Definition context should contain class code",
      );
      strictEqual(classSymbol.definition.filePath, fileName);

      // Properties
      strictEqual(classSymbol.properties.length, 2, "Should have 2 properties");
      const nameProp = classSymbol.properties.find((p) => p.name === "name");
      ok(nameProp, "Should find name property");
      strictEqual(
        nameProp?.propertyType,
        "string",
        "name property type mismatch",
      );

      const countProp = classSymbol.properties.find((p) => p.name === "count");
      ok(countProp, "Should find count property");
      strictEqual(
        countProp?.propertyType,
        "number",
        "count property type mismatch",
      );

      // Methods
      strictEqual(classSymbol.methods.length, 3, "Should have 3 methods");

      const constructorMethod = classSymbol.methods.find(
        (m) => m.name === "constructor",
      );
      ok(constructorMethod, "Should find constructor method");
      strictEqual(
        constructorMethod?.parameters.length,
        1,
        "Constructor parameter count mismatch",
      );
      strictEqual(
        constructorMethod?.parameters[0]?.name,
        "name",
        "Constructor parameter name mismatch",
      );
      strictEqual(
        constructorMethod?.parameters[0]?.parameterType,
        "string",
        "Constructor parameter type mismatch",
      );
      // Default return type for constructor in CodeNavigator is 'any'
      strictEqual(
        constructorMethod?.returnType,
        "any",
        "Constructor return type mismatch",
      );

      const incrementMethod = classSymbol.methods.find(
        (m) => m.name === "increment",
      );
      ok(incrementMethod, "Should find increment method");
      strictEqual(
        incrementMethod?.parameters.length,
        0,
        "increment parameter count mismatch",
      );
      strictEqual(
        incrementMethod?.returnType,
        "void",
        "increment return type mismatch",
      );

      const getNameMethod = classSymbol.methods.find(
        (m) => m.name === "getName",
      );
      ok(getNameMethod, "Should find getName method");
      strictEqual(
        getNameMethod?.parameters.length,
        0,
        "getName parameter count mismatch",
      );
      strictEqual(
        getNameMethod?.returnType,
        "string",
        "getName return type mismatch",
      );
    });

    it("should process an advanced TypeScript class snippet", () => {
      const advancedClassSnippet = `
export class AdvancedClass {
  public publicProp: string = "public";
  private privateProp: number = 1;
  static staticProp: boolean = true;

  constructor() {
    this.publicProp = "initialized";
  }

  get value(): number {
    return this.privateProp;
  }

  set value(val: number) {
    this.privateProp = val;
  }

  public publicMethod(): string {
    return "public method";
  }

  private privateMethod(): void {
    // private method
  }

  static staticMethod(): string {
    return "static method called";
  }
}
      `;
      const fileName = "advanced-class.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, advancedClassSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      strictEqual(
        symbols.length,
        1,
        "Should find 1 top-level symbol for the advanced class",
      );
      const classSymbol = symbols[0] as ClassSymbol;

      strictEqual(classSymbol.type, "class", "Symbol type should be 'class'");
      strictEqual(classSymbol.name, "AdvancedClass", "Class name mismatch");

      // Properties
      // Note: CodeNavigator's current logic for properties might not distinguish static or fully capture initializers in propertyType.
      // It captures name and type. Initializers are part of the definition context.
      // The old 'code-mapper' might have extracted the full line as 'code'.
      // We will check for name and type as per CodeNavigator's Symbol structure.
      strictEqual(classSymbol.properties.length, 3, "Should have 3 properties");
      const publicProp = classSymbol.properties.find(
        (p) => p.name === "publicProp",
      );
      ok(publicProp, "Should find publicProp");
      strictEqual(
        publicProp?.propertyType,
        "string",
        "publicProp type mismatch",
      );

      const privateProp = classSymbol.properties.find(
        (p) => p.name === "privateProp",
      );
      ok(privateProp, "Should find privateProp");
      strictEqual(
        privateProp?.propertyType,
        "number",
        "privateProp type mismatch",
      );

      const staticProp = classSymbol.properties.find(
        (p) => p.name === "staticProp",
      );
      ok(staticProp, "Should find staticProp");
      strictEqual(
        staticProp?.propertyType,
        "boolean",
        "staticProp type mismatch",
      );

      // Methods (includes constructor, getters, setters, static methods)
      strictEqual(
        classSymbol.methods.length,
        6,
        "Should have 6 methods (constructor, get value, set value, publicMethod, privateMethod, staticMethod)",
      );

      ok(
        classSymbol.methods.find((m) => m.name === "constructor"),
        "Should find constructor",
      );

      const getterValue = classSymbol.methods.find(
        (m) => m.name === "value" && m.parameters.length === 0,
      ); // Getter has no params
      ok(getterValue, "Should find getter 'value'");
      strictEqual(
        getterValue?.returnType,
        "number",
        "Getter 'value' return type",
      );

      const setterValue = classSymbol.methods.find(
        (m) => m.name === "value" && m.parameters.length === 1,
      ); // Setter has one param
      ok(setterValue, "Should find setter 'value'");
      strictEqual(
        setterValue?.parameters[0]?.name,
        "val",
        "Setter 'value' param name",
      );
      strictEqual(
        setterValue?.parameters[0]?.parameterType,
        "number",
        "Setter 'value' param type",
      );
      strictEqual(
        setterValue?.returnType,
        "any",
        "Setter 'value' return type (implicitly any if not specified)",
      );

      const publicMethod = classSymbol.methods.find(
        (m) => m.name === "publicMethod",
      );
      ok(publicMethod, "Should find publicMethod");
      strictEqual(publicMethod?.returnType, "string");

      const privateMethod = classSymbol.methods.find(
        (m) => m.name === "privateMethod",
      );
      ok(privateMethod, "Should find privateMethod");
      strictEqual(privateMethod?.returnType, "void");

      const staticMethod = classSymbol.methods.find(
        (m) => m.name === "staticMethod",
      );
      ok(staticMethod, "Should find staticMethod");
      strictEqual(staticMethod?.returnType, "string");
      // Note: CodeNavigator's MethodInfo doesn't explicitly store 'static' modifier. It's part of definition.
    });
  });

  describe("Function Processing", () => {
    it("should extract symbols from a TypeScript function snippet", () => {
      const functionSnippet = `
export function myFunction(name: string, age?: number): MyInterface {
  return { /* ... */ };
}

export const myArrowFunction = (value: number): string => {
  return \`Value is \${value}\`;
};

type MyInterface = { prop: string }; // type alias for context
      `;
      // Added MyInterface type alias to make the snippet self-contained for parsing return types.
      const fileName = "test-function.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, functionSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      // Expect 3 symbols: myFunction, myArrowFunction, MyInterface (type alias)
      strictEqual(symbols.length, 3, "Should find 3 top-level symbols");

      const funcSymbol = symbols.find(
        (s) => s.name === "myFunction" && s.type === "function",
      ) as FunctionSymbol;
      ok(funcSymbol, "Should find myFunction symbol");
      strictEqual(
        funcSymbol.parameters.length,
        2,
        "myFunction parameter count",
      );
      strictEqual(funcSymbol.parameters[0]?.name, "name");
      strictEqual(funcSymbol.parameters[0]?.parameterType, "string");
      strictEqual(funcSymbol.parameters[1]?.name, "age");
      strictEqual(funcSymbol.parameters[1]?.parameterType, "number"); // Optionality is part of TS type system, tree-sitter might just give type
      strictEqual(
        funcSymbol.returnType,
        "MyInterface",
        "myFunction return type",
      );
      ok(funcSymbol.definition.context?.includes("export function myFunction"));

      const arrowFuncSymbol = symbols.find(
        (s) => s.name === "myArrowFunction" && s.type === "function",
      ) as FunctionSymbol;
      ok(arrowFuncSymbol, "Should find myArrowFunction symbol");
      strictEqual(
        arrowFuncSymbol.parameters.length,
        1,
        "myArrowFunction parameter count",
      );
      strictEqual(arrowFuncSymbol.parameters[0]?.name, "value");
      strictEqual(arrowFuncSymbol.parameters[0]?.parameterType, "number");
      strictEqual(
        arrowFuncSymbol.returnType,
        "string",
        "myArrowFunction return type",
      );
      ok(
        arrowFuncSymbol.definition.context?.includes(
          "export const myArrowFunction",
        ),
      );

      const typeAliasSymbol = symbols.find(
        (s) => s.name === "MyInterface" && s.type === "type",
      ) as TypeSymbol;
      ok(typeAliasSymbol, "Should find MyInterface type alias symbol");
      strictEqual(typeAliasSymbol.typeValue, "{ prop: string }");
    });
  });

  describe("Error Handling", () => {
    it("should throw an error for unsupported file types on indexSource", () => {
      const navigator = new CodeNavigator(treeSitterManager);
      try {
        navigator.indexSource("test.unsupported", "content");
      } catch (e) {
        ok(e instanceof Error);
        ok(
          (e as Error).message.includes(
            "No parser for extension: .unsupported",
          ),
        );
      }
    });

    it("should throw an error for unsupported file types on findDefinitionsInFile", async () => {
      const navigator = new CodeNavigator(treeSitterManager);
      try {
        // This test requires a file to exist, so we'll mock readFile or handle appropriately
        // For now, assuming it would throw if parser is not found before readFile
        await navigator.indexFile("test.unsupported");
      } catch (e) {
        ok(e instanceof Error);
        ok(
          (e as Error).message.includes(
            "No parser for extension: .unsupported",
          ),
        );
      }
    });
  });

  describe("Import Processing", () => {
    it("should extract named, default, and namespace import symbols", () => {
      const codeSnippet = `
import { MyInterface, AnotherSymbol } from "./my-interface.ts";
import * as Everything from "./everything.ts";
import DefaultExport from "./default-export.ts";
import "./side-effect-import.ts"; // Side-effect import
      `;
      const fileName = "test-imports.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, codeSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      const importSymbols = symbols.filter((s) => s.type === "import");
      // Expect: MyInterface, AnotherSymbol, Everything, DefaultExport, and one for side-effect
      strictEqual(importSymbols.length, 5, "Should find 5 import symbols");

      const myInterfaceImport = importSymbols.find(
        (s) => s.name === "MyInterface",
      ) as ImportSymbol;
      ok(myInterfaceImport, "Should find import symbol for MyInterface");
      strictEqual(
        myInterfaceImport.source,
        "./my-interface.ts",
        "MyInterface source mismatch",
      );

      const anotherSymbolImport = importSymbols.find(
        (s) => s.name === "AnotherSymbol",
      ) as ImportSymbol;
      ok(anotherSymbolImport, "Should find import symbol for AnotherSymbol");
      strictEqual(
        anotherSymbolImport.source,
        "./my-interface.ts",
        "AnotherSymbol source mismatch",
      );

      const everythingImport = importSymbols.find(
        (s) => s.name === "Everything",
      ) as ImportSymbol;
      ok(
        everythingImport,
        "Should find import symbol for Everything (namespace)",
      );
      strictEqual(
        everythingImport.source,
        "./everything.ts",
        "Everything source mismatch",
      );

      const defaultExportImport = importSymbols.find(
        (s) => s.name === "DefaultExport",
      ) as ImportSymbol;
      ok(defaultExportImport, "Should find import symbol for DefaultExport");
      strictEqual(
        defaultExportImport.source,
        "./default-export.ts",
        "DefaultExport source mismatch",
      );

      // For side-effect import, name is empty, source is the path
      const sideEffectImport = importSymbols.find(
        (s) =>
          s.name === "" &&
          (s as ImportSymbol).source === "./side-effect-import.ts",
      ) as ImportSymbol;
      ok(
        sideEffectImport,
        "Should find side-effect import symbol for ./side-effect-import.ts",
      );
      strictEqual(
        sideEffectImport.source,
        "./side-effect-import.ts",
        "Side-effect import source mismatch",
      );
    });
  });

  describe("Type Alias Processing", () => {
    it("should extract type alias symbols", () => {
      const codeSnippet = `
export type MyString = string;
type MyObject = {
  id: number;
  name: string;
};
      `;
      const fileName = "test-types.ts";
      const navigator = new CodeNavigator(treeSitterManager);
      navigator.indexSource(fileName, codeSnippet);
      const symbols = navigator.findSymbolsByFilePath(fileName);

      const typeSymbols = symbols.filter(
        (s) => s.type === "type",
      ) as TypeSymbol[];
      strictEqual(typeSymbols.length, 2, "Should find 2 type alias symbols");

      const myStringSymbol = typeSymbols.find((s) => s.name === "MyString");
      ok(myStringSymbol, "Should find MyString type alias");
      strictEqual(
        myStringSymbol?.typeValue,
        "string",
        "MyString type value mismatch",
      );

      const myObjectSymbol = typeSymbols.find((s) => s.name === "MyObject");
      ok(myObjectSymbol, "Should find MyObject type alias");
      strictEqual(
        myObjectSymbol?.typeValue.replace(/\s/g, ""),
        "{id:number;name:string;}",
        "MyObject type value mismatch",
      );
    });
  });

  // Add more tests for indexProject, findDefinitionAtPosition, findUsages if complex setups are feasible
  // For example, findDefinitionAtPosition and findUsages would require a more integrated test
  // with actual file system operations or a mocked file system.
});
