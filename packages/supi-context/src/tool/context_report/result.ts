import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { ContextAnalysis } from "../../analysis.ts";
import { type ContextPressureSnapshot, createContextPressureSnapshot } from "../../capacity.ts";
import type {
  ContextReportInlineResult,
  ContextReportOutput,
  ContextReportSnapshot,
} from "./result-schema.ts";

export interface ContextToolConciseDetails {
  mode: "concise";
  snapshot: ContextPressureSnapshot;
}

export interface ContextToolFullDetails {
  mode: "full";
  analysis: ContextAnalysis;
}

/** Mode-specific details retained separately for TUI rendering and reconstruction. */
export type ContextToolDetails = ContextToolConciseDetails | ContextToolFullDetails;

/** Assemble the concise-mode model-facing and native result without diagnostic analysis. */
export function buildConciseResult(
  snapshot: ContextPressureSnapshot,
): AgentToolResult<ContextToolConciseDetails> & { structuredContent: ContextReportSnapshot } {
  const data = { ...snapshot };
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    details: { mode: "concise", snapshot },
  };
}

/**
 * Project existing attribution facts without reconciling overlapping estimates.
 * The complete compact public result alone determines whether attribution spills;
 * the human report, including excluded text, remains available only in details.
 */
export async function buildFullResult(
  analysis: ContextAnalysis,
): Promise<AgentToolResult<ContextToolFullDetails> & { structuredContent: ContextReportOutput }> {
  const snapshot = createContextPressureSnapshot(analysis.modelName, analysis);
  const full: ContextReportInlineResult = {
    ...snapshot,
    attribution: {
      scaled: analysis.scaled,
      categories: analysis.categories,
      systemPromptBreakdown: analysis.systemPromptBreakdown,
      injectedFiles: analysis.injectedFiles,
      toolDefinitions: {
        count: analysis.toolDefinitions.count,
        tokens: analysis.toolDefinitions.tokens,
        tools: analysis.toolDefinitions.tools.map(({ name, tokens }) => ({ name, tokens })),
      },
    },
  };
  let data: ContextReportOutput = full;
  let text = JSON.stringify(full);
  const size = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  if (size.truncated) {
    const outputDir = await mkdtemp(join(tmpdir(), "supi-context-"));
    const path = join(outputDir, "context-usage-report.json");
    await writeFile(path, text, "utf8");
    data = { ...snapshot, attributionFile: { path, bytes: Buffer.byteLength(text, "utf8") } };
    text = JSON.stringify(data);
  }
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
    details: { mode: "full", analysis },
  };
}
