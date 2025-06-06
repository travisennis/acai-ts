export const tags = `;; Java symbol queries (tree-sitter-java)

;; Classes
(class_declaration
  name: (identifier) @name) @definition.class

;; Interfaces
(interface_declaration
  name: (identifier) @name) @definition.interface

(method_declaration
  name: (identifier) @name
) @interface.method

;; Enums
(enum_declaration
  name: (identifier) @name) @definition.enum

;; Methods (instance & static)
(method_declaration
  name: (identifier) @name) @definition.method

;; Constructors
(constructor_declaration
  name: (identifier) @name) @definition.method
`;
