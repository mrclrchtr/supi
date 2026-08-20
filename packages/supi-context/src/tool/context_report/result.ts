import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { ContextAnalysis } from "../../analysis.ts";
import type { ContextPressureSnapshot } from "../../capacity.ts";

export interface ContextToolConciseDetails {
  mode: "concise";
  snapshot: ContextPressureSnapshot;
}

export interface ContextToolFullDetails {
  mode: "full";
  analysis: ContextAnalysis;
}

/** Mode-specific details returned to the agent and mirrored for TUI rendering. */
export type ContextToolDetails = ContextToolConciseDetails | ContextToolFullDetails;

interface TruncatedOutputEnvelope {
  truncated: true;
  fullOutputPath: string;
  totalLines: number;
  totalBytes: number;
  maxLines: number;
  maxBytes: number;
}

/**
 * Serialize a diagnostic report without ever returning invalid partial JSON.
 *
 * When Pi's normal tool-output limits would truncate the report, the complete
 * compact JSON is stored in a temporary file and the agent receives a small,
 * valid JSON envelope pointing to it instead.
 */
export async function serializeFullContextAnalysis(analysis: ContextAnalysis): Promise<string> {
  const fullJson = JSON.stringify(analysis);
  const truncation = truncateHead(fullJson, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) {
    return fullJson;
  }

  const outputDir = await mkdtemp(join(tmpdir(), "supi-context-"));
  const fullOutputPath = join(outputDir, "context-usage-report.json");
  await writeFile(fullOutputPath, fullJson, "utf8");

  const envelope: TruncatedOutputEnvelope = {
    truncated: true,
    fullOutputPath,
    totalLines: truncation.totalLines,
    totalBytes: truncation.totalBytes,
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  };
  return JSON.stringify(envelope);
}
