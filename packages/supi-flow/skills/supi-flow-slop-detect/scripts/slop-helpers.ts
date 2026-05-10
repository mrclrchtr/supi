/**
 * Shared utilities for slop detection scripts.
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Use via: pnpm exec jiti <script>.ts <file>
 */

import { readFileSync } from "node:fs";

export type DocProfile = "skill" | "technical" | "prose";

interface ArrowConnectorStats {
  total: number;
  technical: number;
  prose: number;
}

const ARROW_CONNECTOR_PATTERN = /->|→/g;
const TECHNICAL_TOKEN_PATTERN = /[A-Za-z0-9_./-]+/g;
const ARROW_PROSE_START_WORDS = new Set([
  "a",
  "an",
  "are",
  "can",
  "does",
  "helps",
  "improves",
  "is",
  "it",
  "lets",
  "makes",
  "means",
  "shows",
  "that",
  "the",
  "their",
  "there",
  "these",
  "this",
  "those",
  "we",
  "you",
]);

/** Read a file as UTF-8 string. */
export function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Strip fenced code blocks from markdown content. */
export function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "");
}

/** Strip inline code spans from markdown content. */
export function stripInlineCode(content: string): string {
  return content.replace(/`[^`]+`/g, "");
}

/** Detect the document profile used for structural scoring. */
export function detectDocProfile(filePath: string): DocProfile {
  if (/[\\/]skills[\\/].*[\\/]SKILL\.md$/i.test(filePath)) return "skill";
  if (/(?:^|[\\/])README\.md$/i.test(filePath) || /[\\/]docs[\\/].*\.md$/i.test(filePath)) {
    return "technical";
  }
  return "prose";
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

function isTechnicalArrowContext(leftTokens: string[], rightTokens: string[]): boolean {
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const leftFirst = leftTokens[0]?.toLowerCase() ?? "";
  const rightFirst = rightTokens[0]?.toLowerCase() ?? "";

  if (ARROW_PROSE_START_WORDS.has(leftFirst) || ARROW_PROSE_START_WORDS.has(rightFirst)) {
    return false;
  }

  return leftTokens.length <= 3 && rightTokens.length <= 3;
}

/** Analyze arrow connectors in prose and split technical notation from prose shorthand. */
export function analyzeArrowConnectors(content: string): ArrowConnectorStats {
  const prose = stripInlineCode(stripCodeBlocks(content));
  const lines = prose.split("\n");

  let total = 0;
  let technical = 0;

  for (const line of lines) {
    const matches = [...line.matchAll(ARROW_CONNECTOR_PATTERN)];
    total += matches.length;

    for (const match of matches) {
      const index = match.index ?? -1;
      if (index < 0) continue;

      const leftTokens = [...line.slice(0, index).matchAll(TECHNICAL_TOKEN_PATTERN)]
        .map((token) => token[0])
        .slice(-3);
      const rightTokens = [...line.slice(index + match[0].length).matchAll(TECHNICAL_TOKEN_PATTERN)]
        .map((token) => token[0])
        .slice(0, 3);

      if (isTechnicalArrowContext(leftTokens, rightTokens)) {
        technical++;
      }
    }
  }

  return {
    total,
    technical,
    prose: Math.max(0, total - technical),
  };
}

/** Count plus-sign conjunctions in prose (excluding code blocks). */
export function countPlusSigns(content: string): number {
  const prose = stripInlineCode(stripCodeBlocks(content));
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

  if (paragraphs.length < 2) {
    return [paragraphs[0] || "", ""];
  }

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

/** Detect intro-body-conclusion structure where the closing paragraph mirrors
 *  the opening (the "five-paragraph essay" pattern common in AI-generated prose). */
export function detectIntroBodyConclusion(content: string): boolean {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("```"));

  if (paragraphs.length < 5) return false;

  const firstLen = countWords(paragraphs[0]);
  const lastLen = countWords(paragraphs[paragraphs.length - 1]);
  const bodyLens = paragraphs.slice(1, -1).map(countWords);

  // Heuristic: intro + 3+ body sections + short conclusion
  const hasThreeMiddleSections = bodyLens.length >= 3;
  const conclusionShorter = lastLen < firstLen * 0.8;
  const startsWithIntro = firstLen > 20;

  return hasThreeMiddleSections && conclusionShorter && startsWithIntro;
}

/** Compute paragraph word-count uniformity score (0-1).
 *  Higher = more uniform paragraph lengths (strong AI signal).
 *  Uses inverted coefficient of variation: 1 - min(1, stddev/mean).
 *  Score > 0.7 means paragraphs are suspiciously uniform. */
export function paragraphUniformity(content: string): number {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("```"))
    .map(countWords);

  if (paragraphs.length < 3) return 0;

  const mean = paragraphs.reduce((s, w) => s + w, 0) / paragraphs.length;
  if (mean === 0) return 0;
  const variance = paragraphs.reduce((s, w) => s + (w - mean) ** 2, 0) / paragraphs.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.round((1 - Math.min(1, cv)) * 100) / 100;
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
