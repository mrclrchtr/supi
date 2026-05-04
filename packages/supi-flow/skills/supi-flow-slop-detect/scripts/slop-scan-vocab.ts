#!/usr/bin/env -S pnpm exec jiti
/**
 * Vocabulary marker scanner — scans markdown files for AI-prose vocabulary markers.
 *
 * Reads vocabulary definitions from `../references/vocabulary.json` — the single
 * source of truth shared with SKILL.md documentation tables.
 *
 * Usage:
 *   pnpm exec jiti scripts/slop-scan-vocab.ts <file> [<file>...]
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Output: JSON array with one result per file.
 */

import { readFileSync } from "node:fs";
import { outputJSON } from "./slop-helpers.ts";

/** Resolve path relative to this script file. jiti provides __dirname at runtime. */
function resolveAdjacent(filename: string): string {
  const dir = (typeof __dirname !== "undefined" ? __dirname : "").replace(/\+$/, "");
  return `${dir}/${filename}`;
}

interface VocabEntry {
  term: string;
  score: number;
}

interface VocabData {
  tier1: VocabEntry[];
  tier2: VocabEntry[];
  tier3: VocabEntry[];
  tier4: VocabEntry[];
}

const vocabulary: VocabData = JSON.parse(
  readFileSync(resolveAdjacent("../references/vocabulary.json"), "utf-8"),
);

/** Build flat list with tier annotation. */
function allVocab(): Array<VocabEntry & { tier: 1 | 2 | 3 | 4 }> {
  return [
    ...vocabulary.tier1.map((e) => ({ ...e, tier: 1 as const })),
    ...vocabulary.tier2.map((e) => ({ ...e, tier: 2 as const })),
    ...vocabulary.tier3.map((e) => ({ ...e, tier: 3 as const })),
    ...vocabulary.tier4.map((e) => ({ ...e, tier: 4 as const })),
  ];
}

interface VocabHit {
  term: string;
  tier: number;
  score: number;
  count: number;
  context?: string;
}

interface VocabResult {
  file: string;
  wordCount: number;
  totalScore: number;
  normalizedScore: number;
  tierScores: { tier1: number; tier2: number; tier3: number; tier4: number };
  hits: VocabHit[];
  rating: "clean" | "light" | "moderate" | "heavy";
  recommendation: string;
}

function rate(normalizedScore: number): Pick<VocabResult, "rating" | "recommendation"> {
  if (normalizedScore <= 1.0) {
    return { rating: "clean", recommendation: "No action needed — vocabulary is clean." };
  }
  if (normalizedScore <= 2.5) {
    return {
      rating: "light",
      recommendation: "Spot remediation — fix individual markers found above.",
    };
  }
  if (normalizedScore <= 5.0) {
    return {
      rating: "moderate",
      recommendation: "Section rewrite recommended — review flagged areas.",
    };
  }
  return {
    rating: "heavy",
    recommendation: "Full document review — do not commit without addressing flagged markers.",
  };
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read a file as UTF-8 string. */
function readFile(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Scan a single file for vocabulary markers. */
function scanFile(filePath: string): VocabResult {
  const content = readFile(filePath);
  const lowerContent = content.toLowerCase();
  const wordCount = content.split(/[\s\n]+/).filter((w) => w.length > 0).length;

  const hits: VocabHit[] = [];
  let totalScore = 0;

  for (const entry of allVocab()) {
    const pattern = escapeRegex(entry.term.toLowerCase());
    const re = new RegExp(pattern, "gi");
    const matches = [...lowerContent.matchAll(re)];

    if (matches.length === 0) continue;

    const count = matches.length;
    totalScore += count * entry.score;

    // Context snippet around first occurrence
    const idx = matches[0].index;
    const start = Math.max(0, idx - 30);
    const end = Math.min(content.length, idx + entry.term.length + 30);
    const context = content.slice(start, end).replace(/\n/g, " ").trim();

    hits.push({ term: entry.term, tier: entry.tier, score: entry.score, count, context });
  }

  hits.sort((a, b) => b.count * b.score - a.count * a.score);

  const tierScores = {
    tier1: hits.filter((h) => h.tier === 1).reduce((s, h) => s + h.count * h.score, 0),
    tier2: hits.filter((h) => h.tier === 2).reduce((s, h) => s + h.count * h.score, 0),
    tier3: hits.filter((h) => h.tier === 3).reduce((s, h) => s + h.count * h.score, 0),
    tier4: hits.filter((h) => h.tier === 4).reduce((s, h) => s + h.count * h.score, 0),
  };

  const normalizedScore = wordCount > 0 ? (totalScore / wordCount) * 100 : 0;

  return {
    file: filePath,
    wordCount,
    totalScore,
    normalizedScore: Math.round(normalizedScore * 100) / 100,
    tierScores,
    hits,
    ...rate(normalizedScore),
  };
}

// --- CLI ---
const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write("Usage: pnpm exec jiti scripts/slop-scan-vocab.ts <file> [<file>...]\n");
  process.exit(1);
}

const results = files.map(scanFile);
outputJSON(results);
