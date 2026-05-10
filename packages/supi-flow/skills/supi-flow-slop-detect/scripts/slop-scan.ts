#!/usr/bin/env -S pnpm exec jiti
/**
 * Combined slop scanner — runs vocabulary + structural detection and produces
 * the final density score matching the formula in SKILL.md.
 *
 * Usage:
 *   pnpm exec jiti scripts/slop-scan.ts <file> [<file>...]
 *   pnpm exec jiti scripts/slop-scan.ts <file> --json-only  # raw JSON, no summary
 *
 * Cross-platform Node.js/TypeScript — runs wherever pi runs.
 * Output: Human-readable summary (default) or JSON (with --json-only).
 */

import { execSync } from "node:child_process";
import { type DocProfile, outputJSON } from "./slop-helpers.ts";

interface VocabResult {
  file: string;
  wordCount: number;
  totalScore: number;
  normalizedScore: number;
  tierScores: { tier1: number; tier2: number; tier3: number; tier4: number };
  hits: Array<{ term: string; tier: number; score: number; count: number; context?: string }>;
  rating: string;
  recommendation: string;
}

interface StructuralResult {
  file: string;
  profile: DocProfile;
  adjustments: string[];
  wordCount: number;
  metrics: {
    emDashDensity: number;
    bulletRatio: number;
    participialTails: number;
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
    paragraphUniformity: number;
  };
  structuralScore: number;
  flags: string[];
}

interface CombinedReport {
  file: string;
  profile: DocProfile;
  adjustments: string[];
  wordCount: number;
  vocabScore: number;
  structuralScore: number;
  finalScore: number;
  rating: "clean" | "light" | "moderate" | "heavy";
  recommendation: string;
  vocab: VocabResult;
  structural: StructuralResult;
}

/** Get the directory of the currently running script. */
function scriptDir(): string {
  const dir = (typeof __dirname !== "undefined" ? __dirname : "").replace(/\\+$/, "");
  return `${dir}/`;
}

function siblingPath(name: string): string {
  return `${scriptDir()}${name}`;
}

function runScript(script: string, files: string[]): string {
  const fileArgs = files.map((f) => `"${f}"`).join(" ");
  const cmd = `pnpm exec jiti "${script}" ${fileArgs}`;
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

function rate(finalScore: number): { rating: CombinedReport["rating"]; recommendation: string } {
  if (finalScore <= 1.0) return { rating: "clean", recommendation: "No action needed." };
  if (finalScore <= 2.5)
    return { rating: "light", recommendation: "Spot remediation — fix individual markers." };
  if (finalScore <= 5.0)
    return { rating: "moderate", recommendation: "Section rewrite recommended." };
  return {
    rating: "heavy",
    recommendation: "Full document review — do not commit without fixing.",
  };
}

function scanFile(filePath: string): CombinedReport {
  const vocabOut = runScript(siblingPath("slop-scan-vocab.ts"), [filePath]);
  const structOut = runScript(siblingPath("slop-scan-structural.ts"), [filePath]);

  const vocabResults = JSON.parse(vocabOut) as VocabResult[];
  const structResults = JSON.parse(structOut) as StructuralResult[];

  const vocab = vocabResults[0];
  const structural = structResults[0];
  const finalScore = Math.min(vocab.normalizedScore + structural.structuralScore, 10);

  return {
    file: filePath,
    profile: structural.profile,
    adjustments: structural.adjustments,
    wordCount: vocab.wordCount,
    vocabScore: vocab.normalizedScore,
    structuralScore: structural.structuralScore,
    finalScore: Math.round(finalScore * 100) / 100,
    vocab,
    structural,
    ...rate(finalScore),
  };
}

// --- CLI ---
const args = process.argv.slice(2);
const jsonOnly = args.includes("--json-only");
const files = args.filter((a) => a !== "--json-only");

if (files.length === 0) {
  console.error("Usage: pnpm exec jiti scripts/slop-scan.ts <file> [<file>...] [--json-only]");
  process.exit(1);
}

const results = files.map(scanFile);

if (jsonOnly) {
  outputJSON(results);
} else {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║           Slop Detection Scan Report            ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();

  for (const r of results) {
    console.log(`File: ${r.file}`);
    console.log(`Profile: ${r.profile}`);
    console.log(`Words: ${r.wordCount}`);
    if (r.adjustments.length > 0) {
      console.log(`Adjustments: ${r.adjustments.join(", ")}`);
    }
    console.log("───");
    console.log(`  Vocab score:       ${r.vocabScore.toFixed(2)}  (per 100 words)`);
    console.log(`  Structural score:  ${r.structuralScore}  (penalty points)`);
    console.log(`  Final score:       ${r.finalScore.toFixed(2)}`);

    const barLen = Math.round(r.finalScore);
    const bar = "█".repeat(Math.min(barLen, 10)) + "░".repeat(Math.max(0, 10 - barLen));
    console.log(`  [${bar}]`);

    let statusColor = "🟢";
    if (r.rating === "light") statusColor = "🟡";
    else if (r.rating === "moderate") statusColor = "🟠";
    else if (r.rating === "heavy") statusColor = "🔴";

    console.log(`  ${statusColor} ${r.rating.toUpperCase()} — ${r.recommendation}`);
    console.log();

    if (r.vocab.hits.length > 0) {
      console.log("  Vocabulary markers found:");
      for (const hit of r.vocab.hits.slice(0, 10)) {
        console.log(
          `    • Tier ${hit.tier} "${hit.term}" ×${hit.count} (score: ${hit.count * hit.score})`,
        );
      }
      if (r.vocab.hits.length > 10) {
        console.log(`    ... and ${r.vocab.hits.length - 10} more`);
      }
      console.log();
    }

    if (r.structural.flags.length > 0) {
      console.log("  Structural flags:");
      for (const flag of r.structural.flags) {
        console.log(`    • ${flag}`);
      }
      console.log();
    }

    console.log("  Structural metrics:");
    const m = r.structural.metrics;
    console.log(`    Em dash density:        ${m.emDashDensity.toFixed(1)}/1000 words`);
    console.log(`    Sentence clustering:    ${(m.sentenceClusterRatio * 100).toFixed(0)}%`);
    console.log(`    Bullet ratio:           ${(m.bulletRatio * 100).toFixed(0)}%`);
    console.log(`    Paragraph uniformity:   ${(m.paragraphUniformity * 100).toFixed(0)}%`);
    console.log(`    Participial tails:      ${m.participialTailsPer500.toFixed(1)}/500 words`);
    console.log(`    Correlative pairs:      ${m.correlativePairs}`);
    console.log(`    Arrow connectors:       ${m.arrowConnectors}`);
    console.log(`    Technical arrow chains: ${m.technicalArrowConnectors}`);
    console.log(`    Prose arrow shorthand:  ${m.proseArrowConnectors}`);
    console.log(`    Plus-sign conjunctions: ${m.plusSigns}`);
    console.log(`    Emoji bullets:          ${m.emojiBullets}`);
    console.log(`    Colons vs semicolons:   ${m.colons} / ${m.semicolons}`);
    console.log(`    From→To ranges:         ${m.fromToRanges}`);
    console.log(`    Intro-body-conclusion:  ${m.introBodyConclusion}`);
    console.log(`    Conclusion mirroring:   ${m.conclusionMirroring}`);
    console.log("───");
    console.log();
  }
}
