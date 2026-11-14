/**
 * Candidate selection: the one public result shape for target-selection
 * outcomes (disambiguation and Symbol-kind mismatch) shared by code_graph,
 * code_resolve, and code_orientation.
 *
 * The module owns the markdown, display section, status, message, and default
 * next queries. Tools keep their own details type and structured content and
 * may supply only recovery wording.
 */
import {
  type EvidenceListMetadata,
  type EvidenceNoun,
  rekeyEvidence,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import { createToolDisplaySection } from "./display.ts";
import type { ToolDisplaySection } from "./types.ts";

/** Candidate fields used by target-selection rows. */
export interface CandidateRowData {
  readonly targetId: string;
  readonly name: string;
  readonly kind: string | null;
  readonly file: string;
  readonly line: number;
  readonly character: number;
}

/** One target candidate as the session reports it, with an absolute file. */
export interface SelectionCandidate extends CandidateRowData {
  readonly container: string | null;
  readonly rank: number;
  readonly anchorKind?: AnchorKind;
}

/** Target-selection outcome shared by the target-taking session workflows. */
export type CandidateSelectionOutcome<C extends SelectionCandidate = SelectionCandidate> =
  | {
      readonly kind: "disambiguation";
      readonly candidates: readonly C[];
      readonly candidateEvidence: EvidenceListMetadata;
    }
  | {
      readonly kind: "kind-mismatch";
      readonly requestedKind: string;
      readonly candidates: readonly C[];
      readonly candidateEvidence: EvidenceListMetadata;
    };

/** Public candidate evidence key for one tool. */
export type CandidateSelectionKey =
  | "graph.candidates"
  | "resolve.candidates"
  | "orientation.candidates";

/** Inputs for {@link assembleCandidateSelection}. */
export interface CandidateSelectionInput<C extends SelectionCandidate> {
  readonly outcome: CandidateSelectionOutcome<C>;
  readonly key: CandidateSelectionKey;
  readonly cwd: string;
  /** Tool-specific next step replacing the default recovery wording. */
  readonly recovery?: string;
}

/** Assembled candidate selection; tools project it into their own details and schema. */
export interface CandidateSelection<C extends SelectionCandidate> {
  readonly content: string;
  /** Section title: "Near matches" for a Symbol-kind mismatch, else "Candidates". */
  readonly title: string;
  /** Candidates with display-relative file paths, in rank order. */
  readonly candidates: readonly C[];
  /** Candidate Evidence list re-keyed to the tool's public key. */
  readonly evidence: EvidenceListMetadata;
  readonly displaySections: readonly ToolDisplaySection[];
  /** Selection is not invalid usage, including for a Symbol-kind mismatch. */
  readonly status: "disambiguation";
  readonly message: string;
  readonly nextQueries: readonly string[];
}

const CANDIDATE_NOUN: EvidenceNoun = { one: "candidate", other: "candidates" };
const DISAMBIGUATION_RECOVERY =
  "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind";
const MISMATCH_RECOVERY =
  "Retry without symbolKind, use an observed provider kind, or choose a near-match handle";

/** Assemble the canonical result for a target-selection outcome. */
export function assembleCandidateSelection<C extends SelectionCandidate>(
  input: CandidateSelectionInput<C>,
): CandidateSelection<C> {
  const { outcome, key, cwd } = input;
  const mismatch = outcome.kind === "kind-mismatch";
  const candidates = outcome.candidates.map((candidate) => ({
    ...candidate,
    file: toDisplayPath(cwd, candidate.file),
  }));
  const evidence = rekeyEvidence(outcome.candidateEvidence, key);
  const recovery = input.recovery ?? (mismatch ? MISMATCH_RECOVERY : DISAMBIGUATION_RECOVERY);
  const title = mismatch ? "Near matches" : "Candidates";

  const lines = mismatch
    ? [`# No target matched provider kind \`${outcome.requestedKind}\``, "", "Near matches:", ""]
    : ["# Multiple targets match", ""];
  for (const candidate of candidates) lines.push(formatCandidateMarkdownRow(candidate));
  const disclosure = renderEvidenceListMetadataDisclosure(evidence, CANDIDATE_NOUN);
  if (disclosure) lines.push("", disclosure);
  lines.push("", `${recovery}.`);

  return Object.freeze({
    content: lines.join("\n"),
    title,
    candidates,
    evidence,
    displaySections: [
      createToolDisplaySection({
        key,
        title,
        items: candidates,
        evidence,
        format: (candidate: C) => formatCandidateRow(candidate),
      }),
    ],
    status: "disambiguation" as const,
    message: mismatch
      ? `No target matched provider kind ${outcome.requestedKind}.`
      : "Multiple target matches require one candidate.",
    nextQueries: [recovery],
  });
}

/** Plain handle-first candidate row for TUI display sections and fallbacks. */
export function formatCandidateRow(candidate: CandidateRowData): string {
  return `${candidate.targetId} — ${candidate.name} (${candidate.kind ?? "unknown"}) at ${candidate.file}:${candidate.line}:${candidate.character}`;
}

function formatCandidateMarkdownRow(candidate: SelectionCandidate): string {
  const container = candidate.container ? ` in \`${candidate.container}\`` : "";
  return `- \`${candidate.targetId}\` — **${candidate.name}** (\`${candidate.kind ?? "unknown"}\`)${container} at \`${candidate.file}\`:${candidate.line}:${candidate.character}`;
}
