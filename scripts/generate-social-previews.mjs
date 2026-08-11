#!/usr/bin/env node

/**
 * Generate branded 1280×640 social previews for every workspace package.
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
// Real registered surfaces (tools, commands, skills, exports) — verified against src/.
const SOCIAL_BADGES = {
  agent: ["./api", "AgentProfile", "ProfileCatalogue"],
  "agent-runtime": ["./api", "startAgentRun()", "AgentRunHandle"],
  "ask-user": ["ask_user", "choice forms", "text forms"],
  "bash-timeout": ["bash hook", "120s default", "/supi-settings"],
  cache: ["/supi-cache-history", "supi_cache_forensics"],
  "claude-md": ["claude-md-improver", "claude-md-revision"],
  "code-intelligence": ["code_resolve", "code_graph", "code_refactor_plan"],
  "code-runtime": ["./api", "CodeQueryResult", "workspace registry"],
  context: ["/supi-context", "supi_context"],
  core: ["./api", "./settings", "./report"],
  debug: ["/supi-debug", "supi_debug"],
  extras: ["/supi-stash", "/clone-session", "shortcuts"],
  insights: ["/supi-insights", "shareable HTML"],
  lsp: ["./api", "server lifecycle", "diagnostics"],
  "prompt-suggestions": ["ghost text", "/supi-settings"],
  review: ["/supi-review", "supi_review_run", "supi_review_audit"],
  settings: ["/supi-settings", "project/global"],
  skills: ["model-invocation-disabled", "$skill-name shortcut"],
  // biome-ignore lint/security/noSecrets: public test-util API names, not secrets
  "test-utils": ["createPiMock()", "makeCtx()", "getHandlerOrThrow()"],
  "tree-sitter": ["./api", "AST queries", "bundled parsers"],
  web: ["web_fetch_md", "web_docs_search", "web_docs_fetch"],
};
// Flagship agent tools surfaced on the repository-level preview.
const ROOT_BADGES = ["code_resolve", "supi_review_run", "web_fetch_md"];
const SOCIAL_TAGLINES = {
  agent: ["Discovers explicit Agent Profiles and builds", "bounded child-session resource policy."],
  "agent-runtime": [
    "Owns one in-memory Agent Run from session",
    "creation through bounded teardown.",
  ],
  "ask-user": ["Blocking choice & text forms let the agent", "ask you instead of guessing."],
  "bash-timeout": [
    "Injects a default timeout into bash calls",
    "so hung commands can't stall a session.",
  ],
  cache: [
    "Monitors prompt-cache hit rates and explains",
    "regressions: what dropped, when, and why.",
  ],
  "claude-md": [
    "Skills that audit and revise CLAUDE.md and",
    "AGENTS.md with durable session learnings.",
  ],
  "code-intelligence": [
    "Model-callable LSP + AST tools: orient,",
    "inspect, graph, diagnose, and refactor.",
  ],
  "code-runtime": [
    "Shared workspace & capability contracts",
    "behind the code-intelligence stack.",
  ],
  context: ["Live context-window pressure for the agent,", "token-use reports for you."],
  core: ["Config, settings registry, and report", "helpers shared by every SuPi package."],
  debug: ["Captures SuPi debug events and renders them", "inline, filterable by source and level."],
  extras: ["Session comforts: prompt stash, tab spinner,", "shortcuts, clone, titles, git safety."],
  insights: ["Historical session reports — usage, cost,", "cache health — shareable as HTML."],
  lsp: ["Language-server lifecycle, live diagnostics,", "and semantic ops for code intelligence."],
  "prompt-suggestions": [
    "Ghost-text next-prompt suggestions you can",
    "edit before sending. Optional.",
  ],
  review: ["Runs independent inspection-only reviewers", "against one exact frozen Review Target."],
  settings: ["One searchable /supi-settings overlay for", "project & global SuPi configuration."],
  skills: [
    "Keep skills available for explicit commands,",
    "but omit them from the model catalog by scope.",
  ],
  "test-utils": ["Shared pi mocks and test helpers used by", "every SuPi package's test suite."],
  "tree-sitter": ["Structural AST search, outlines, and calls —", "no language server required."],
  web: [
    "Public pages as clean Markdown, plus focused",
    "Context7 docs, sized for context windows.",
  ],
};
const TAGLINE_MAX_CHARS = 58;
const BADGE_COLORS = ["#8aadf4", "#a6da95", "#c6a0f6"];
const BADGE_GAP = 14;
const BADGE_MAX_WIDTH = 660;
const BADGE_X = 506;

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

function badgeWidth(label) {
  // +64: 43px left (dot + gap) and ~21px right padding, so the label reads centered despite the dot.
  return label.length * 10 + 64;
}

function badgesSvg(badges) {
  const totalWidth =
    badges.reduce((width, badge) => width + badgeWidth(badge), 0) + BADGE_GAP * (badges.length - 1);
  assert.ok(
    totalWidth <= BADGE_MAX_WIDTH,
    `Badges exceed ${BADGE_MAX_WIDTH}px: ${badges.join(", ")}`,
  );

  let x = BADGE_X;
  const rendered = badges.map((badge, index) => {
    const width = badgeWidth(badge);
    const svg = `    <g>
      <rect x="${x}" y="402" width="${width}" height="48" rx="24" fill="#363a4f" stroke="#494d64"/>
      <circle cx="${x + 26}" cy="426" r="5" fill="${BADGE_COLORS[index]}"/>
      <text x="${x + 43}" y="432" fill="#cad3f5">${escapeXml(badge)}</text>
    </g>`;
    x += width + BADGE_GAP;
    return svg;
  });

  return `<g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="16" font-weight="600">
${rendered.join("\n")}
  </g>`;
}

function taglineSvg(tagline) {
  return `<g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20" font-weight="500" fill="#a5adcb">
${tagline.map((line, index) => `    <text x="508" y="${322 + index * 30}">${escapeXml(line)}</text>`).join("\n")}
  </g>`;
}

function frameSvg({ title, desc, content }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${desc}</desc>
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
  <text x="252" y="440" fill="#cad3f5" font-family="Futura, Avenir Next, ui-sans-serif, sans-serif" font-size="62" font-weight="700" text-anchor="middle">SuPi</text>
  <text x="252" y="478" fill="#a5adcb" font-family="Futura, Avenir Next, ui-sans-serif, sans-serif" font-size="17" font-weight="600" letter-spacing="3" text-anchor="middle">SUPER PI</text>

${content}

  <path d="M508 480h660" stroke="#494d64"/>
  <text x="508" y="516" fill="#a5adcb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="19">github.com/mrclrchtr/supi</text>
</svg>
`;
}

function kindSvg(kind) {
  return `  <circle cx="512" cy="128" r="6" fill="#8aadf4"/>
  <text x="532" y="136" fill="#a5adcb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20" font-weight="700" letter-spacing="2">${escapeXml(kind)}</text>`;
}

function renderSvg({ badges, description, display, kind, packageName, tagline }) {
  return frameSvg({
    title: `SuPi ${escapeXml(display)}`,
    desc: escapeXml(description),
    content: `${kindSvg(kind)}
  <text x="506" y="228" fill="#cad3f5" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="62" font-weight="750">${escapeXml(display)}</text>
  <text x="508" y="278" fill="#8aadf4" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="20" font-weight="650">${escapeXml(packageName)}</text>

${taglineSvg(tagline)}

${badgesSvg(badges)}`,
  });
}

/** Repository-level preview for the root README banner and the root package.json image. */
function renderRootSvg() {
  return frameSvg({
    title: "SuPi — extensions for the Pi coding agent",
    desc: "SuPi — code intelligence, documentation, reviews, and context tools for the Pi coding agent.",
    content: `${kindSvg("PI EXTENSION STACK")}
  <text x="506" y="225" fill="#cad3f5" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="56" font-weight="750">A developer tool belt</text>
  <text x="506" y="296" fill="#cad3f5" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="50" font-weight="650">for the Pi coding agent</text>

${badgesSvg(ROOT_BADGES)}`,
  });
}

