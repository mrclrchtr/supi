// Shared typed data interfaces between use-case and presentation layers.

import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";
import type { ArchitectureModel } from "../model.ts";
import type { BriefDetails, ContextDetails, InspectDetails } from "../types.ts";
import type { AnchorKind } from "../workflow/target-store.ts";

// ── Overview use-case ────────────────────────────────────────────────

export interface OverviewModule {
  name: string;
  shortName: string;
  description: string | null;
  isLeaf: boolean;
  internalDeps: string[];
}

export interface OverviewData {
  projectName: string | null;
  projectDescription: string | null;
  modules: OverviewModule[];
  omittedModuleCount: number;
  gitContextOverview: string | null;
}

// ── Brief use-case ───────────────────────────────────────────────────

export type BriefInput =
  | { kind: "project"; maxResults?: number }
  | { kind: "path"; path: string; maxResults?: number }
  | { kind: "file"; file: string; maxResults?: number }
  | { kind: "symbol"; symbol: string; path?: string; maxResults?: number };

export interface BriefDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
  /** Show git context in orientation output. Defaults to true. */
  showGitContext?: boolean;
  /** LSP service state for diagnostic access. */
  lspService: SessionLspServiceState;
}

export interface BriefUseCaseResult {
  content: string;
  details: BriefDetails;
}

// ── Inspect use-case ─────────────────────────────────────────────────

export interface InspectInput {
  file: string;
  line: number;
  character: number;
  maxResults?: number;
}

export interface InspectDeps {
  provider: CodeProvider | null;
  cwd: string;
  lspService: SessionLspServiceState;
}

export interface InspectUseCaseResult {
  content: string;
  details: InspectDetails;
}

// ── Context use-case ─────────────────────────────────────────────────

export type ContextSection =
  | "defs"
  | "references"
  | "callees"
  | "tests"
  | "docs"
  | "diagnostics"
  | "exports"
  | "imports"
  | "impact";

export interface ContextTarget {
  file: string;
  line: number;
  character: number;
  name: string | null;
  kind: string | null;
  /** Which anchor this target carries; strict consumers refuse declaration anchors. */
  anchorKind: AnchorKind;
}

export interface ContextInput {
  task?: string;
  target?: ContextTarget | null;
  scope?: string;
  budget?: "small" | "medium" | "large";
  include?: ContextSection[];
  maxResults?: number;
  /** Show git context in orientation output. Defaults to true. */
  showGitContext?: boolean;
  /** When present, the executor may append impact assessment. */
  change?: string;
}

export interface ContextDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
  lspService: SessionLspServiceState;
}

export interface ContextUseCaseResult {
  content: string;
  details: ContextDetails;
}
