import { readdirSync } from "node:fs";
import * as path from "node:path";
import {
  type CodeRequestControl,
  type CodeResult,
  type ConfidenceMode,
  isCodeRequestInterruption,
  type SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { EvidenceListMetadata, EvidencePartialReason } from "../../analysis/evidence.ts";
import { createEvidenceList } from "../../analysis/evidence.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type {
  OrientationProvenance,
  OrientationResultData,
  OrientationSectionData,
} from "../orientation-types.ts";

/** Mutable collection state kept private to context-Oriented fact assembly. */
export interface ContextOrientationBuilder {
  readonly title: string;
  readonly sections: OrientationSectionData[];
  readonly notes: string[];
  readonly maxResults: number;
}

/** Inputs for one bounded Orientation evidence section. */
export interface ListSectionInput<T> {
  readonly key: string;
  readonly title: string;
  readonly items: readonly T[];
  readonly render: (item: T) => string;
  readonly confidence: ConfidenceMode;
  readonly provenance: readonly OrientationProvenance[];
  readonly status?: "complete" | "partial";
  readonly reason?: string | null;
  readonly unknownRemainder?: boolean;
  readonly partialReason?: EvidencePartialReason;
  readonly errorRanges?: readonly SourceRange[];
  readonly facts?: (items: readonly T[]) => import("./facts.ts").OrientationFacts;
}

/** Start a context-Oriented document with one factual focus title. */
export function createBuilder(maxResults: number, title: string): ContextOrientationBuilder {
  return {
    title,
    sections: [],
    notes: [],
    maxResults,
  };
}

/** Add one bounded evidence list and matching section facts. */
export function appendList<T>(
  builder: ContextOrientationBuilder,
  input: ListSectionInput<T>,
): void {
  const list = createEvidenceList({
    key: input.key,
    items: [...input.items],
    maxResults: builder.maxResults,
  });
  const metadata: EvidenceListMetadata = input.unknownRemainder
    ? {
        ...list.metadata,
        totalCount: null,
        partialReason: input.partialReason ?? "filesystem-error",
        ...(input.reason ? { partialMessage: input.reason } : {}),
      }
    : list.metadata;
  builder.sections.push({
    key: input.key,
    title: input.title,
    status: input.status ?? "complete",
    reason: input.reason ?? null,
    confidence: input.confidence,
    provenance: input.provenance,
    evidenceLists: [{ ...metadata, key: input.key }],
    items: list.items.map((item) => ({ kind: "list-item", text: input.render(item) })),
    ...(input.facts ? { facts: input.facts(list.items) } : {}),
    ...(input.errorRanges ? { errorRanges: [...input.errorRanges] } : {}),
  });
}

/** Add an unavailable section without manufacturing an absence claim. */
export function appendUnavailable(
  builder: ContextOrientationBuilder,
  input: {
    key: string;
    title: string;
    reason: string;
    provenance: readonly OrientationProvenance[];
  },
): void {
  builder.sections.push({
    key: input.key,
    title: input.title,
    status: "unavailable",
    reason: input.reason,
    confidence: "unavailable",
    provenance: input.provenance,
    evidenceLists: [],
    items: [],
  });
}

/** Collect direct regular-file and directory names from one filesystem level. */
export function appendDirectoryEntries(
  builder: ContextOrientationBuilder,
  directory: string,
  cwd: string,
): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    const provenance = [filesystemProvenance(cwd, directory)];
    appendUnavailable(builder, {
      key: "filesystem.files",
      title: "Direct regular files",
      reason: String(error),
      provenance,
    });
    appendUnavailable(builder, {
      key: "filesystem.directories",
      title: "Direct directories",
      reason: String(error),
      provenance,
    });
    return;
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const provenance = [filesystemProvenance(cwd, directory)];
  appendList(builder, {
    key: "filesystem.files",
    title: "Direct regular files",
    items: files,
    render: (file) => `\`${file}\``,
    confidence: "unavailable",
    provenance,
  });
  appendList(builder, {
    key: "filesystem.directories",
    title: "Direct directories",
    items: directories,
    render: (child) => `\`${child}/\``,
    confidence: "unavailable",
    provenance,
  });
}

