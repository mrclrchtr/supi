/** Metadata document reading and format-specific parsing. */

import { constants, promises as fs } from "node:fs";
import * as path from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import { parsePom } from "./maven.ts";
import type { MetadataReadResult, ParsedDocument } from "./metadata-types.ts";
import { isRecord, issue } from "./metadata-utils.ts";
import { errorMessage, relativeDirectory } from "./paths.ts";
import { assertUnlinkedPath } from "./safe-path.ts";
import type {
  InventoryEntry,
  MetadataDocument,
  MetadataDocumentKind,
  MetadataIssue,
} from "./types.ts";

const MAX_METADATA_BYTES = 1024 * 1024;

const KIND_BY_BASENAME = new Map<string, MetadataDocumentKind>([
  ["package.json", "package-json"],
  ["pnpm-workspace.yaml", "pnpm-workspace"],
  ["pyproject.toml", "pyproject"],
  ["Cargo.toml", "cargo"],
  ["go.mod", "go-mod"],
  ["go.work", "go-work"],
  ["pom.xml", "maven-pom"],
  ["CMakeLists.txt", "cmake-lists"],
]);

interface ReadOutcome {
  readonly document: MetadataDocument;
  readonly parsed: ParsedDocument | null;
  readonly issue: MetadataIssue | null;
}

/** Read every eligible metadata file in inventory order without following links. */
export async function readMetadataDocuments(
  root: string,
  entries: readonly InventoryEntry[],
  control: CodeRequestControl | undefined,
): Promise<MetadataReadResult> {
  const documents: MetadataDocument[] = [];
  const parsed: ParsedDocument[] = [];
  const issues: MetadataIssue[] = [];
  let deadlineReached = false;
  for (const entry of entries) {
    const kind = KIND_BY_BASENAME.get(path.posix.basename(entry.path));
    if (!kind) continue;
    if (deadlineReachedAt(control)) {
      deadlineReached = true;
      break;
    }
    const outcome = await readEntry(root, entry, kind);
    documents.push(outcome.document);
    if (outcome.parsed) parsed.push(outcome.parsed);
    if (outcome.issue) issues.push(outcome.issue);
  }
  return { documents, parsed, issues, deadlineReached };
}

async function readEntry(
  root: string,
  entry: InventoryEntry,
  kind: MetadataDocumentKind,
): Promise<ReadOutcome> {
  if (entry.kind === "symlink")
    return skipped(entry.path, kind, "Symbolic-link metadata is not read.");
  const absolutePath = path.join(root, ...entry.path.split("/"));
  try {
    await assertUnlinkedPath(root, entry.path);
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      return skipped(entry.path, kind, "Symbolic-link metadata is not read.");
    }
    if (!stats.isFile()) return skipped(entry.path, kind, "Metadata path is not a regular file.");
    if (stats.size > MAX_METADATA_BYTES)
      return failed(entry.path, kind, "Metadata exceeds the 1 MiB file-size limit.");
    const file = await fs.open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const buffer = Buffer.alloc(MAX_METADATA_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_METADATA_BYTES)
        return failed(entry.path, kind, "Metadata exceeds the 1 MiB file-size limit.");
      return parseText(entry.path, kind, buffer.toString("utf8", 0, bytesRead));
    } finally {
      await file.close();
    }
  } catch (error) {
    return failed(entry.path, kind, `Could not read metadata: ${errorMessage(error)}`);
  }
}

function parseText(relativePath: string, kind: MetadataDocumentKind, text: string): ReadOutcome {
  try {
    if (kind === "package-json") {
      const value: unknown = JSON.parse(text);
      if (!isRecord(value))
        return failed(relativePath, kind, "package.json must contain an object.");
      return complete(relativePath, kind, value);
    }
    if (kind === "pnpm-workspace") {
      const document = parseDocument(text);
      if (document.errors.length > 0) {
        return failed(relativePath, kind, `Could not parse YAML: ${document.errors[0]?.message}`);
      }
      return complete(relativePath, kind, document.toJS());
    }
    if (kind === "go-mod" || kind === "go-work" || kind === "cmake-lists")
      return complete(relativePath, kind, text);
    if (kind === "maven-pom") return complete(relativePath, kind, parsePom(text));
    return complete(relativePath, kind, parseToml(text));
  } catch (error) {
    return failed(relativePath, kind, `Could not parse metadata: ${errorMessage(error)}`);
  }
}

function complete(relativePath: string, kind: MetadataDocumentKind, data: unknown): ReadOutcome {
  return {
    document: { path: relativePath, kind, status: "parsed", reason: null },
    parsed: { path: relativePath, kind, directory: relativeDirectory(relativePath), data },
    issue: null,
  };
}

function failed(relativePath: string, kind: MetadataDocumentKind, reason: string): ReadOutcome {
  return {
    document: { path: relativePath, kind, status: "failed", reason },
    parsed: null,
    issue: issue(relativePath, null, "malformed", reason),
  };
}

function skipped(relativePath: string, kind: MetadataDocumentKind, reason: string): ReadOutcome {
  return {
    document: { path: relativePath, kind, status: "skipped", reason },
    parsed: null,
    issue: issue(
      relativePath,
      null,
      reason.includes("Symbolic-link") ? "symlink" : "unsupported",
      reason,
    ),
  };
}

function deadlineReachedAt(control: CodeRequestControl | undefined): boolean {
  control?.signal?.throwIfAborted();
  const deadline = control?.deadline;
  return typeof deadline === "number" && Number.isFinite(deadline) && Date.now() >= deadline;
}
