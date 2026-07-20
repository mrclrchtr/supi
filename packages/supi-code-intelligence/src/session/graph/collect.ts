/** Presentation-neutral relation collection used by the session-owned graph workflow. */

import type { CodeProvider } from "../../analysis/provider.ts";
import {
  readNextEnclosingScope,
  readNextTarget,
  readNextTopSites,
} from "../../analysis/read-next.ts";
import { collectCallees } from "../../analysis/relations/callees.ts";
import { collectImplementations } from "../../analysis/relations/implementations.ts";
import { collectCallers } from "../../analysis/relations/references.ts";
import type { CallEntry } from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import type { GraphRelationKind, GraphSection } from "../graph-types.ts";
import type { AnchorKind } from "../target-store.ts";

/** Inputs shared by relation collectors. */
export interface CollectRelationOptions {
  file: string;
  position: { line: number; character: number };
  displayName: string;
  cwd: string;
  provider: CodeProvider | null;
  maxResults: number;
  semanticReadinessError: string | null;
  anchorKind: AnchorKind;
  calleeDepth?: "direct" | "deep";
}

/** Collect one evidence-backed graph relation without rendering it. */
export async function collectRelation(
  relation: GraphRelationKind,
  options: CollectRelationOptions,
): Promise<GraphSection> {
  if (options.semanticReadinessError && (relation === "references" || relation === "implements")) {
    return { kind: "unavailable", rel: relation, message: options.semanticReadinessError };
  }

  try {
    switch (relation) {
      case "references":
        return collectReferences(options);
      case "callees":
        return collectCalleesRelation(options);
      case "implements":
        return collectImplementationsRelation(options);
    }
  } catch (error) {
    return {
      kind: "unavailable",
      rel: relation,
      message: error instanceof Error ? error.message : "Unknown relation failure",
    };
  }
}

async function collectReferences(options: CollectRelationOptions): Promise<GraphSection> {
  if (!options.provider?.references) {
    return { kind: "unavailable", rel: "references", message: "No semantic references provider" };
  }

  const result = await collectCallers(options.file, options.position, options.displayName, {
    cwd: options.cwd,
    provider: { references: options.provider.references },
  });
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel: "references", message: "References unavailable" };
  }

  const targetLine = options.position.line + 1;
  const references = result.references;
  return {
    kind: "ok",
    rel: "references",
    data: {
      references,
      externalCount: result.externalCount,
      invalidLocationCount: result.invalidLocationCount,
      partialReason: result.partialReason,
      confidence: "semantic",
    },
    readNext: [
      readNextTarget(
        toDisplayPath(options.cwd, options.file),
        targetLine,
        "inspect the resolved target before editing",
      ),
      ...readNextTopSites(
        references.slice(0, options.maxResults).map((reference) => ({
          file: toDisplayPath(options.cwd, reference.file),
          line: reference.line,
        })),
        2,
        "reference",
      ),
    ],
  };
}

async function collectCalleesRelation(options: CollectRelationOptions): Promise<GraphSection> {
  if (options.anchorKind === "declaration") {
    return {
      kind: "unavailable",
      rel: "callees",
      message:
        "Callees require a name anchor. Resolve an identifier coordinate with code_resolve and retry.",
    };
  }
  if (!options.provider?.calleesAt) {
    return { kind: "unavailable", rel: "callees", message: "No structural callee provider" };
  }

  const result = await collectCallees(
    options.file,
    options.position.line + 1,
    options.position.character + 1,
    options.displayName,
    { cwd: options.cwd, provider: { calleesAt: options.provider.calleesAt } },
    undefined,
    options.calleeDepth ?? "direct",
  );
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel: "callees", message: "Callees unavailable" };
  }

  const enclosingScope = result.enclosingScope ?? {
    name: options.displayName,
    file: options.file,
    startLine: options.position.line + 1,
    endLine: options.position.line + 1,
  };
  const calls: CallEntry[] = result.callees.map((callee) => ({
    name: callee.name,
    file: callee.file,
    line: callee.line,
  }));
  return {
    kind: "ok",
    rel: "callees",
    data: { enclosingScope, calls, depth: result.depth },
    readNext: [
      readNextEnclosingScope(
        toDisplayPath(options.cwd, options.file),
        enclosingScope,
        options.position.line + 1,
      ),
    ],
  };
}

async function collectImplementationsRelation(
  options: CollectRelationOptions,
): Promise<GraphSection> {
  if (!options.provider?.implementation) {
    return {
      kind: "unavailable",
      rel: "implements",
      message: "No semantic implementations provider",
    };
  }

  const result = await collectImplementations(options.file, options.position, options.displayName, {
    cwd: options.cwd,
    provider: { implementation: options.provider.implementation },
  });
  if (result.confidence === "unavailable") {
    return { kind: "unavailable", rel: "implements", message: "Implementations unavailable" };
  }

  return {
    kind: "ok",
    rel: "implements",
    data: {
      implementations: result.implementations,
      externalCount: result.externalCount,
      invalidLocationCount: result.invalidLocationCount,
      partialReason: result.partialReason,
    },
    readNext: [],
  };
}
