import type { Theme } from "./highlight/theme.ts";
import style from "./style.ts";

/**
 * Identity function for tokens that should not be styled (returns the input string as-is).
 * See [[Theme]] for an example.
 */
const plain = (codePart: string): string => codePart;

/**
 * The default theme. It is possible to override just individual keys.
 */
export const DEFAULT_THEME: Theme = {
  /**
   * keyword in a regular Algol-style language
   */
  keyword: style.blue,

  /**
   * built-in or library object (constant, class, function)
   */
  // biome-ignore lint/style/useNamingConvention: API name from highlight.js
  built_in: style.cyan,

  /**
   * user-defined type in a language with first-class syntactically significant types, like
   * Haskell
   */
  type: style.cyan.dim,

  /**
   * special identifier for a built-in value ("true", "false", "null")
   */
  literal: style.blue,

  /**
   * number, including units and modifiers, if any.
   */
  number: style.green,

  /**
   * literal regular expression
   */
  regexp: style.red,

  /**
   * literal string, character
   */
  string: style.red,

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
  class: style.blue,

  /**
   * function or method declaration
   */
  function: style.yellow,

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
  comment: style.green,

  /**
   * documentation markup within comments
   */
  doctag: style.green,

  /**
   * flags, modifiers, annotations, processing instructions, preprocessor directive, etc
   */
  meta: style.gray,

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
  tag: style.gray,

  /**
   * name of an XML tag, the first word in an s-expression
   */
  name: style.blue,

  /**
   * s-expression name from the language standard library
   */
  "builtin-name": plain,

  /**
   * name of an attribute with no language defined semantics (keys in JSON, setting names in
   * .ini), also sub-attribute within another highlighted object, like XML tag
   */
  attr: style.cyan,

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
  emphasis: style.italic,

  /**
   * strong emphasis in text markup
   */
  strong: style.bold,

  /**
   * mathematical formula in text markup
   */
  formula: plain,

  /**
   * hyperlink in text markup
   */
  link: style.underline,

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
  addition: style.green,

  /**
   * deleted line in a diff
   */
  deletion: style.red,

  /**
   * things not matched by any token
   */
  default: plain,
};
