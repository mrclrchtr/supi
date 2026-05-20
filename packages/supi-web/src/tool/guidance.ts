import { spawnSync } from "node:child_process";

// Prompt guidance and tool description for the web_fetch_md tool.

const INLINE_MAX_CHARS = 15_000;

export const toolDescription = `Fetch a web page and convert it to clean Markdown for LLM ingestion.

Only accepts real \`http://\` or \`https://\` URLs. If the page is access-controlled (login, paywall, private content), stop and ask the user for an allowed source or exported content.

Output modes:
- \`auto\` (default): returns Markdown inline if ≤${INLINE_MAX_CHARS.toLocaleString()} characters; otherwise writes to a temporary file and returns the path.
- \`inline\`: always returns Markdown inline.
- \`file\`: always writes to a temporary file and returns the path.

Links and images are absolutized by default. Use \`abs_links: false\` to keep them as-is.`;

export const promptSnippet =
  "web_fetch_md — fetch a URL and convert it to clean Markdown suitable for LLM ingestion.";

function isGhAvailable(): boolean {
  try {
    const result = spawnSync("gh", ["--version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function buildPromptGuidelines(): string[] {
  const guidelines = [
    "Use web_fetch_md to fetch web pages and convert them to clean Markdown for LLM ingestion.",
    "Only accept real `http://` or `https://` URLs; stop and ask the user for an allowed source if the page is access-controlled.",
    "Prefer `output_mode: auto` (default) so large pages are written to temp files instead of flooding the context window.",
    "Set `abs_links: false` only when relative links are intentional (e.g., local documentation).",
  ];
  if (isGhAvailable()) {
    guidelines.push(
      "For GitHub URLs (e.g., repos, issues, PRs, releases), prefer the `gh` CLI via `bash` over this tool.",
    );
  }
  return guidelines;
}
