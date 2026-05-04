/**
 * Shared utilities for slop detection scripts.
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Use via: pnpm exec jiti <script>.ts <file>
 */

import { readFileSync } from "node:fs";

/** Read a file as UTF-8 string. */
export function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Strip fenced code blocks from markdown content. */
export function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "");
}

/** Count non-empty lines. */
export function countNonEmpty(content: string): number {
  return content.split("\n").filter((l) => l.trim().length > 0).length;
}

/** Count words in text. */
export function countWords(text: string): number {
  return text.split(/[\s\n]+/).filter((w) => w.length > 0).length;
}

/** Count sentences in text (naive: split on sentence-ending punctuation). */
export function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
}

/** Count paragraphs (blocks separated by blank lines). */
export function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;
}

/** Count em dashes in text. */
export function countEmDashes(text: string): number {
  return (text.match(/—/g) || []).length;
}

/** Count semicolons in text. */
export function countSemicolons(text: string): number {
  return (text.match(/;/g) || []).length;
}

/** Count colons in text. */
export function countColons(text: string): number {
  return (text.match(/:/g) || []).length;
}

/** Count arrow connectors in prose (excluding code blocks). Returns count. */
export function countArrowConnectors(content: string): number {
  const prose = stripCodeBlocks(content);
  return (prose.match(/\s->\s|→/g) || []).length;
}

/** Count plus-sign conjunctions in prose (excluding code blocks). */
export function countPlusSigns(content: string): number {
  const prose = stripCodeBlocks(content);
  return (prose.match(/\s\+\s/g) || []).length;
}

/** Count bullet list items (lines starting with -, *, +). */
export function countBulletLines(content: string): number {
  return (content.match(/^[ \t]*[-*+]\s/gm) || []).length;
}

/** Count participial phrase tail-loading patterns. */
export function countParticipialTails(text: string): number {
  // Pattern: [main clause], [present participle] [detail].
  const pattern =
    /,\s*(enabling|making|creating|providing|leading|marking|contributing|resulting|allowing|using|bringing|taking|giving|setting)\s+\w+/gi;
  return (text.match(pattern) || []).length;
}

/** Count correlative conjunction pairs in proximity. */
export function countCorrelativePairs(text: string): number {
  const patterns = [
    /not\s+only\s+\w+\s+but\s+also/gi,
    /whether\s+\w+\s+or\s+\w+/gi,
    /not\s+just\s+\w+\s+but/gi,
    /both\s+\w+\s+and\s+\w+/gi,
    /either\s+\w+\s+or\s+\w+/gi,
    /neither\s+\w+\s+nor\s+\w+/gi,
  ];
  return patterns.reduce((sum, re) => sum + (text.match(re) || []).length, 0);
}

/** Count "From X to Y" range constructions. */
export function countFromToRanges(text: string): number {
  return (text.match(/\bfrom\s+\w+.*?\bto\s+\w+/gi) || []).length;
}

/** Get first and last paragraph from markdown (for conclusion mirroring check). */
export function getFirstAndLastParagraph(content: string): [string, string] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("---") && !p.startsWith("```"));
  return [paragraphs[0] || "", paragraphs[paragraphs.length - 1] || ""];
}

/** Check if two paragraphs are near-paraphrases (simple word-overlap heuristic). */
export function isNearParaphrase(a: string, b: string, threshold = 0.6): boolean {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/[\s,.;:!?()]+/)
      .filter((w) => w.length > 3),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/[\s,.;:!?()]+/)
      .filter((w) => w.length > 3),
  );
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  const scoreA = overlap / wordsA.size;
  const scoreB = overlap / wordsB.size;
  return Math.max(scoreA, scoreB) > threshold;
}

/** Compute bullet-to-prose ratio (as fraction 0-1). */
export function computeBulletRatio(content: string): number {
  const totalLines = countNonEmpty(content);
  if (totalLines === 0) return 0;
  const bulletLines = countBulletLines(content);
  return bulletLines / totalLines;
}

/** Detect "five-paragraph essay" structure — intro, three sections, conclusion. */
export function detectFiveParagraphEssay(content: string): boolean {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("```"));

  if (paragraphs.length < 5) return false;

  const firstLen = countWords(paragraphs[0]);
  const lastLen = countWords(paragraphs[paragraphs.length - 1]);
  const bodyLens = paragraphs.slice(1, -1).map(countWords);

  // Heuristic: intro + 3 body sections + short conclusion
  const hasThreeMiddleSections = bodyLens.length >= 3;
  const conclusionShorter = lastLen < firstLen * 0.8;
  const startsWithIntro = firstLen > 20;

  return hasThreeMiddleSections && conclusionShorter && startsWithIntro;
}

/** Compute sentence length clustering score (0-1). Ratio of sentences in 15-25 word range. */
export function sentenceLengthClustering(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 3) return 0;

  const wordCounts = sentences.map((s) => countWords(s));
  const clustered = wordCounts.filter((w) => w >= 15 && w <= 25).length;
  return clustered / sentences.length;
}

/** Count emoji-led bullet lines. */
export function countEmojiBullets(content: string): number {
  // Use alternation instead of a character class to avoid
  // biome lint error about character + combining character in same class.
  const emojiPattern = /^[ \t]*(?:✅|❌|🔴|🟢|🟡|⭐|🎯|💡|📌|🔹|🔸|✔️|✏️|📝|🚀|💪|🔧|⚡|🔥|💎)/gm;
  return (content.match(emojiPattern) || []).length;
}

/** Output structured result as JSON. */
export function outputJSON(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