/** Rasterize an SVG string to a 1280×640 PNG8 via Inkscape + ImageMagick. */
function rasterizeSvg(svg, output) {
  const temporarySvg = `${output}.tmp.svg`;
  const temporaryPng = `${output}.tmp.png`;
  try {
    writeFileSync(temporarySvg, svg);
    execFileSync("inkscape", [
      temporarySvg,
      `--export-filename=${temporaryPng}`,
      "--export-width=1280",
      "--export-height=640",
    ]);
    execFileSync("magick", [temporaryPng, "-strip", "-colors", "256", `PNG8:${output}`]);
  } finally {
    for (const temporaryFile of [temporarySvg, temporaryPng]) {
      if (existsSync(temporaryFile)) unlinkSync(temporaryFile);
    }
  }
}

function main() {
  assert.equal(badgeWidth("LSP + AST"), 154);

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
    const output = resolve(packageRoot, "assets", "social-preview.png");
    const badges = SOCIAL_BADGES[shortName];
    assert.ok(badges, `Missing social badges: ${packageJson.name}`);
    const tagline = SOCIAL_TAGLINES[shortName];
    assert.ok(tagline, `Missing social tagline: ${packageJson.name}`);
    for (const line of tagline) {
      assert.ok(
        line.length <= TAGLINE_MAX_CHARS,
        `Tagline line too long in ${packageJson.name}: ${line}`,
      );
    }
    const svg = renderSvg({
      badges,
      description: packageJson.description,
      display: displayName(shortName),
      kind: packageJson.pi?.extensions?.length ? "PI EXTENSION" : "SUPI LIBRARY",
      packageName: packageJson.name,
      tagline,
    });

    rasterizeSvg(svg, output);
    console.log(`  ${packageDir}/assets/social-preview.png`);
  }

  rasterizeSvg(renderRootSvg(), resolve(ROOT, "assets", "social-preview.png"));
  console.log("  assets/social-preview.png");
}

main();
