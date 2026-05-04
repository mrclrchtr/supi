#!/usr/bin/env -S pnpm exec jiti
/**
 * Vocabulary marker scanner — scans markdown files for AI-prose vocabulary markers.
 *
 * Usage:
 *   pnpm exec jiti scripts/slop-scan-vocab.ts <file> [<file>...]
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Output: JSON array with one result per file.
 */

import { outputJSON, readFile } from "./slop-helpers.ts";

interface VocabEntry {
  term: string;
  tier: 1 | 2 | 3 | 4;
  score: number;
}

const TIER_1: VocabEntry[] = [
  { term: "delve", tier: 1, score: 3 },
  { term: "tapestry", tier: 1, score: 3 },
  { term: "realm", tier: 1, score: 3 },
  { term: "embark", tier: 1, score: 3 },
  { term: "beacon", tier: 1, score: 3 },
  { term: "spearheaded", tier: 1, score: 3 },
  { term: "leverage", tier: 1, score: 3 },
  { term: "robust", tier: 1, score: 3 },
  { term: "seamless", tier: 1, score: 3 },
  { term: "pivotal", tier: 1, score: 3 },
  { term: "multifaceted", tier: 1, score: 3 },
  { term: "comprehensive", tier: 1, score: 3 },
  { term: "nuanced", tier: 1, score: 3 },
  { term: "meticulous", tier: 1, score: 3 },
  { term: "intricate", tier: 1, score: 3 },
  { term: "showcasing", tier: 1, score: 3 },
  { term: "streamline", tier: 1, score: 3 },
  { term: "facilitate", tier: 1, score: 3 },
  { term: "utilize", tier: 1, score: 3 },
];

const TIER_2: VocabEntry[] = [
  { term: "moreover", tier: 2, score: 2 },
  { term: "furthermore", tier: 2, score: 2 },
  { term: "indeed", tier: 2, score: 2 },
  { term: "notably", tier: 2, score: 2 },
  { term: "subsequently", tier: 2, score: 2 },
  { term: "significantly", tier: 2, score: 2 },
  { term: "substantially", tier: 2, score: 2 },
  { term: "fundamentally", tier: 2, score: 2 },
  { term: "profoundly", tier: 2, score: 2 },
  { term: "potentially", tier: 2, score: 2 },
  { term: "typically", tier: 2, score: 2 },
  { term: "might", tier: 2, score: 2 },
  { term: "perhaps", tier: 2, score: 2 },
  { term: "revolutionize", tier: 2, score: 2 },
  { term: "transform", tier: 2, score: 2 },
  { term: "unlock", tier: 2, score: 2 },
  { term: "unleash", tier: 2, score: 2 },
  { term: "elevate", tier: 2, score: 2 },
  { term: "crucial", tier: 2, score: 2 },
  { term: "vital", tier: 2, score: 2 },
  { term: "essential", tier: 2, score: 2 },
  { term: "paramount", tier: 2, score: 2 },
];

const TIER_3: VocabEntry[] = [
  { term: "in today's fast-paced world", tier: 3, score: 4 },
  { term: "it's worth noting that", tier: 3, score: 3 },
  { term: "at its core", tier: 3, score: 2 },
  { term: "cannot be overstated", tier: 3, score: 3 },
  { term: "navigate the complexities", tier: 3, score: 4 },
  { term: "unlock the potential", tier: 3, score: 4 },
  { term: "a testament to", tier: 3, score: 3 },
  { term: "treasure trove of", tier: 3, score: 3 },
  { term: "game changer", tier: 3, score: 3 },
  { term: "ever-evolving landscape", tier: 3, score: 4 },
  { term: "look no further", tier: 3, score: 4 },
  { term: "hustle and bustle", tier: 3, score: 3 },
];

const TIER_4: VocabEntry[] = [
  { term: "I'd be happy to", tier: 4, score: 2 },
  { term: "Great question!", tier: 4, score: 2 },
  { term: "Absolutely!", tier: 4, score: 2 },
  { term: "That's a wonderful point", tier: 4, score: 2 },
  { term: "I'm glad you asked", tier: 4, score: 2 },
  { term: "You're absolutely right", tier: 4, score: 2 },
];

const ALL_VOCAB = [...TIER_1, ...TIER_2, ...TIER_3, ...TIER_4];

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
    return {
      rating: "clean",
      recommendation: "No action needed — vocabulary is clean.",
    };
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

/** Scan a single file for vocabulary markers. */
function scanFile(filePath: string): VocabResult {
  const content = readFile(filePath);
  const lowerContent = content.toLowerCase();
  const wordCount = content.split(/[\s\n]+/).filter((w) => w.length > 0).length;

  const hits: VocabHit[] = [];
  let totalScore = 0;

  for (const entry of ALL_VOCAB) {
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

    hits.push({
      term: entry.term,
      tier: entry.tier,
      score: entry.score,
      count,
      context,
    });
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
  console.error("Usage: pnpm exec jiti scripts/slop-scan-vocab.ts <file> [<file>...]");
  process.exit(1);
}

const results = files.map(scanFile);
outputJSON(results);
