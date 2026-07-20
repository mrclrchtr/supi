import { uriToFile } from "@mrclrchtr/supi-core/path";

/** Minimal semantic location shape used to remove a declaration from references. */
export interface HasLspPosition {
  uri: string;
  range: { start: { line: number; character: number } };
}

/** Exclude the target declaration from provider references. */
export function filterOutDeclaration<T extends HasLspPosition>(
  references: T[],
  targetFile: string,
  targetPosition: { line: number; character: number },
): T[] {
  return references.filter((reference) => {
    if (uriToFile(reference.uri) !== targetFile) return true;
    const start = reference.range.start;
    return start.line !== targetPosition.line || start.character !== targetPosition.character;
  });
}
