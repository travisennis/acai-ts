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
    // Expected 6 features: class def, 2 prop defs, 3 method defs
    deepStrictEqual(
      features.length,
      6,
      "Expected 6 features for the class snippet",
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
        `public increment(): void {
    this.count++;
  }`,
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
        `public getName(): string {
    return this.name;
  }`,
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

    // Expected 4 features: interface def, 2 prop defs, 1 method def
    deepStrictEqual(
      features.length,
      4,
      "Expected 4 features for the interface snippet",
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

    const propertyFeatureA = features.find(
      (f) => f.type === "interface.property" && f.name === "propertyA",
    );
    ok(propertyFeatureA, "Should find propertyA feature");
    if (propertyFeatureA) {
      strictEqual(
        propertyFeatureA.code,
        "propertyA: string",
        "Code for propertyA should be its full signature",
      );
      strictEqual(propertyFeatureA.filePath, tempFilePath);
    }

    const propertyFeatureB = features.find(
      (f) => f.type === "interface.property" && f.name === "propertyB",
    );
    ok(propertyFeatureB, "Should find propertyB feature");
    if (propertyFeatureB) {
      strictEqual(
        propertyFeatureB.code,
        "propertyB: number",
        "Code for propertyB should be its full signature",
      );
      strictEqual(propertyFeatureB.filePath, tempFilePath);
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

    // console.info("Actual Enum Features from CodeMapper:", JSON.stringify(features, null, 2)); // Debug line

    ok(Array.isArray(features), "Should return an array of features for enum");
    // Expected 1 feature: enum def
    deepStrictEqual(
      features.length,
      1,
      "Expected 1 feature for the enum snippet",
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
      ok(
        enumDefFeature.code.trim().endsWith("}"),
        "Enum def code should end with a closing brace",
      );
    }
  });

  after(() => {
    if (existsSync(tempFilePath)) {
      unlinkSync(tempFilePath);
    }
    // Attempt to remove the directory if it's empty
    // This might fail if other temp files are created by parallel tests or if not empty
    try {
      rmdirSync(tempTestDir);
    } catch (_e) {
      // console.warn(`Could not remove temp directory ${tempTestDir}: ${e.message}`);
    }
  });

  it("should process an advanced TypeScript class snippet with static members, getters, setters, and private methods", () => {
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
    writeFileSync(tempFilePath, advancedClassSnippet, "utf8");

    const treeSitterManager = new TreeSitterManager();
    const codeMapper = new CodeMapper(treeSitterManager);
    const features = codeMapper.processFile(tempFilePath);

    // console.info("Advanced Class Features:", JSON.stringify(features, null, 2)); // Debug line

    ok(
      Array.isArray(features),
      "Should return an array of features for advanced class",
    );
    // Expected 10 features:
    // class def = 1
    // publicProp def = 1
    // privateProp def = 1
    // staticProp def = 1
    // constructor def = 1
    // getter 'value' def = 1
    // setter 'value' def = 1
    // publicMethod def = 1
    // privateMethod def = 1
    // staticMethod def = 1
    // Total = 10
    deepStrictEqual(
      features.length,
      10,
      "Expected 10 features for the advanced class snippet",
    );

    // Class definition
    const classDefFeature = features.find(
      (f) =>
        f.type === "class" &&
        f.name === "AdvancedClass" &&
        f.code.startsWith("class AdvancedClass"),
    );
    ok(
      classDefFeature,
      "Should find the main AdvancedClass definition feature",
    );

    // Property: publicProp
    const publicPropFeature = features.find(
      (f) =>
        f.type === "property" &&
        f.name === "publicProp" &&
        f.code.startsWith("public publicProp"),
    );
    ok(publicPropFeature, "Should find publicProp property definition feature");

    // Property: privateProp
    const privatePropFeature = features.find(
      (f) =>
        f.type === "property" &&
        f.name === "privateProp" &&
        f.code.startsWith("private privateProp"),
    );
    ok(
      privatePropFeature,
      "Should find privateProp property definition feature",
    );
    if (privatePropFeature) {
      strictEqual(privatePropFeature.code, "private privateProp: number = 1");
    }

    // Property: staticProp
    const staticPropFeature = features.find(
      (f) =>
        f.type === "property" &&
        f.name === "staticProp" &&
        f.code.startsWith("static staticProp"),
    );
    ok(staticPropFeature, "Should find staticProp property definition feature");
    if (staticPropFeature) {
      strictEqual(staticPropFeature.code, "static staticProp: boolean = true");
    }

    // Constructor
    const constructorFeature = features.find(
      (f) => f.type === "method" && f.name === "constructor",
    );
    ok(constructorFeature, "Should find constructor feature");

    // Getter: value
    const getterFeature = features.find(
      (f) =>
        f.type === "method" &&
        f.name === "value" &&
        f.code.startsWith("get value"),
    );
    ok(getterFeature, "Should find getter 'value' feature");

    // Setter: value
    const setterFeature = features.find(
      (f) =>
        f.type === "method" &&
        f.name === "value" &&
        f.code.startsWith("set value"),
    );
    ok(setterFeature, "Should find setter 'value' feature");

    // Public method
    const publicMethodFeature = features.find(
      (f) => f.type === "method" && f.name === "publicMethod",
    );
    ok(publicMethodFeature, "Should find publicMethod feature");

    // Private method
    const privateMethodFeature = features.find(
      (f) => f.type === "method" && f.name === "privateMethod",
    );
    ok(privateMethodFeature, "Should find privateMethod feature");

    // Static method
    const staticMethodFeature = features.find(
      (f) =>
        f.type === "method" &&
        f.name === "staticMethod" &&
        f.code.startsWith("static staticMethod"),
    );
    ok(staticMethodFeature, "Should find staticMethod feature");

    // Check that staticMethod is not duplicated
    const staticMethodFeatures = features.filter(
      (f) => f.name === "staticMethod" && f.type === "method",
    );
    deepStrictEqual(
      staticMethodFeatures.length,
      1,
      "Static method should have exactly one feature (def)",
    );
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
    // Expected 1 feature for `myFunction` (definition)
    // Expected 1 feature for `myArrowFunction` (definition)
    deepStrictEqual(
      features.length,
      2,
      "Expected 2 features for the function snippet",
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
  });
});
