// Shared typed data interfaces between use-case and presentation layers.

import type { ArchitectureModel } from "../model.ts";
import type { BriefDetails } from "../types.ts";
import type { CodeProvider } from "../workspace/request-context.ts";

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
  | { kind: "project" }
  | { kind: "path"; path: string }
  | { kind: "file"; file: string }
  | { kind: "anchored"; file: string; line: number; character: number }
  | { kind: "symbol"; symbol: string; path?: string };

export interface BriefDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
}

export interface BriefUseCaseResult {
  content: string;
  details: BriefDetails;
}
