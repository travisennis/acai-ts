// Example TypeScript code for testing

// Interface
export interface MyInterface {
  propertyA: string;
  propertyB: number;
  methodSignature(param: boolean): string;
}

// Enum
export enum MyEnum {
  OptionA,
  OptionB = "B",
  OptionC = 10,
}

// Class
export class MyClass implements MyInterface {
  public propertyA: string;
  private _propertyB: number;
  static staticProperty: boolean = true;

  constructor(a: string, b: number) {
    this.propertyA = a;
    this._propertyB = b;
  }

  get propertyB(): number {
    return this._propertyB;
  }

  set propertyB(value: number) {
    this._propertyB = value;
  }

  public methodSignature(param: boolean): string {
    if (param) {
      return "Hello";
    }
    return "World";
  }

  private privateMethod(): void {
    console.info("This is private");
  }

  static staticMethod(): string {
    return "Static method called";
  }
}

// Function
export function myFunction(name: string, age?: number): MyInterface {
  return {
    propertyA: `Name: ${name}`,
    propertyB: age || 30,
    methodSignature: (p) => (p ? "Yes" : "No"),
  };
}

// Type Alias
export type MyTypeAlias = string | number | MyInterface;

// Another function using an enum and a class
export function processEnum(option: MyEnum): void {
  const instance = new MyClass("test", 123);
  console.info(`Processing ${option} with ${instance.propertyA}`);
  MyClass.staticMethod();
}

// Arrow function variable
export const myArrowFunction = (value: number): string => {
  return `Value is ${value}`;
};

// Variable declaration
const myVariable: MyTypeAlias = "a string";

// Module-level variable
let moduleVar: boolean = false;

function localHelper(): void {
  // This is not exported
}

// Call expressions for testing references
myFunction("test");
const clsInstance = new MyClass("a", 1);
clsInstance.methodSignature(true);
MyClass.staticMethod();
processEnum(MyEnum.OptionB);
