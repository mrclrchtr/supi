import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
import type { CalleeScope } from "../../analysis/relations/types.ts";
import type { GraphRelationKind } from "../../session/graph-types.ts";

/** File heading for the next count rows in the relation's bounded display section. */
export interface GraphFileGroup {
  file: string;
  count: number;
}

/** Relation status and context kept for the human transcript. Counts live in evidenceLists. */
export interface GraphSectionDetails {
  rel: GraphRelationKind;
  source: "semantic" | "structural";
  status: "complete" | "partial" | "unavailable";
  message: string | null;
  externalCount: number;
  enclosingScope: CalleeScope | null;
  depth: "direct" | "deep" | null;
  /** Absent in older results whose display rows already contain full paths. */
  fileGroups?: GraphFileGroup[];
}

/** Persisted graph facts. The TUI does not read or parse agent Markdown. */
export interface GraphDetails {
  targetName: string;
  targetFile: string;
  sections: GraphSectionDetails[];
  evidenceLists: EvidenceListMetadata[];
  readNext: ReadNextItem[];
}
