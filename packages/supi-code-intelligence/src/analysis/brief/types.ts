// Brief use-case types — moved from shared/context/types.ts (Phase 2.5)

import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import type { BriefDetails } from "../../types/details.ts";
import type { ArchitectureModel } from "../architecture/model.ts";
import type { CodeProvider } from "../provider.ts";

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
