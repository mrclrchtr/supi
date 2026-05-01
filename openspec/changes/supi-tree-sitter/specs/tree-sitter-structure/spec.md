## ADDED Requirements

### Requirement: Outline extraction SHALL summarize the structural declarations of a supported file
The system SHALL extract a compact outline for a supported file that includes top-level and nested structural declarations relevant to the language, such as functions, classes, interfaces, methods, and exported declarations.

#### Scenario: Outline for a TypeScript module
- **WHEN** the agent or another extension requests an outline for a supported TypeScript file containing exported functions, classes, and interfaces
- **THEN** the result lists those declarations in source order with their names, kinds, and ranges

#### Scenario: Nested declarations
- **WHEN** a supported file contains a class with methods
- **THEN** the outline includes the class and its methods in a nested or clearly associated structure

### Requirement: Structural extraction SHALL identify imports and exports for supported files
The system SHALL extract import and export relationships from supported files, including module specifiers for imports and named/default exported declarations where the grammar exposes them clearly.

#### Scenario: Imports in a TypeScript file
- **WHEN** a supported TypeScript file contains `import { readFile } from "node:fs/promises"` and `import { x } from "./local"`
- **THEN** the imports result includes both module specifiers and distinguishes each import occurrence by source range

#### Scenario: Exports for service consumers
- **WHEN** another extension requests structural information for a supported file with `export function load()` and `export class Config`
- **THEN** the returned structure includes `load` and `Config` as exported declarations

### Requirement: Node lookup SHALL return the smallest relevant node at a position with ancestry context
The system SHALL support locating the smallest relevant syntax node covering a given file position and SHALL include node type, source range, and parent-path context in the result.

#### Scenario: Lookup on identifier position
- **WHEN** the agent requests `node_at` for a position inside a function name in a supported file
- **THEN** the result identifies the smallest node covering that position and includes its enclosing declaration context

#### Scenario: Lookup on whitespace near syntax
- **WHEN** the agent requests `node_at` for a position that falls on whitespace between tokens but within a containing declaration
- **THEN** the result identifies the nearest relevant enclosing node rather than failing silently

### Requirement: Query execution SHALL return matching captures with source ranges
The system SHALL support Tree-sitter query execution for supported files and return the matching captures with enough context to identify where each match occurred.

#### Scenario: Query finds exported functions
- **WHEN** the agent runs a Tree-sitter query that captures exported function declarations in a supported TypeScript file
- **THEN** the result lists the matching captures with capture names, node types, and source ranges

#### Scenario: Query has no matches
- **WHEN** the agent runs a valid Tree-sitter query that matches nothing in a supported file
- **THEN** the result reports that no matches were found for the query
