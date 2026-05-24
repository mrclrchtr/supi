# Task 2: Define substrate interfaces and value types in supi-code-intelligence

Create `packages/supi-code-intelligence/src/substrates/types.ts` with all interfaces and value types described in the plan.

**Value types** (normalized flat structs, no nested `range: { startLine, ... }`):

```ts
import type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/api";

export type StructuralResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string };

export interface OutlineData {
  name: string; kind: string;
  startLine: number; startCharacter: number; endLine: number; endCharacter: number;
  children?: OutlineData[];
}

export interface ExportData {
  name: string; kind: string;
  startLine: number; startCharacter: number; endLine: number; endCharacter: number;
  moduleSpecifier?: string;
}

export interface ImportData {
  moduleSpecifier: string;
  startLine: number; startCharacter: number; endLine: number; endCharacter: number;
}

export interface NodeAtData {
  type: string;
  startLine: number; startCharacter: number; endLine: number; endCharacter: number;
  text: string;
  ancestry: Array<{
    type: string;
    startLine: number; startCharacter: number; endLine: number; endCharacter: number;
  }>;
}

export interface CalleesData {
  enclosingScope: { name: string; startLine: number; endLine: number };
  callees: Array<{ name: string; startLine: number }>;
}

export interface CodeSymbol {
  name: string; kind: string; file: string;
  line: number; character: number; // 1-based display
  container?: string | null;
}
```

**Interfaces:**

```ts
export interface SemanticSubstrate {
  references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  documentSymbols(filePath: string): Promise<CodeSymbol[] | null>;
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;
}

export interface StructuralSubstrate {
  calleesAt(file: string, line: number, character: number): Promise<StructuralResult<CalleesData>>;
  exports(file: string): Promise<StructuralResult<ExportData[]>>;
  outline(file: string): Promise<StructuralResult<OutlineData[]>>;
  imports(file: string): Promise<StructuralResult<ImportData[]>>;
  nodeAt(file: string, line: number, character: number): Promise<StructuralResult<NodeAtData>>;
}
```

This is types-only (test-exempt). Verify with `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`.
