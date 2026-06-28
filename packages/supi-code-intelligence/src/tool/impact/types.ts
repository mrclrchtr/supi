import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { TestSurfaceDetails } from "../../analysis/tests/test-discovery.ts";

export interface ImpactInput {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  change?: string;
  changeSetFiles?: string[];
  includeTests?: boolean;
}

export interface ImpactDeps {
  cwd: string;
  provider: import("../../analysis/provider.ts").CodeProvider | null;
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState;
}

export interface ImpactAnalysis {
  confidence: ConfidenceMode;
  affectedFiles: Set<string>;
  affectedModules: Set<string>;
  downstreamCount: number;
  checkNext: string[];
  likelyTests: string[];
  likelyTestCommands: string[];
  riskLevel: "low" | "medium" | "high";
  externalRefs: number;
  semanticRefFiles?: string[];
  tests?: TestSurfaceDetails;
}
