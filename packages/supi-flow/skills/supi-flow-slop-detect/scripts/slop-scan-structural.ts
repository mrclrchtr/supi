#!/usr/bin/env -S pnpm exec jiti
/**
 * Structural pattern scanner — analyzes markdown for AI-prose structural tells.
 *
 * Usage:
 *   pnpm exec jiti scripts/slop-scan-structural.ts <file> [<file>...]
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Output: JSON array with one result per file.
 */

import {
  computeBulletRatio,
  countArrowConnectors,
  countColons,
  countCorrelativePairs,
  countEmDashes,
  countEmojiBullets,
  countFromToRanges,
  countParticipialTails,
  countPlusSigns,
  countSemicolons,
  countWords,
  detectIntroBodyConclusion,
  getFirstAndLastParagraph,
  isNearParaphrase,
  outputJSON,
  paragraphUniformity,
  readFile,
  sentenceLengthClustering,
  stripCodeBlocks,
} from "./slop-helpers.ts";

interface StructuralMetrics {
  emDashDensity: number;
  bulletRatio: number;
  participialTails: number;
  /** Normalized participial tails per 500 words. */
  participialTailsPer500: number;
  arrowConnectors: number;
  correlativePairs: number;
  plusSigns: number;
  colons: number;
  semicolons: number;
  sentenceClusterRatio: number;
  fromToRanges: number;
  emojiBullets: number;
  introBodyConclusion: boolean;
  conclusionMirroring: boolean;
  /** Paragraph uniformity score (0-1), higher = more uniform (more AI-like). */
  paragraphUniformity: number;
}

interface StructuralResult {
  file: string;
  wordCount: number;
  metrics: StructuralMetrics;
  structuralScore: number;
  flags: string[];
}

function computeStructuralScore(metrics: StructuralMetrics): number {
  let score = 0;
  if (metrics.emDashDensity > 5) score += 2;
  if (metrics.sentenceClusterRatio > 0.7) score += 2;
  if (metrics.bulletRatio > 0.5) score += 2;
  if (metrics.paragraphUniformity > 0.7) score += 2;
  if (metrics.emojiBullets > 0) score += 1;
  if (metrics.participialTailsPer500 > 3) score += 2;
  if (metrics.introBodyConclusion) score += 2;
  if (metrics.correlativePairs > 2) score += 1;
  if (metrics.arrowConnectors > 0) score += 1;
  if (metrics.plusSigns > 1) score += 1;
  if (metrics.emDashDensity > 5 && metrics.semicolons === 0) score += 1;
  if (metrics.conclusionMirroring) score += 1;
  return score;
}

function genFlags(metrics: StructuralMetrics): string[] {
  const flags: string[] = [];

  if (metrics.emDashDensity > 5) {
    flags.push(
      `Em dash density ${metrics.emDashDensity.toFixed(1)}/1000 words (threshold: 5) — review usage`,
    );
  } else if (metrics.emDashDensity > 3) {
    flags.push(
      `Em dash density ${metrics.emDashDensity.toFixed(1)}/1000 words — elevated, spot-check`,
    );
  }

  if (metrics.sentenceClusterRatio > 0.7) {
    flags.push(
      `Sentence length clustering ${(metrics.sentenceClusterRatio * 100).toFixed(0)}% (threshold: 70%) — vary rhythm`,
    );
  }

  if (metrics.bulletRatio > 0.5) {
    flags.push(
      `Bullet ratio ${(metrics.bulletRatio * 100).toFixed(0)}% (threshold: 50%) — convert some to prose`,
    );
  }

  if (metrics.paragraphUniformity > 0.7) {
    flags.push(
      `Paragraph uniformity ${(metrics.paragraphUniformity * 100).toFixed(0)}% (threshold: 70%) — vary paragraph length`,
    );
  }

  if (metrics.emojiBullets > 0) {
    flags.push(`Emoji-led bullets: ${metrics.emojiBullets} — strong AI tell in technical docs`);
  }

  if (metrics.participialTailsPer500 > 3) {
    flags.push(
      `Participial phrase tails: ${metrics.participialTailsPer500.toFixed(1)}/500 words (threshold: 3) — split or restructure`,
    );
  }

  if (metrics.introBodyConclusion) {
    flags.push("Intro-body-conclusion structure — cut the intro and start with content");
  }

  if (metrics.correlativePairs > 2) {
    flags.push(
      `Correlative pairs: ${metrics.correlativePairs} (threshold: 2) — reduce "not only...but also" etc.`,
    );
  }

  if (metrics.arrowConnectors > 0) {
    flags.push(`Arrow connectors (->/→) in prose: ${metrics.arrowConnectors} — use "to" instead`);
  }

  if (metrics.plusSigns > 1) {
    flags.push(`Plus-sign conjunctions: ${metrics.plusSigns} (threshold: 1) — use "and" instead`);
  }

  if (metrics.emDashDensity > 5 && metrics.semicolons === 0) {
    flags.push("Em dashes > 5 with zero semicolons — strong AI signal");
  }

  if (metrics.conclusionMirroring) {
    flags.push("Conclusion mirrors intro — cut or replace with specifics");
  }

  return flags;
}

function scanFile(filePath: string): StructuralResult {
  const content = readFile(filePath);
  const prose = stripCodeBlocks(content);
  const wordCount = countWords(content);

  const emDashCount = countEmDashes(prose);
  const emDashDensity = wordCount > 0 ? (emDashCount / wordCount) * 1000 : 0;
  const rawTails = countParticipialTails(prose);
  const tailsPer500 = wordCount > 0 ? (rawTails / wordCount) * 500 : 0;

  const metrics: StructuralMetrics = {
    emDashDensity: Math.round(emDashDensity * 100) / 100,
    bulletRatio: Math.round(computeBulletRatio(content) * 100) / 100,
    participialTails: rawTails,
    participialTailsPer500: Math.round(tailsPer500 * 10) / 10,
    arrowConnectors: countArrowConnectors(content),
    correlativePairs: countCorrelativePairs(prose),
    plusSigns: countPlusSigns(content),
    colons: countColons(prose),
    semicolons: countSemicolons(prose),
    sentenceClusterRatio: Math.round(sentenceLengthClustering(prose) * 100) / 100,
    fromToRanges: countFromToRanges(prose),
    emojiBullets: countEmojiBullets(content),
    introBodyConclusion: detectIntroBodyConclusion(content),
    conclusionMirroring: isNearParaphrase(...getFirstAndLastParagraph(content)),
    paragraphUniformity: paragraphUniformity(content),
  };

  return {
    file: filePath,
    wordCount,
    metrics,
    structuralScore: computeStructuralScore(metrics),
    flags: genFlags(metrics),
  };
}

// --- CLI ---
const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write(
    "Usage: pnpm exec jiti scripts/slop-scan-structural.ts <file> [<file>...]\n",
  );
  process.exit(1);
}

const results = files.map(scanFile);
outputJSON(results);
