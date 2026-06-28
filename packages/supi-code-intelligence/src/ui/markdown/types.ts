// Shared typed data interfaces between use-case and presentation layers.

import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import type { ArchitectureModel } from "../../analysis/architecture/model.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import type { ContextDetails, InspectDetails } from "../../types/details.ts";

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

// ── Orientation use-case ─────────────────────────────────────────────────

export type OrientationSection = "defs" | "docs" | "diagnostics";

export interface OrientationTarget {
  file: string;
  line: number;
  character: number;
  name: string | null;
  kind: string | null;
  /** Which anchor this target carries; strict consumers refuse declaration anchors. */
  anchorKind: AnchorKind;
}

export interface OrientationInput {
  target?: OrientationTarget | null;
  /** Resolved orientation focus path for project/module/directory/file orientation. */
  focus?: string;
  maxResults?: number;
  /** Show git context in orientation output. Defaults to true. */
  showGitContext?: boolean;
}

export interface OrientationDeps {
  model: ArchitectureModel | null;
  provider: CodeProvider | null;
  cwd: string;
  lspService: SessionLspServiceState;
}

export interface OrientationUseCaseResult {
  content: string;
  details: ContextDetails;
}
