/**
 * Shared call-site search helpers.
 *
 * Used by `code_find` AST mode and `code_find`'s structured pattern search
 * to find call sites (identifiers followed by `(`) using regex-based matching
 * with declaration-context filtering.
 */

import { readFileSync } from "node:fs";

/** A single call-site match. */
export interface CallSiteMatch {
  name: string;
  line: number;
}

/**
 * Collect call-site matches from a single file.
 *
 * Scans the file line by line, matching identifiers that are followed by
 * an opening parenthesis — but NOT preceded by declaration keywords
 * (function, class, const, let, var, type, interface, enum, abstract, async).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: regex loop + declaration filtering + call-site detection stays together
export function collectCallSitesInFile(
  absPath: string,
  matcher: (word: string) => boolean,
): CallSiteMatch[] {
  const matches: CallSiteMatch[] = [];
  try {
    const content = readFileSync(absPath, "utf-8");
    const lines = content.split("\n");
    const regex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Reset regex for each line
      regex.lastIndex = 0;
      let wordMatch = regex.exec(line);
      while (wordMatch !== null) {
        const word = wordMatch[0];
        if (matcher(word)) {
          // Check if followed by `(` (possibly with whitespace)
          const wordEnd = wordMatch.index + word.length;
          const after = line.slice(wordEnd).trimStart();
          if (after.startsWith("(")) {
            // Filter out declarations
            const before = line.slice(0, wordMatch.index).trimEnd();
            if (!isDeclarationContext(before)) {
              matches.push({ name: word, line: i + 1 });
              break; // One match per line is enough
            }
          }
        }
        wordMatch = regex.exec(line);
      }
    }
  } catch {
    // File read error — skip
  }
  return matches;
}

/** Check if the text before a matched word indicates a declaration context. */
function isDeclarationContext(before: string): boolean {
  const declKeywords =
    /(?:^|[\s;{}])(function|class|const|let|var|type|interface|enum|abstract|async)\s*$/;
  return declKeywords.test(before);
}
