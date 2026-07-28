// Shared typed data interfaces between use-case and presentation layers.

import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { ArchitectureModel } from "../../analysis/architecture/model.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import type { InspectDetails } from "../../types/details.ts";

// ── Overview use-case ───────────────────────────────────────────────

export interface OverviewModule {
  name: string;
  shortName: string;
  description: string | null;
  /** Manifest-declared package relationships to other discovered packages. */
  declaredDependencies: string[];
  /** Field-labelled manifest path declarations, never selected by precedence. */
  declaredEntrypoints: string[];
}

export interface OverviewData {
  projectName: string | null;
  projectDescription: string | null;
  modules: OverviewModule[];
  omittedModuleCount: number;
  /** Detected source languages (e.g. ["ts", "js", "py"]). */
  detectedLanguages: string[] | null;
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
  lspRuntime: WorkspaceLspRuntimeState;
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
}

export interface OrientationDeps {
  model: ArchitectureModel;
  provider: CodeProvider | null;
  cwd: string;
  lspRuntime: WorkspaceLspRuntimeState;
}
