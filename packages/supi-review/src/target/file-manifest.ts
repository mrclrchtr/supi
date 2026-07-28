export interface FileManifestOptions {
  maxFiles?: number;
  maxCharacters?: number;
}

/** Render a deterministic bounded path manifest with an explicit omission count. */
export function buildFileManifest(files: string[], options: FileManifestOptions = {}): string[] {
  const maxFiles = options.maxFiles ?? 200;
  const maxCharacters = options.maxCharacters ?? 8_000;
  const lines: string[] = [];
  let size = 0;
  for (const file of files) {
    const line = `- ${JSON.stringify(file)}`;
    if (lines.length >= maxFiles || size + line.length + 1 > maxCharacters - 100) break;
    lines.push(line);
    size += line.length + 1;
  }
  const omitted = files.length - lines.length;
  if (omitted > 0) lines.push(`- … ${omitted} additional file(s) omitted; use list_review_changes`);
  return lines;
}