/** Collect explicit outline/import/export observations from the structural provider. */
export async function appendStructuralFileFacts(
  builder: ContextOrientationBuilder,
  provider: CodeProvider | null,
  file: string,
  requestControl?: CodeRequestControl,
): Promise<void> {
  if (!provider) {
    appendUnavailableStructuralSections(builder);
    return;
  }

  await appendStructuralList(builder, {
    key: "structural.outline",
    title: "Provider outline",
    collect: () => provider.outline(file, requestControl),
    requestControl,
    render: (item) => `\`${item.name}\` (${item.kind}, L${item.startLine}–L${item.endLine})`,
    facts: (items) => ({
      outline: items.map(({ name, kind, startLine, startCharacter, endLine, endCharacter }) => ({
        name,
        kind,
        startLine,
        startCharacter,
        endLine,
        endCharacter,
      })),
    }),
  });
  await appendStructuralList(builder, {
    key: "structural.imports",
    title: "Provider imports",
    collect: () => provider.imports(file, requestControl),
    requestControl,
    render: (item) => `\`${item.moduleSpecifier}\``,
    facts: (items) => ({
      imports: items.map(
        ({ moduleSpecifier, startLine, startCharacter, endLine, endCharacter }) => ({
          moduleSpecifier,
          startLine,
          startCharacter,
          endLine,
          endCharacter,
        }),
      ),
    }),
  });
  await appendStructuralList(builder, {
    key: "structural.exports",
    title: "Provider exports",
    collect: () => provider.exports(file, requestControl),
    requestControl,
    render: (item) => `\`${item.name}\` (${item.kind})`,
    facts: (items) => ({
      exports: items.map(
        ({ name, kind, startLine, startCharacter, endLine, endCharacter, moduleSpecifier }) => ({
          name,
          kind,
          startLine,
          startCharacter,
          endLine,
          endCharacter,
          ...(moduleSpecifier === undefined ? {} : { moduleSpecifier }),
        }),
      ),
    }),
  });
}

function appendUnavailableStructuralSections(builder: ContextOrientationBuilder): void {
  for (const [key, title] of [
    ["structural.outline", "Provider outline"],
    ["structural.imports", "Provider imports"],
    ["structural.exports", "Provider exports"],
  ] as const) {
    appendUnavailable(builder, {
      key,
      title,
      reason: "Structural provider unavailable.",
      provenance: [{ source: "structural", capability: "tree-sitter" }],
    });
  }
}

async function appendStructuralList<T>(
  builder: ContextOrientationBuilder,
  input: {
    key: string;
    title: string;
    collect: () => Promise<CodeResult<T[]>>;
    render: (item: T) => string;
    facts: (items: readonly T[]) => import("./facts.ts").OrientationFacts;
    requestControl?: CodeRequestControl;
  },
): Promise<void> {
  let result: CodeResult<T[]>;
  try {
    result = await input.collect();
  } catch (error) {
    if (isCodeRequestInterruption(error, input.requestControl)) throw error;
    appendUnavailable(builder, {
      key: input.key,
      title: input.title,
      reason: `Structural provider failed: ${String(error)}`,
      provenance: [{ source: "structural", capability: "tree-sitter" }],
    });
    return;
  }
  if (result.kind !== "success" && result.kind !== "partial") {
    appendUnavailable(builder, {
      key: input.key,
      title: input.title,
      reason: result.message,
      provenance: [{ source: "structural", capability: "tree-sitter" }],
    });
    return;
  }
  const recoveryLocations =
    result.kind === "partial"
      ? result.errorRanges.map((range) => `L${range.start.line + 1}:${range.start.character + 1}`)
      : [];
  const recoveryReason =
    result.kind === "partial"
      ? `${result.reason}${recoveryLocations.length ? ` Error locations: ${recoveryLocations.join(", ")}.` : ""}`
      : null;
  appendList(builder, {
    key: input.key,
    title: input.title,
    items: result.data,
    render: input.render,
    facts: input.facts,
    confidence: "structural",
    provenance: [{ source: "structural", capability: "tree-sitter" }],
    ...(result.kind === "partial"
      ? {
          status: "partial" as const,
          reason: recoveryReason,
          unknownRemainder: true,
          partialReason: "provider-limited" as const,
          errorRanges: result.errorRanges,
        }
      : {}),
  });
}

