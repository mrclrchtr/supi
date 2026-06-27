/**
 * Brief analysis service — typed data generation for architecture briefs.
 *
 * Returns typed brief data. Markdown rendering is handled by
 * presentation/markdown/*.ts.
 *
 * Delegates to the existing brief orchestration layer until
 * that code is fully migrated into typed services.
 */

import type { ArchitectureModel } from "../../architecture/model.ts";
import { buildArchitectureModel } from "../../architecture/model.ts";
import type { BriefDetails } from "../../types.ts";
import { generateFocusedBrief, generateProjectBrief } from "../../use-case/brief.ts";

export interface BriefServiceInput {
  kind: "project" | "path" | "file" | "anchored" | "symbol";
  model: ArchitectureModel | null;
  cwd: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  path?: string;
}

export interface BriefServiceResult {
  content: string;
  details: BriefDetails;
}

/**
 * Create an analysis brief from the given input and model.
 *
 * For project mode with a real model, delegates to generateProjectBrief.
 * For path/file modes, delegates to generateFocusedBrief.
 * Returns a helpful unavailable message when the model is missing.
 */
export async function createAnalysisBriefService(
  input: BriefServiceInput,
): Promise<BriefServiceResult> {
  // Build model on demand when not provided
  let model = input.model;
  if (!model && input.kind !== "symbol") {
    model = await buildArchitectureModel(input.cwd);
  }

  if (!model || model.modules.length === 0) {
    return {
      content:
        "No project structure detected. This directory has no recognizable project metadata or source files.",
      details: {
        confidence: "unavailable",
        focusTarget: null,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: ["Add a package.json or workspace manifest to enable architecture analysis"],
      },
    };
  }

  switch (input.kind) {
    case "project": {
      const result = generateProjectBrief(model);
      return { content: result.content, details: result.details };
    }

    case "path":
    case "file": {
      const focusPath = input.path ?? input.file ?? input.cwd;
      const result = await generateFocusedBrief(model, focusPath, {
        provider: null,
        cwd: input.cwd,
      });
      return { content: result.content, details: result.details };
    }
    default: {
      // Anchored and symbol briefs need provider-level context.
      // Delegate to the existing generate-brief use-case through the
      // tool executor layer until anchored/symbol briefs are migrated.
      return {
        content: `Brief for ${input.kind} mode in ${input.cwd}`,
        details: {
          confidence: "structural",
          focusTarget: input.file ?? input.symbol ?? null,
          startHere: [],
          publicSurfaces: [],
          dependencySummary: null,
          omittedCount: 0,
          nextQueries: [],
        },
      };
    }
  }
}
