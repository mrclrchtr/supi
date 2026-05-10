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
  analyzeArrowConnectors,
  computeBulletRatio,
  countColons,
  countCorrelativePairs,
  countEmDashes,
  countEmojiBullets,
  countFromToRanges,
  countParticipialTails,
  countPlusSigns,
  countSemicolons,
  countWords,
  type DocProfile,
  detectDocProfile,
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
  technicalArrowConnectors: number;
  proseArrowConnectors: number;
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
  profile: DocProfile;
  adjustments: string[];
  wordCount: number;
  metrics: StructuralMetrics;
  structuralScore: number;
  flags: string[];
}

interface ProfileThresholds {
  emDashWarn: number;
  emDashPenalty: number;
  bulletPenalty: number;
  plusSignPenalty: number;
  scoreIntroBodyConclusion: boolean;
}

function getThresholds(profile: DocProfile): ProfileThresholds {
  if (profile === "skill") {
    return {
      emDashWarn: 6,
      emDashPenalty: 8,
      bulletPenalty: 0.65,
      plusSignPenalty: 2,
      scoreIntroBodyConclusion: false,
    };
  }

  if (profile === "technical") {
    return {
      emDashWarn: 3,
      emDashPenalty: 5,
      bulletPenalty: 0.5,
      plusSignPenalty: 1,
      scoreIntroBodyConclusion: true,
    };
  }

  return {
    emDashWarn: 3,
    emDashPenalty: 5,
    bulletPenalty: 0.45,
    plusSignPenalty: 1,
    scoreIntroBodyConclusion: true,
  };
}

function getProfileAdjustments(profile: DocProfile): string[] {
  if (profile === "skill") {
    return [
      "workflow arrow chains relaxed",
      "higher bullet-ratio threshold",
      "higher em-dash threshold",
      "intro-body-conclusion penalty disabled",
    ];
  }

  if (profile === "technical") {
    return ["technical-doc thresholds", "workflow arrow chains relaxed"];
  }

  return ["default prose thresholds"];
}

function computeStructuralScore(metrics: StructuralMetrics, profile: DocProfile): number {
  const thresholds = getThresholds(profile);
  let score = 0;
  if (metrics.emDashDensity > thresholds.emDashPenalty) score += 2;
  if (metrics.sentenceClusterRatio > 0.7) score += 2;
  if (metrics.bulletRatio > thresholds.bulletPenalty) score += 2;
  if (metrics.paragraphUniformity > 0.7) score += 2;
  if (metrics.emojiBullets > 0) score += 1;
  if (metrics.participialTailsPer500 > 3) score += 2;
  if (thresholds.scoreIntroBodyConclusion && metrics.introBodyConclusion) score += 2;
  if (metrics.correlativePairs > 2) score += 1;
  if (metrics.proseArrowConnectors > 0) score += 1;
  if (metrics.plusSigns > thresholds.plusSignPenalty) score += 1;
  if (metrics.emDashDensity > thresholds.emDashPenalty && metrics.semicolons === 0) score += 1;
  if (metrics.conclusionMirroring) score += 1;
  return score;
}

function genFlags(metrics: StructuralMetrics, profile: DocProfile): string[] {
  const thresholds = getThresholds(profile);
  const flags: string[] = [];

  if (metrics.emDashDensity > thresholds.emDashPenalty) {
    flags.push(
      `Em dash density ${metrics.emDashDensity.toFixed(1)}/1000 words (threshold: ${thresholds.emDashPenalty}) — review usage`,
    );
  } else if (metrics.emDashDensity > thresholds.emDashWarn) {
    flags.push(
      `Em dash density ${metrics.emDashDensity.toFixed(1)}/1000 words — elevated for ${profile} docs, spot-check`,
    );
  }

  if (metrics.sentenceClusterRatio > 0.7) {
    flags.push(
      `Sentence length clustering ${(metrics.sentenceClusterRatio * 100).toFixed(0)}% (threshold: 70%) — vary rhythm`,
    );
  }

  if (metrics.bulletRatio > thresholds.bulletPenalty) {
    flags.push(
      `Bullet ratio ${(metrics.bulletRatio * 100).toFixed(0)}% (threshold: ${(thresholds.bulletPenalty * 100).toFixed(0)}%) — convert some to prose`,
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

  if (getThresholds(profile).scoreIntroBodyConclusion && metrics.introBodyConclusion) {
    flags.push("Intro-body-conclusion structure — cut the intro and start with content");
  }

  if (metrics.correlativePairs > 2) {
    flags.push(
      `Correlative pairs: ${metrics.correlativePairs} (threshold: 2) — reduce "not only...but also" etc.`,
    );
  }

  if (metrics.proseArrowConnectors > 0) {
    flags.push(
      `Arrow connectors used as prose shorthand: ${metrics.proseArrowConnectors} — keep arrows for technical chains and use words in normal sentences`,
    );
  }

  if (metrics.plusSigns > thresholds.plusSignPenalty) {
    flags.push(
      `Plus-sign conjunctions: ${metrics.plusSigns} (threshold: ${thresholds.plusSignPenalty}) — use "and" instead`,
    );
  }

  if (metrics.emDashDensity > thresholds.emDashPenalty && metrics.semicolons === 0) {
    flags.push("Em dashes above threshold with zero semicolons — strong AI signal");
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
  const profile = detectDocProfile(filePath);

  const emDashCount = countEmDashes(prose);
  const emDashDensity = wordCount > 0 ? (emDashCount / wordCount) * 1000 : 0;
  const rawTails = countParticipialTails(prose);
  const tailsPer500 = wordCount > 0 ? (rawTails / wordCount) * 500 : 0;
  const arrows = analyzeArrowConnectors(content);

  const metrics: StructuralMetrics = {
    emDashDensity: Math.round(emDashDensity * 100) / 100,
    bulletRatio: Math.round(computeBulletRatio(content) * 100) / 100,
    participialTails: rawTails,
    participialTailsPer500: Math.round(tailsPer500 * 10) / 10,
    arrowConnectors: arrows.total,
    technicalArrowConnectors: arrows.technical,
    proseArrowConnectors: arrows.prose,
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
    profile,
    adjustments: getProfileAdjustments(profile),
    wordCount,
    metrics,
    structuralScore: computeStructuralScore(metrics, profile),
    flags: genFlags(metrics, profile),
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
