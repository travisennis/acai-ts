;; tags.scm for TypeScript symbol extraction

(import_statement source: (string) @import.source) @import

; functions
(function_declaration
  name: (identifier) @name) @definition.function

; classes (with optional modifiers like export)
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

; Class methods (implementations, explicitly within class_body)
(class_body
  (method_definition
    name: (property_identifier) @name) @definition.method)

; Static Class methods (implementations, explicitly within class_body)
(class_body
  (method_definition
    "static"
    name: (property_identifier) @name) @definition.method)

(public_field_definition
  name: (property_identifier) @name) @definition.property

; Exported function (variable declarator with function)
(export_statement
  declaration: (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: (function_expression)
    ) @definition.function
  ))

; Exported function (variable declarator with arrow function)
(export_statement
  declaration: (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: (arrow_function)
    ) @definition.function
  ))

; Exported class
(export_statement
  declaration: (class_declaration
    name: (type_identifier) @name @definition.class
  ))

; Exported interface
(export_statement
  declaration: (interface_declaration
    name: (type_identifier) @name @definition.interface
  ))

; Exported enum
(export_statement
  declaration: (enum_declaration
    name: (identifier) @name @definition.enum
  ))

; Type alias
(type_alias_declaration
    name: (type_identifier) @name
    value: (_) @value
) @definition.type

; Exported type alias
(export_statement
    declaration: (type_alias_declaration
      name: (type_identifier) @name
      value: (_) @value
    ) @definition.type)

; Namespace (try internal_module)
(internal_module
  name: (identifier) @name @definition.namespace)