/** Add bounded current diagnostic snapshot facts without claiming whole-workspace coverage. */
export function appendPrioritySignals(
  builder: ContextOrientationBuilder,
  input: {
    scope: string;
    isFile: boolean;
    cwd: string;
    lspRuntime: WorkspaceLspRuntimeState;
  },
): void {
  if (input.lspRuntime.kind !== "ready") return;
  const scopePath = path.resolve(input.scope);
  const snapshot = input.lspRuntime.runtime.getOutstandingDiagnosticSummary(2);
  const entries = snapshot.entries.filter((entry) => {
    const file = path.resolve(input.cwd, entry.file);
    return input.isFile ? file === scopePath : isWithinOrEqual(scopePath, file);
  });
  if (entries.length === 0) return;

  appendList(builder, {
    key: "diagnostics.snapshot",
    title: "Priority Signals",
    items: entries,
    render: (entry) => {
      const parts = [`${entry.total} total`];
      if (entry.errors > 0) parts.push(`${entry.errors} errors`);
      if (entry.warnings > 0) parts.push(`${entry.warnings} warnings`);
      return `Diagnostics: \`${displayPath(input.cwd, entry.file)}\` (${parts.join(", ")})`;
    },
    confidence: "semantic",
    facts: (items) => ({
      diagnosticSnapshot: items.map(({ file, total, errors, warnings }) => ({
        file: displayPath(input.cwd, file),
        total,
        errors,
        warnings,
      })),
      snapshotCurrent: snapshot.current,
    }),
    provenance: [{ source: "semantic", capability: "LSP diagnostic snapshot" }],
    status: "partial",
    reason: snapshot.current
      ? "This is the current LSP snapshot, not a complete diagnostic scan; use code_health for diagnostic status."
      : "This LSP snapshot was invalidated by a document or workspace change; use code_health with refresh:true before relying on it.",
  });
}

/** Finalize blocks and per-list omission totals into one Orientation result. */
export function resultData(
  builder: ContextOrientationBuilder,
  focus: string | null,
  nextQueries: string[],
): OrientationResultData {
  const omittedCount = builder.sections.reduce(
    (total, section) =>
      total + section.evidenceLists.reduce((sum, list) => sum + (list.omittedCount ?? 0), 0),
    0,
  );
  return {
    title: builder.title,
    notes: builder.notes,
    sections: builder.sections,
    confidence: highestConfidence(builder.sections),
    focusTarget: focus,
    requestedSections: [],
    renderedSections: builder.sections.map((section) => section.key),
    omittedCount,
    nextQueries,
    readNext: [],
  };
}

export function filesystemProvenance(cwd: string, target: string): OrientationProvenance {
  return { source: "filesystem", detail: displayPath(cwd, target) };
}

export function displayPath(cwd: string, target: string): string {
  const relative = path.relative(cwd, path.resolve(target)).replaceAll(path.sep, "/");
  if (relative.length === 0) return ".";
  return relative.startsWith("../") || relative === ".." ? target : relative;
}

export function formatManifestValue(value: unknown): string {
  if (typeof value === "string") return `\`${value}\``;
  const serialized = JSON.stringify(value);
  return `\`${serialized ?? String(value)}\``;
}

function highestConfidence(sections: readonly OrientationSectionData[]): ConfidenceMode {
  if (sections.some((section) => section.confidence === "semantic")) return "semantic";
  if (sections.some((section) => section.confidence === "structural")) return "structural";
  return "unavailable";
}
