# Task 2: Implement src/tool-framework.ts and export from api.ts/index.ts

Create `packages/supi-core/src/tool-framework.ts`.

Contents:
```ts
import type { ExtensionAPI, ExtensionContext, ToolContent } from "@earendil-works/pi-coding-agent";
import { type TSchema, Type } from "typebox";

// --- Types ---

/** Minimum contract for a SuPi tool definition. */
export interface SuiPiToolSpec {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: TSchema;
}

/** Derived prompt surface — what pi flattens into the system prompt. */
export interface SuiPiToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

// --- Helpers ---

/** Static derivation: copies spec fields into a prompt surface. */
export function derivePromptSurface(spec: SuiPiToolSpec): SuiPiToolPromptSurface {
  return {
    description: spec.description,
    promptSnippet: spec.promptSnippet,
    promptGuidelines: [...spec.promptGuidelines],
  };
}

// --- Registration ---

export type ToolExecuteFn = (
  toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: unknown,
  ctx: ExtensionContext,
) => Promise<{ content: ToolContent[]; details?: Record<string, unknown> }>;

/**
 * Register a set of tools from specs + pre-derived surfaces.
 * `createExecute` receives the spec and returns a pi-compatible execute function.
 */
export function registerSuiPiTools(
  pi: ExtensionAPI,
  specs: readonly SuiPiToolSpec[],
  surfaces: Record<string, SuiPiToolPromptSurface>,
  createExecute: (spec: SuiPiToolSpec) => ToolExecuteFn,
): void {
  for (const spec of specs) {
    const surface = surfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface?.description ?? spec.description,
      promptSnippet: surface?.promptSnippet ?? spec.promptSnippet,
      promptGuidelines: surface?.promptGuidelines ?? [...spec.promptGuidelines],
      parameters: spec.parameters,
      execute: createExecute(spec),
    });
  }
}

// --- Shared param builders ---

export const FileParam = Type.String({ description: "File path (relative or absolute)" });
export const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });
export const CharacterParam = Type.Number({ description: "1-based column number (UTF-16)", minimum: 1 });
export const SymbolParam = Type.String({ description: "Symbol name for discovery-based resolution" });
export const MaxResultsParam = Type.Number({ description: "Maximum results to return" });
```

Then add exports in `packages/supi-core/src/api.ts` and `packages/supi-core/src/index.ts`:
```ts
export type { SuiPiToolPromptSurface, SuiPiToolSpec } from "./tool-framework.ts";
export type { ToolExecuteFn } from "./tool-framework.ts";
export {
  CharacterParam,
  FileParam,
  LineParam,
  MaxResultsParam,
  SymbolParam,
  derivePromptSurface,
  registerSuiPiTools,
} from "./tool-framework.ts";
```

Follow existing export style in api.ts/index.ts — group types separately via `export type`.
