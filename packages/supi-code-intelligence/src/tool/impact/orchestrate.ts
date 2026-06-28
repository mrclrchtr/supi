// Impact orchestration use-case — workflow-oriented blast-radius analysis.
//
// Thin dispatcher: validates input, resolves targets, and delegates to
// per-mode execution modules. Analysis functions live in ./analysis.ts;
// per-mode execution in ./single-impact.ts, ./file-level-impact.ts,
// and ./change-set-impact.ts.

import { existsSync } from "node:fs";
import * as path from "node:path";
import { isResolvedTargetGroup } from "../../analysis/helpers.ts";
import { resolveTarget } from "../../analysis/target/bridge.ts";
import { isTestFilePath } from "../../analysis/tests/test-discovery.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { executeChangeSetImpact } from "./change-set-impact.ts";
import { executeFileLevelImpact } from "./file-level-impact.ts";
import { unavailableImpactResult } from "./result.ts";
import { executeSingleImpact } from "./single-impact.ts";
import type { ImpactDeps, ImpactInput } from "./types.ts";

// ── Legacy helper ───────────────────────────────────────────────────────

/** Exported for backward-compatible unit-test access. Prefer `discoverTestFilesForSource` from tests.ts. */
export function findLikelyTests(
  affectedFiles: Set<string>,
  _cwd: string,
): Array<{ path: string; provenance: string }> {
  const seen = new Set<string>();
  const results: Array<{ path: string; provenance: string }> = [];

  for (const file of affectedFiles) {
    if (isTestFilePath(file)) {
      seen.add(file);
      results.push({ path: file, provenance: "name heuristic" });
    }
  }

  const remaining = [...affectedFiles].filter((f) => !seen.has(f));
  for (const sourceFile of remaining) {
    const ext = path.extname(sourceFile);
    const stem = sourceFile.slice(0, ext.length > 0 ? -ext.length : undefined);
    for (const suffix of [".test", ".spec"]) {
      const candidate = `${stem}${suffix}${ext}`;
      if (!seen.has(candidate) && existsSync(candidate)) {
        seen.add(candidate);
        results.push({ path: candidate, provenance: "companion file" });
      }
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  return results.slice(0, 3);
}

// ── Main dispatch ───────────────────────────────────────────────────────

/** Execute the shared impact use-case. */
export async function executeImpact(
  input: ImpactInput,
  deps: ImpactDeps,
): Promise<CodeIntelResult> {
  if (input.changeSetFiles && input.changeSetFiles.length > 0) {
    return executeChangeSetImpact(input, deps.cwd, deps.provider, deps.lspService);
  }

  if (input.change && !input.file && !input.symbol) {
    return unavailableImpactResult(
      "**Unavailable:** `code_impact` has insufficient evidence for a change-only request. Provide `changeSetFiles` or resolve a target with `code_resolve` first.",
      [
        "Use `code_resolve` to resolve a precise target first",
        "Provide `changeSetFiles` with the workspace-relative files in the change set",
      ],
    );
  }

  const semantic = deps.provider;

  if (!semantic) {
    return unavailableImpactResult(
      "**Error:** Impact analysis requires an active code provider (LSP). Enable LSP and retry.",
      ["Use `code_resolve` to resolve a target first"],
    );
  }

  const target = await resolveTarget(input, deps.cwd, semantic);

  if (typeof target === "string") {
    return unavailableImpactResult(target, ["Use `code_resolve` to resolve a target first"]);
  }

  if (isResolvedTargetGroup(target)) {
    return executeFileLevelImpact(target, input, deps.cwd, semantic, deps.lspService);
  }

  const symbolName =
    target.name ?? `symbol at ${path.relative(deps.cwd, target.file)}:${target.displayLine}`;
  return executeSingleImpact(target, symbolName, input, deps.cwd, semantic, deps.lspService);
}
