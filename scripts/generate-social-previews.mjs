#!/usr/bin/env node

/**
 * Generate branded 1280×640 README banners for every workspace package.
 *
 * Requires Inkscape and ImageMagick.
 *
 * Usage:
 *   node scripts/generate-social-previews.mjs
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = resolve(ROOT, "packages");
const SPECIAL_NAMES = {
  "claude-md": "Claude.md",
  lsp: "LSP",
  "tree-sitter": "Tree-sitter",
};

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function displayName(shortName) {
  return (
    SPECIAL_NAMES[shortName] ??
    shortName
      .split("-")
      .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
}

function wrapText(value, maxLength = 48) {
  const lines = [];
  for (const word of value.split(/\s+/)) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maxLength) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  return lines;
}

function descriptionText(lines) {
  return lines
    .map((line, index) => `<tspan x="508" dy="${index === 0 ? 0 : 38}">${escapeXml(line)}</tspan>`)
    .join("");
}

function renderSvg({ description, display, kind, packageName }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-labelledby="title desc">
  <title id="title">SuPi ${escapeXml(display)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#181926"/>
      <stop offset="1" stop-color="#24273a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(320 318) rotate(90) scale(330)">
      <stop stop-color="#8aadf4" stop-opacity=".22"/>
      <stop offset="1" stop-color="#8aadf4" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#cad3f5" stroke-opacity=".04"/>
    </pattern>
  </defs>

  <rect width="1280" height="640" fill="url(#background)"/>
  <rect width="1280" height="640" fill="url(#grid)"/>
  <rect width="700" height="640" fill="url(#glow)"/>
  <circle cx="1150" cy="-30" r="230" fill="#c6a0f6" opacity=".07"/>
  <circle cx="1230" cy="610" r="190" fill="#8bd5ca" opacity=".06"/>

  <rect x="72" y="72" width="360" height="496" rx="32" fill="#24273a" stroke="#5b6078" stroke-width="2"/>
  <g fill="#cad3f5">
    <rect x="132" y="142" width="240" height="50" rx="8"/>
    <rect x="154" y="182" width="46" height="170" rx="8"/>
    <rect x="304" y="182" width="46" height="170" rx="8"/>
  </g>
  <text x="252" y="440" fill="#cad3f5" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="62" font-weight="700" text-anchor="middle">SuPi</text>
  <text x="252" y="478" fill="#a5adcb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="17" font-weight="600" letter-spacing="3" text-anchor="middle">SUPER PI</text>

  <circle cx="512" cy="128" r="6" fill="#8aadf4"/>
  <text x="532" y="136" fill="#a5adcb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20" font-weight="700" letter-spacing="2">${escapeXml(kind)}</text>
  <text x="506" y="228" fill="#cad3f5" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="62" font-weight="750">${escapeXml(display)}</text>
  <text x="508" y="278" fill="#8aadf4" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20" font-weight="650">${escapeXml(packageName)}</text>
  <text x="508" y="344" fill="#b8c0e0" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="26" font-weight="500">${descriptionText(wrapText(description))}</text>

  <path d="M508 520h660" stroke="#494d64"/>
  <text x="508" y="556" fill="#a5adcb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="19">github.com/mrclrchtr/supi</text>
</svg>
`;
}

function main() {
  assert.deepEqual(wrapText("one two three", 7), ["one two", "three"]);

  const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("supi-"))
    .map((entry) => entry.name)
    .sort();

  for (const packageDir of packageDirs) {
    const packageRoot = resolve(PACKAGES_DIR, packageDir);
    const packageJsonPath = resolve(packageRoot, "package.json");
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const shortName = packageJson.name.replace(/^@mrclrchtr\/supi-/, "");
    const assetsDir = resolve(packageRoot, "assets");
    const temporarySvg = resolve(assetsDir, ".tmp-social-preview.svg");
    const temporaryPng = resolve(assetsDir, ".tmp-social-preview.png");
    const output = resolve(assetsDir, "social-preview.png");
    const svg = renderSvg({
      description: packageJson.description,
      display: displayName(shortName),
      kind: packageJson.pi?.extensions?.length ? "PI EXTENSION" : "SUPI LIBRARY",
      packageName: packageJson.name,
    });

    try {
      writeFileSync(temporarySvg, svg);
      execFileSync("inkscape", [
        temporarySvg,
        `--export-filename=${temporaryPng}`,
        "--export-width=1280",
        "--export-height=640",
      ]);
      execFileSync("magick", [temporaryPng, "-strip", "-colors", "256", `PNG8:${output}`]);
      console.log(`  ${packageDir}/assets/social-preview.png`);
    } finally {
      for (const temporaryFile of [temporarySvg, temporaryPng]) {
        if (existsSync(temporaryFile)) unlinkSync(temporaryFile);
      }
    }
  }
}

main();
