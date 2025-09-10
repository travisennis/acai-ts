import chalk from "./chalk.ts";
import type { Theme } from "./highlight/theme.ts";

/**
 * Identity function for tokens that should not be styled (returns the input string as-is).
 * See [[Theme]] for an example.
 */
export const plain = (codePart: string): string => codePart;

/**
 * The default theme. It is possible to override just individual keys.
 */
export const DEFAULT_THEME: Theme = {
  /**
   * keyword in a regular Algol-style language
   */
  keyword: chalk.blue,

  /**
   * built-in or library object (constant, class, function)
   */
  // biome-ignore lint/style/useNamingConvention: API name from highlight.js
  built_in: chalk.cyan,

  /**
   * user-defined type in a language with first-class syntactically significant types, like
   * Haskell
   */
  type: chalk.cyan.dim,

  /**
   * special identifier for a built-in value ("true", "false", "null")
   */
  literal: chalk.blue,

  /**
   * number, including units and modifiers, if any.
   */
  number: chalk.green,

  /**
   * literal regular expression
   */
  regexp: chalk.red,

  /**
   * literal string, character
   */
  string: chalk.red,

  /**
   * parsed section inside a literal string
   */
  subst: plain,

  /**
   * symbolic constant, interned string, goto label
   */
  symbol: plain,

  /**
   * class or class-level declaration (interfaces, traits, modules, etc)
   */
  class: chalk.blue,

  /**
   * function or method declaration
   */
  function: chalk.yellow,

  /**
   * name of a class or a function at the place of declaration
   */
  title: plain,

  /**
   * block of function arguments (parameters) at the place of declaration
   */
  params: plain,

  /**
   * comment
   */
  comment: chalk.green,

  /**
   * documentation markup within comments
   */
  doctag: chalk.green,

  /**
   * flags, modifiers, annotations, processing instructions, preprocessor directive, etc
   */
  meta: chalk.gray,

  /**
   * keyword or built-in within meta construct
   */
  "meta-keyword": plain,

  /**
   * string within meta construct
   */
  "meta-string": plain,

  /**
   * heading of a section in a config file, heading in text markup
   */
  section: plain,

  /**
   * XML/HTML tag
   */
  tag: chalk.gray,

  /**
   * name of an XML tag, the first word in an s-expression
   */
  name: chalk.blue,

  /**
   * s-expression name from the language standard library
   */
  "builtin-name": plain,

  /**
   * name of an attribute with no language defined semantics (keys in JSON, setting names in
   * .ini), also sub-attribute within another highlighted object, like XML tag
   */
  attr: chalk.cyan,

  /**
   * name of an attribute followed by a structured value part, like CSS properties
   */
  attribute: plain,

  /**
   * variable in a config or a template file, environment var expansion in a script
   */
  variable: plain,

  /**
   * list item bullet in text markup
   */
  bullet: plain,

  /**
   * code block in text markup
   */
  code: plain,

  /**
   * emphasis in text markup
   */
  emphasis: chalk.italic,

  /**
   * strong emphasis in text markup
   */
  strong: chalk.bold,

  /**
   * mathematical formula in text markup
   */
  formula: plain,

  /**
   * hyperlink in text markup
   */
  link: chalk.underline,

  /**
   * quotation in text markup
   */
  quote: plain,

  /**
   * tag selector in CSS
   */
  "selector-tag": plain,

  /**
   * #id selector in CSS
   */
  "selector-id": plain,

  /**
   * .class selector in CSS
   */
  "selector-class": plain,

  /**
   * [attr] selector in CSS
   */
  "selector-attr": plain,

  /**
   * :pseudo selector in CSS
   */
  "selector-pseudo": plain,

  /**
   * tag of a template language
   */
  "template-tag": plain,

  /**
   * variable in a template language
   */
  "template-variable": plain,

  /**
   * added or changed line in a diff
   */
  addition: chalk.green,

  /**
   * deleted line in a diff
   */
  deletion: chalk.red,

  /**
   * things not matched by any token
   */
  default: plain,
};
