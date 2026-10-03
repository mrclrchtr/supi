import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  CodeRequestControl,
  FileEdit,
  OutlineData,
  RefactorOperation,
  RefactorResult,
  StructuralProvider,
  WorkspaceEdit,
} from "@mrclrchtr/supi-code-runtime/api";
import { isCodeRequestInterruption } from "@mrclrchtr/supi-code-runtime/api";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import { canonicalFileDeclarationKind } from "../target/identity.ts";
import { createLogicalLineIndex } from "./position.ts";

export interface LatexSectionTitleLocation {
  readonly file: string;
  readonly name: string;
  readonly range: FileEdit["range"];
  readonly sourceFingerprint: string;
}

const UNSUPPORTED_SECTION_RENAME_REASON =
  "LSP request textDocument/rename failed: Rename is unavailable at the requested position.";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UNSUPPORTED_TITLE_CHARACTERS = /[\\{}%$#&^~_[\]()=]/u;

/** Check whether a target is a LaTeX section symbol. */
export function isLatexSectionTarget(
  target: Pick<TargetStoreEntry, "file" | "kind" | "name">,
): boolean {
  return canonicalFileDeclarationKind(target.file, target.kind, target.name) === "latex-section";
}

/** Find a safe literal title that still matches the resolved source snapshot. */
export async function findLatexSectionTitleLocation(input: {
  readonly target: TargetStoreEntry;
  readonly structural: Pick<StructuralProvider, "outline"> | null;
  readonly control?: CodeRequestControl;
}): Promise<LatexSectionTitleLocation | { readonly reason: string }> {
  const { target, structural, control } = input;
  const targetReason = validateSectionTarget(target);
  if (targetReason) return { reason: targetReason };
  if (!structural)
    return { reason: "Tree-sitter section evidence is not available for this target." };

  const before = readSourceSnapshot(target.file);
  if (!before) return { reason: "The LaTeX source file could not be read." };
  if (before.fingerprint !== target.fileFingerprint) {
    return { reason: "The LaTeX source changed after the target was resolved." };
  }

  try {
    const checked = await readStableSectionOutline(target, structural.outline, before, control);
    if ("reason" in checked) return checked;
    return createTitleLocation(target, checked.outline, checked.snapshot);
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    return { reason: "Tree-sitter could not verify the current LaTeX section title." };
  }
}

/** Check whether a provider edit changes only the exact section title. */
export function isExactLatexSectionTitleEdit(
  edits: WorkspaceEdit,
  location: LatexSectionTitleLocation,
  newName: string,
): boolean {
  if (edits.edits.length !== 1) return false;
  const [edit] = edits.edits;
  return (
    edit !== undefined &&
    edit.file === location.file &&
    edit.newText === newName &&
    edit.range.start.line === location.range.start.line &&
    edit.range.start.character === location.range.start.character &&
    edit.range.end.line === location.range.end.line &&
    edit.range.end.character === location.range.end.character
  );
}

/** Build a local title-only plan from the routed LSP authority. */
export function createLatexSectionTitleEdit(input: {
  readonly location: LatexSectionTitleLocation;
  readonly newName: string;
  readonly documentVersion: number | null;
  readonly authorizedMutationRoots: readonly string[];
}):
  | {
      readonly edits: WorkspaceEdit;
      readonly authorizedMutationRoots: string[];
    }
  | { readonly reason: string } {
  const { location, newName, documentVersion, authorizedMutationRoots } = input;
  if (newName === location.name || !isSafeNewTitleText(newName)) {
    return {
      reason: "The local LaTeX rename accepts one plain-text title supported by the parser.",
    };
  }
  if (authorizedMutationRoots.length === 0) {
    return {
      reason: "The routed LSP client did not authorize a mutation root for this title edit.",
    };
  }

  const edit: FileEdit = {
    file: location.file,
    range: location.range,
    newText: newName,
  };
  return {
    edits: {
      edits: [edit],
      documentPreconditions: [
        documentVersion === null
          ? { file: location.file, kind: "disk-content" }
          : { file: location.file, kind: "open-document-version", version: documentVersion },
      ],
    },
    authorizedMutationRoots: [...authorizedMutationRoots],
  };
}

/** Check and refine one LaTeX section rename result. */
export async function refineLatexSectionRenameResult(input: {
  readonly operation: RefactorOperation;
  readonly result: RefactorResult;
  readonly target: TargetStoreEntry;
  readonly file: string;
  readonly newName: string | undefined;
  readonly structural: Pick<StructuralProvider, "outline"> | null;
  readonly documentVersionReader?: (file: string) => number | null;
  readonly control?: CodeRequestControl;
}): Promise<{
  result: RefactorResult;
  evidenceSource: "semantic" | "structural";
  sourceFingerprint?: string;
}> {
  const semantic = { result: input.result, evidenceSource: "semantic" as const };
  if (
    input.operation !== "rename_symbol" ||
    !isLatexSectionTarget(input.target) ||
    input.result.kind === "ambiguous" ||
    (input.result.kind === "unavailable" &&
      input.result.reason !== UNSUPPORTED_SECTION_RENAME_REASON)
  ) {
    return semantic;
  }

  const location = await findLatexSectionTitleLocation({
    target: input.target,
    structural: input.structural,
    control: input.control,
  });
  if ("reason" in location) return unavailableSectionRename(location.reason);
  if (input.result.kind === "precise") {
    return isExactLatexSectionTitleEdit(input.result.edits, location, input.newName ?? "")
      ? { ...semantic, sourceFingerprint: location.sourceFingerprint }
      : unavailableSectionRename(
          "The LSP rename did not return one edit for the exact section title. No rename was planned.",
        );
  }

  const versionReader = input.documentVersionReader;
  if (!versionReader) {
    return unavailableSectionRename(
      "The current document state cannot be checked for a safe title edit.",
    );
  }
  const localEdit = createLatexSectionTitleEdit({
    location,
    newName: input.newName ?? "",
    documentVersion: versionReader(input.file),
    authorizedMutationRoots: input.result.authorizedMutationRoots ?? [],
  });
  if ("reason" in localEdit) return unavailableSectionRename(localEdit.reason);
  return {
    result: {
      kind: "precise",
      edits: localEdit.edits,
      authorizedMutationRoots: localEdit.authorizedMutationRoots,
    },
    evidenceSource: "structural",
    sourceFingerprint: location.sourceFingerprint,
  };
}

function unavailableSectionRename(reason: string): {
  result: RefactorResult;
  evidenceSource: "semantic";
} {
  return { result: { kind: "unavailable", reason }, evidenceSource: "semantic" };
}

function validateSectionTarget(target: TargetStoreEntry): string | null {
  if (!isLatexSectionTarget(target) || target.name === null || target.anchorKind !== "name") {
    return "The target is not an anchored LaTeX section title.";
  }
  if (!target.declarationPosition) return "The target has no verified section declaration anchor.";
  if (!SHA256_PATTERN.test(target.fileFingerprint)) {
    return "The resolved LaTeX target has no verified source fingerprint.";
  }
  return null;
}

async function readStableSectionOutline(
  target: TargetStoreEntry,
  outline: StructuralProvider["outline"],
  before: { readonly source: string; readonly fingerprint: string },
  control?: CodeRequestControl,
): Promise<
  | {
      readonly outline: readonly OutlineData[];
      readonly snapshot: { readonly source: string; readonly fingerprint: string };
    }
  | { readonly reason: string }
> {
  const result = await outline(target.file, control);
  const after = readSourceSnapshot(target.file);
  if (!after) return { reason: "The LaTeX source file could not be read." };
  if (after.fingerprint !== before.fingerprint) {
    return { reason: "The LaTeX source changed while Tree-sitter checked the section." };
  }
  if (result.kind !== "success") {
    return { reason: "Tree-sitter could not inspect the LaTeX section." };
  }
  return { outline: result.data, snapshot: after };
}

function createTitleLocation(
  target: TargetStoreEntry,
  outline: readonly OutlineData[],
  snapshot: { readonly source: string; readonly fingerprint: string },
): LatexSectionTitleLocation | { readonly reason: string } {
  const matches = findSectionMatches(outline, target);
  if (matches.length !== 1) {
    return { reason: "Tree-sitter did not find one exact title for this LaTeX section." };
  }
  const item = matches[0];
  if (!item?.nameAnchor || !item.nameEndAnchor) {
    return { reason: "The LaTeX section title contains TeX commands or mixed content." };
  }

  const start = { line: item.nameAnchor.line - 1, character: item.nameAnchor.character - 1 };
  const end = { line: item.nameEndAnchor.line - 1, character: item.nameEndAnchor.character - 1 };
  const literalTitle = readSourceRange(snapshot.source, start, end);
  if (
    !literalTitle ||
    !isSafeExistingTitleText(literalTitle) ||
    normalizeTitleWhitespace(literalTitle) !== target.name
  ) {
    return { reason: "The current source does not match one plain literal section title." };
  }
  return {
    file: target.file,
    name: target.name,
    range: { start, end },
    sourceFingerprint: snapshot.fingerprint,
  };
}

function findSectionMatches(
  items: readonly OutlineData[],
  target: TargetStoreEntry,
): OutlineData[] {
  const declarationPosition = target.declarationPosition;
  if (!declarationPosition) return [];
  const matches: OutlineData[] = [];
  for (const item of items) {
    if (
      canonicalFileDeclarationKind(target.file, item.kind, item.name) === "latex-section" &&
      item.name === target.name &&
      item.startLine === declarationPosition.line + 1 &&
      item.startCharacter === declarationPosition.character + 1 &&
      item.nameAnchor?.line === target.displayLine &&
      item.nameAnchor?.character === target.displayCharacter &&
      item.nameEndAnchor !== undefined
    ) {
      matches.push(item);
    }
    matches.push(...findSectionMatches(item.children ?? [], target));
  }
  return matches;
}

function readSourceRange(
  source: string,
  start: { readonly line: number; readonly character: number },
  end: { readonly line: number; readonly character: number },
): string | null {
  try {
    const lineIndex = createLogicalLineIndex(source);
    return source.slice(lineIndex.offsetAt(start), lineIndex.offsetAt(end));
  } catch {
    return null;
  }
}

function readSourceSnapshot(file: string): { source: string; fingerprint: string } | null {
  try {
    const bytes = readFileSync(file);
    return {
      source: bytes.toString("utf8"),
      fingerprint: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    return null;
  }
}

function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isSafeExistingTitleText(value: string): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !UNSUPPORTED_TITLE_CHARACTERS.test(value) &&
    !hasUnsafeControlCharacter(value, true)
  );
}

function isSafeNewTitleText(value: string): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !UNSUPPORTED_TITLE_CHARACTERS.test(value) &&
    !hasUnsafeControlCharacter(value, false)
  );
}

function hasUnsafeControlCharacter(value: string, allowWhitespace: boolean): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (!allowWhitespace && /\s/u.test(character) && character !== " ") return true;
    if (code === undefined || (code >= 0x20 && code !== 0x7f)) continue;
    if (allowWhitespace && (code === 0x09 || code === 0x0a || code === 0x0d)) continue;
    return true;
  }
  return false;
}
