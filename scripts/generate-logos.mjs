#!/usr/bin/env node

/**
 * Generate per-package logo PNGs from assets/supi-logo.svg.
 *
 * For each package with a package.json, substitutes the subtitle text
 * (the last <text> element's content) and converts SVG → PNG via Inkscape.
 *
 * Usage:
 *   node scripts/generate-logos.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = resolve(ROOT, "packages");
const SVG_PATH = resolve(ROOT, "assets", "supi-logo.svg");
const SUBTITLE_TEMPLATE = "Curated Extension Stack";

/** Package directory → subtitle mapping */
const SUBTITLES = {
  "supi-ask-user": "Ask User",
  "supi-bash-timeout": "Bash Timeout",
  "supi-cache": "Cache",
  "supi-claude-md": "Claude.md",
  "supi-code-intelligence": "Code Intelligence",
  "supi-context": "Context",
  "supi-core": "Core",
  "supi-debug": "Debug",
  "supi-extras": "Extras",
  "supi-insights": "Insights",
  "supi-lsp": "LSP",
  "supi-review": "Review",
  "supi-rtk": "RTK",
  "supi-settings": "Settings",
  "supi-test-utils": "Test Utils",
  "supi-tree-sitter": "Tree-sitter",
  "supi-web": "Web",
};

function main() {
  if (!existsSync(SVG_PATH)) {
    console.error(`Template SVG not found: ${SVG_PATH}`);
    process.exit(1);
  }

  const templateSvg = readFileSync(SVG_PATH, "utf-8");

  if (!templateSvg.includes(SUBTITLE_TEMPLATE)) {
    console.error(`Could not find subtitle placeholder "${SUBTITLE_TEMPLATE}" in SVG template.`);
    process.exit(1);
  }

  const packageDirs = Object.keys(SUBTITLES);
  let generated = 0;
  let errors = 0;

  for (const pkgDir of packageDirs) {
    const pkgPath = resolve(PACKAGES_DIR, pkgDir);
    const pkgJsonPath = resolve(pkgPath, "package.json");

    if (!existsSync(pkgJsonPath)) {
      console.warn(`  Skipping ${pkgDir} — no package.json`);
      continue;
    }

    const subtitle = SUBTITLES[pkgDir];
    const modifiedSvg = templateSvg.replace(SUBTITLE_TEMPLATE, subtitle);
    const assetsDir = resolve(pkgPath, "assets");
    const outPath = resolve(assetsDir, "logo.png");

    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    // Write modified SVG to temp file, convert via Inkscape, clean up
    const tmpSvg = resolve(assetsDir, ".tmp-logo.svg");
    try {
      writeFileSync(tmpSvg, modifiedSvg, "utf-8");
      execFileSync("inkscape", [
        tmpSvg,
        "--export-filename",
        outPath,
        "--export-width",
        "512",
        "--export-height",
        "512",
      ]);
      console.log(`  ${pkgDir}/assets/logo.png`);
      generated++;
    } catch (err) {
      console.error(`  FAILED ${pkgDir}: ${err.message}`);
      errors++;
    } finally {
      try {
        if (existsSync(tmpSvg)) unlinkSync(tmpSvg);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  console.log(`\nDone: ${generated} generated, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
