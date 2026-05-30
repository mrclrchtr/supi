// Shared typed data interfaces between use-case and presentation layers.

import type { CodeProvider } from "../analysis/context/request-context.ts";
import type { ArchitectureModel } from "../model.ts";
import type { BriefDetails, ContextDetails } from "../types.ts";

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
  | { kind: "anchored"; file: string; line: number; character: number; maxResults?: number }
  | { kind: "symbol"; symbol: string; path?: string; maxResults?: number };

export interface BriefDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
}

export interface BriefUseCaseResult {
  content: string;
  details: BriefDetails;
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
  | "imports";

export interface ContextTarget {
  file: string;
  line: number;
  character: number;
  name: string | null;
  kind: string | null;
}

export interface ContextInput {
  task?: string;
  target?: ContextTarget | null;
  scope?: string;
  budget?: "small" | "medium" | "large";
  include?: ContextSection[];
  maxResults?: number;
}

export interface ContextDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
}

export interface ContextUseCaseResult {
  content: string;
  details: ContextDetails;
}
