// Shared type alias for tree-sitter syntax nodes used in structure extraction.
// We use a minimal interface instead of importing from web-tree-sitter directly
// to avoid coupling to the runtime module.

export interface SyntaxNodeLike {
  type: string;
  text: string;
  children: SyntaxNodeLike[];
  parent: SyntaxNodeLike | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childForFieldName(name: string): SyntaxNodeLike | null;
}
