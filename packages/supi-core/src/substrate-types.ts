/** 0-based position used by LSP and code-intelligence internally. */
export interface CodePosition {
  line: number;
  character: number;
}

/** Normalized location — flat replacement for LSP's nested Location/range shape. */
export interface CodeLocation {
  uri: string;
  range: { start: CodePosition; end: CodePosition };
}
