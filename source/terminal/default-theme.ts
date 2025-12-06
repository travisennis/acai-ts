import { id } from "../utils/funcs.ts";
import type { Theme } from "./highlight/theme.ts";
import style from "./style.ts";

/**
 * The default theme. It is possible to override just individual keys.
 */
export const DEFAULT_HIGHLIGHT_THEME: Theme = {
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
  subst: id,

  /**
   * symbolic constant, interned string, goto label
   */
  symbol: id,

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
  title: id,

  /**
   * block of function arguments (parameters) at the place of declaration
   */
  params: id,

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
  "meta-keyword": id,

  /**
   * string within meta construct
   */
  "meta-string": id,

  /**
   * heading of a section in a config file, heading in text markup
   */
  section: id,

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
  "builtin-name": id,

  /**
   * name of an attribute with no language defined semantics (keys in JSON, setting names in
   * .ini), also sub-attribute within another highlighted object, like XML tag
   */
  attr: style.cyan,

  /**
   * name of an attribute followed by a structured value part, like CSS properties
   */
  attribute: id,

  /**
   * variable in a config or a template file, environment var expansion in a script
   */
  variable: id,

  /**
   * list item bullet in text markup
   */
  bullet: id,

  /**
   * code block in text markup
   */
  code: id,

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
  formula: id,

  /**
   * hyperlink in text markup
   */
  link: style.underline,

  /**
   * quotation in text markup
   */
  quote: id,

  /**
   * tag selector in CSS
   */
  "selector-tag": id,

  /**
   * #id selector in CSS
   */
  "selector-id": id,

  /**
   * .class selector in CSS
   */
  "selector-class": id,

  /**
   * [attr] selector in CSS
   */
  "selector-attr": id,

  /**
   * :pseudo selector in CSS
   */
  "selector-pseudo": id,

  /**
   * tag of a template language
   */
  "template-tag": id,

  /**
   * variable in a template language
   */
  "template-variable": id,

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
  default: id,
};
