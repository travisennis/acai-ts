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

; Class methods
(class_body
  (method_definition
    name: (property_identifier) @name) @definition.method)

; Static Class methods
(class_body
  (method_definition
    "static"
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
