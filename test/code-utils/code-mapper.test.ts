import { describe, it, before, after } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  writeFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
  rmdirSync,
} from "node:fs";
import { join } from "node:path";
import { CodeMapper } from "../../source/code-utils/code-mapper.ts";
import { TreeSitterManager } from "../../source/code-utils/tree-sitter-manager.ts";

// Resolve __dirname for ES Modules
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

const tempTestDir = join(__dirname, "temp-for-mapper-tests");
const tempFileName = "test-snippet.ts";
const tempFilePath = join(tempTestDir, tempFileName);

describe("CodeMapper", () => {
  before(() => {
    if (!existsSync(tempTestDir)) {
      mkdirSync(tempTestDir, { recursive: true });
    }
  });

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
    writeFileSync(tempFilePath, classSnippet, "utf8"); // Overwrites the temp file with class snippet

    const treeSitterManager = new TreeSitterManager();
    const codeMapper = new CodeMapper(treeSitterManager);
    const features = codeMapper.processFile(tempFilePath);

    // console.info('Actual Class Features from CodeMapper:', JSON.stringify(features, null, 2)); // Debug line

    ok(Array.isArray(features), "Should return an array of features for class");
    // Expected 12 features: class (def+name), 2 props (def+name each), 3 methods (def+name each)
    deepStrictEqual(
      features.length,
      12,
      "Expected 12 features for the class snippet",
    );

    // Class definition (full block)
    const classDefFeature = features.find(
      (f) =>
        f.type === "class" &&
        f.name === "MyTestClass" &&
        f.code.startsWith("class MyTestClass") && // Definition code won't include export
        f.code.includes("public name: string"),
    );
    ok(classDefFeature, "Should find the main class definition feature");
    if (classDefFeature) {
      strictEqual(classDefFeature.filePath, tempFilePath);
      ok(
        classDefFeature.code.startsWith("class MyTestClass"),
        "Class def code should start correctly",
      );
    }

    // Class name capture
    const classNameFeature = features.find(
      (f) =>
        f.type === "class" &&
        f.name === "MyTestClass" &&
        f.code === "MyTestClass",
    );
    ok(classNameFeature, "Should find the class name feature");

    // Property: name
    const namePropFeature = features.find(
      (f) => f.type === "property" && f.name === "name",
    );
    ok(namePropFeature, "Should find name property feature");
    if (namePropFeature) {
      strictEqual(
        namePropFeature.code,
        "public name: string",
        "Code for name property should be its full signature",
      );
      strictEqual(namePropFeature.filePath, tempFilePath);
    }

    // Property: count (private)
    const countPropFeature = features.find(
      (f) => f.type === "property" && f.name === "count",
    );
    ok(countPropFeature, "Should find count property feature");
    if (countPropFeature) {
      strictEqual(
        countPropFeature.code,
        "private count: number",
        "Code for count property should be its full signature",
      );
      strictEqual(countPropFeature.filePath, tempFilePath);
    }

    // Method: constructor
    const constructorFeature = features.find(
      (f) => f.type === "method" && f.name === "constructor",
    );
    ok(constructorFeature, "Should find constructor feature");
    if (constructorFeature) {
      ok(
        constructorFeature.code.startsWith("constructor(name: string)"),
        "Code for constructor should be its full signature",
      );
      strictEqual(constructorFeature.filePath, tempFilePath);
    }

    // Method: increment
    const incrementFeature = features.find(
      (f) => f.type === "method" && f.name === "increment",
    );
    ok(incrementFeature, "Should find increment feature");
    if (incrementFeature) {
      strictEqual(
        incrementFeature.code,
        "public increment(): void {\n    this.count++;\n  }",
        "Code for increment method should be its full signature",
      );
      strictEqual(incrementFeature.filePath, tempFilePath);
    }

    // Method: getName
    const getNameFeature = features.find(
      (f) => f.type === "method" && f.name === "getName",
    );
    ok(getNameFeature, "Should find getName feature");
    if (getNameFeature) {
      strictEqual(
        getNameFeature.code,
        "public getName(): string {\n    return this.name;\n  }",
        "Code for getName method should be its full signature",
      );
      strictEqual(getNameFeature.filePath, tempFilePath);
    }
  });

  it("should process a TypeScript interface snippet and extract features", () => {
    const codeSnippet = `
export interface MyInterface {
  propertyA: string;
  propertyB: number;
  methodSignature(param: boolean): string;
}
    `;
    writeFileSync(tempFilePath, codeSnippet, "utf8");

    const treeSitterManager = new TreeSitterManager();
    const codeMapper = new CodeMapper(treeSitterManager);

    const features = codeMapper.processFile(tempFilePath);

    ok(Array.isArray(features), "Should return an array of features");

    // Expected 8 features: interface (def+name), 2 props (def+name each), 1 method (def+name)
    deepStrictEqual(
      features.length,
      8,
      "Expected 8 features for the interface snippet",
    );

    const interfaceDefinitionFeature = features.find(
      (f) =>
        f.type === "interface" &&
        f.name === "MyInterface" &&
        f.code.startsWith("interface MyInterface") && // Definition code won't include export
        f.code.includes("propertyA"), // Distinguishes the full definition
    );
    ok(
      interfaceDefinitionFeature,
      "Should find the main interface definition feature",
    );
    if (interfaceDefinitionFeature) {
      strictEqual(interfaceDefinitionFeature.name, "MyInterface");
      strictEqual(interfaceDefinitionFeature.filePath, tempFilePath);
      // Check that the code is the full interface block
      ok(
        interfaceDefinitionFeature.code.startsWith("interface MyInterface"),
        "Code should be the full interface block",
      );
      ok(
        interfaceDefinitionFeature.code.endsWith("}"),
        "Code should end with a closing brace",
      );
    }

    const interfaceNameFeature = features.find(
      (f) =>
        f.type === "interface" &&
        f.name === "MyInterface" &&
        f.code === "MyInterface", // Distinguishes the name capture
    );
    ok(interfaceNameFeature, "Should find the interface name feature");

    const propertyAFeature = features.find(
      (f) => f.type === "interface.property" && f.name === "propertyA",
    );
    ok(propertyAFeature, "Should find propertyA feature");
    if (propertyAFeature) {
      strictEqual(
        propertyAFeature.code,
        "propertyA: string",
        "Code for propertyA should be its full signature",
      );
      strictEqual(propertyAFeature.filePath, tempFilePath);
    }

    const propertyBFeature = features.find(
      (f) => f.type === "interface.property" && f.name === "propertyB",
    );
    ok(propertyBFeature, "Should find propertyB feature");
    if (propertyBFeature) {
      strictEqual(
        propertyBFeature.code,
        "propertyB: number",
        "Code for propertyB should be its full signature",
      );
      strictEqual(propertyBFeature.filePath, tempFilePath);
    }

    const methodSignatureFeature = features.find(
      (f) => f.type === "interface.method" && f.name === "methodSignature",
    );
    ok(methodSignatureFeature, "Should find methodSignature feature");
    if (methodSignatureFeature) {
      strictEqual(
        methodSignatureFeature.code,
        "methodSignature(param: boolean): string",
        "Code for methodSignature should be its full signature",
      );
      strictEqual(methodSignatureFeature.filePath, tempFilePath);
    }
  });

  it("should process a TypeScript enum snippet and extract features", () => {
    const enumSnippet = `
export enum MyTestEnum {
  OptionA,
  OptionB = "ValueB",
  OptionC = 10,
}
    `;
    writeFileSync(tempFilePath, enumSnippet, "utf8"); // Overwrite with enum snippet

    const treeSitterManager = new TreeSitterManager();
    const codeMapper = new CodeMapper(treeSitterManager);
    const features = codeMapper.processFile(tempFilePath);

    // console.info('Actual Enum Features from CodeMapper:', JSON.stringify(features, null, 2)); // Debug line

    ok(Array.isArray(features), "Should return an array of features for enum");
    // Expected 2 features: enum (def+name)
    deepStrictEqual(
      features.length,
      2,
      "Expected 2 features for the enum snippet",
    );

    // Enum definition (full block)
    const enumDefFeature = features.find(
      (f) =>
        f.type === "enum" &&
        f.name === "MyTestEnum" &&
        f.code.startsWith("enum MyTestEnum") && // Definition code won't include export
        f.code.includes("OptionA"),
    );
    ok(enumDefFeature, "Should find the main enum definition feature");
    if (enumDefFeature) {
      strictEqual(enumDefFeature.filePath, tempFilePath);
      ok(
        enumDefFeature.code.startsWith("enum MyTestEnum"),
        "Enum def code should start correctly",
      );
    }

    // Enum name capture
    const enumNameFeature = features.find(
      (f) =>
        f.type === "enum" && f.name === "MyTestEnum" && f.code === "MyTestEnum",
    );
    ok(enumNameFeature, "Should find the enum name feature");
  });

  after(() => {
    if (existsSync(tempFilePath)) {
      unlinkSync(tempFilePath);
    }
    // Attempt to remove the directory if it\'s empty
    // This might fail if other temp files are created by parallel tests or if not empty
    try {
      rmdirSync(tempTestDir);
    } catch (_e) {
      // console.warn(`Could not remove temp directory ${tempTestDir}: ${e.message}`);
    }
  });

  it("should process a TypeScript function snippet and extract features", () => {
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
    writeFileSync(tempFilePath, functionSnippet, "utf8");

    const treeSitterManager = new TreeSitterManager();
    const codeMapper = new CodeMapper(treeSitterManager);
    const features = codeMapper.processFile(tempFilePath);

    // console.info('Actual Function Features:', JSON.stringify(features, null, 2));

    ok(
      Array.isArray(features),
      "Should return an array of features for functions",
    );
    // Expected 2 features for \`myFunction\` (definition and name)
    // Expected 2 features for \`myArrowFunction\` (definition and name)
    deepStrictEqual(
      features.length,
      4,
      "Expected 4 features for the function snippet",
    );

    // myFunction definition
    const myFunctionDef = features.find(
      (f) =>
        f.type === "function" &&
        f.name === "myFunction" &&
        f.code.startsWith("function myFunction"), // Definition code won't include export
    );
    ok(myFunctionDef, "Should find myFunction definition feature");
    if (myFunctionDef) {
      strictEqual(myFunctionDef.filePath, tempFilePath);
    }

    // myFunction name
    const myFunctionName = features.find(
      (f) =>
        f.type === "function" &&
        f.name === "myFunction" &&
        f.code === "myFunction",
    );
    ok(myFunctionName, "Should find myFunction name feature");

    // myArrowFunction definition
    const myArrowFunctionDef = features.find(
      (f) =>
        f.type === "function" &&
        f.name === "myArrowFunction" &&
        f.code.startsWith("myArrowFunction ="), // code is from variable_declarator
    );
    ok(myArrowFunctionDef, "Should find myArrowFunction definition feature");
    if (myArrowFunctionDef) {
      strictEqual(myArrowFunctionDef.filePath, tempFilePath);
    }

    // myArrowFunction name
    const myArrowFunctionName = features.find(
      (f) =>
        f.type === "function" &&
        f.name === "myArrowFunction" &&
        f.code === "myArrowFunction",
    );
    ok(myArrowFunctionName, "Should find myArrowFunction name feature");
  });
});
