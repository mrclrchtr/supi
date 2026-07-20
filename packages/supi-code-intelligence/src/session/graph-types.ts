import type { ReadNextItem } from "../analysis/read-next.ts";
import type { RelationLocationPartialReason } from "../analysis/relations/provider-locations.ts";
import type {
  CallEntry,
  CalleeScope,
  ImplementationEntry,
  ReferenceEntry,
} from "../analysis/relations/types.ts";
import type { GraphTargetInput } from "./target-input.ts";
import type { TargetWorkflowOutcome } from "./target-workflow.ts";

/** Concrete graph relation families. */
export type GraphRelationKind = "references" | "callees" | "implements";
export type RequestedGraphRelation = GraphRelationKind | "all";

/** Canonical input to the session-owned graph workflow. */
export interface GraphWorkflowInput {
  readonly target: GraphTargetInput;
  readonly relations?: readonly RequestedGraphRelation[];
  readonly calleeDepth?: "direct" | "deep";
  readonly maxResults?: number;
}

/** Presentation-neutral relation sections. */
export type GraphSection =
  | {
      readonly kind: "ok";
      readonly rel: "references";
      readonly data: {
        readonly references: readonly ReferenceEntry[];
        readonly externalCount: number;
        readonly invalidLocationCount: number;
        readonly partialReason: RelationLocationPartialReason | null;
        readonly confidence: "semantic";
      };
      readonly readNext: readonly ReadNextItem[];
    }
  | {
      readonly kind: "ok";
      readonly rel: "callees";
      readonly data: {
        readonly enclosingScope: CalleeScope;
        readonly calls: readonly CallEntry[];
        readonly depth: "direct" | "deep";
      };
      readonly readNext: readonly ReadNextItem[];
    }
  | {
      readonly kind: "ok";
      readonly rel: "implements";
      readonly data: {
        readonly implementations: readonly ImplementationEntry[];
        readonly externalCount: number;
        readonly invalidLocationCount: number;
        readonly partialReason: RelationLocationPartialReason | null;
      };
      readonly readNext: readonly ReadNextItem[];
    }
  | {
      readonly kind: "unavailable";
      readonly rel: GraphRelationKind;
      readonly message: string;
    };

/** Completed graph facts after one Target workflow execution. */
export interface CompletedGraphWorkflow {
  readonly kind: "completed";
  readonly displayName: string;
  readonly resolvedDisplayFile: string;
  readonly maxResults: number;
  readonly sections: readonly GraphSection[];
}

/** Graph workflow outcome, preserving target disambiguation and failure states. */
export type GraphWorkflowOutcome =
  | CompletedGraphWorkflow
  | Exclude<TargetWorkflowOutcome, { kind: "resolved" } | { kind: "target-group" }>;
