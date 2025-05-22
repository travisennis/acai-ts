export const tags = `
; Imports
; Named import: import { MyClass } from './my-module.ts';
; Captures 'MyClass' as @name and './my-module.ts' as @import.source
(import_statement
  (import_clause
    (named_imports
      (import_specifier name: (identifier) @name) @definition.import))
  source: (string) @import.source)

; Default import: import MyDefault from './my-module.ts';
; Captures 'MyDefault' as @name and './my-module.ts' as @import.source
(import_statement
  (import_clause (identifier) @name)
  source: (string) @import.source) @definition.import

; Namespace import: import * as MyNamespace from './my-module.ts';
; Captures 'MyNamespace' as @name and './my-module.ts' as @import.source
(import_statement
  (import_clause (namespace_import (identifier) @name))
  source: (string) @import.source) @definition.import

; Side-effect import (no name): import './my-module.ts';
; Only captures the source.
(import_statement
  source: (string) @import.source) @definition.import.side_effect

; functions
(function_declaration
  name: (identifier) @name) @definition.function

; Arrow function assigned to a const/let
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function)
  ) @definition.function)

; Arrow function assigned to a var
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function)
  ) @definition.function)

; Function expression assigned to a var
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: (function_expression)
  ) @definition.function)

; classes
(class_declaration
  name: (type_identifier) @name) @definition.class

; interfaces
(interface_declaration
  name: (type_identifier) @name) @definition.interface

(property_signature
  name: (property_identifier) @name
) @interface.property

(method_signature
  name: (property_identifier) @name
) @interface.method

; enums
(enum_declaration
  name: (identifier) @name) @definition.enum

; Instance Class methods
; Order: optional modifiers [public/private/protected], optional "async", then name.
; This pattern will not match methods with "static" in the typical static keyword position.
(class_body
  (method_definition
    (accessibility_modifier)?
    ("async")?
    name: (property_identifier) @name) @definition.method)

; Class properties
(public_field_definition
  name: (property_identifier) @name) @definition.property

; Type alias
(type_alias_declaration
    name: (type_identifier) @name
    value: (_) @value ; Capturing the value node for type alias content
) @definition.type

; Namespace (internal_module)
(internal_module
  name: (identifier) @name @definition.namespace)

; Removed general export_statement capture to avoid overcounting features.
; Export status can be checked by inspecting the parent node in the consuming code if necessary.
`;
