import { spawnSync } from "node:child_process";

// Prompt guidance and tool description for the web_fetch_md tool.

const INLINE_MAX_CHARS = 15_000;

export const toolDescription = `Fetch a web page and convert it to clean Markdown for LLM ingestion.

Use web_fetch_md when the user provides a public URL or asks you to inspect public web content. Only accepts real \`http://\` or \`https://\` URLs. If the page is access-controlled (login, paywall, private content), stop and ask the user for an allowed source or exported content.

Output modes:
- \`auto\` (default): returns Markdown inline if ≤${INLINE_MAX_CHARS.toLocaleString()} characters; otherwise writes to a temporary file and returns the path.
- \`inline\`: always returns Markdown inline.
- \`file\`: always writes to a temporary file and returns the path.

Links and images are absolutized by default. Use \`abs_links: false\` to keep them as-is.`;

export const promptSnippet =
  "web_fetch_md — fetch a public URL and convert the response to clean Markdown for LLM ingestion";

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
    "Use web_fetch_md to fetch a public web page and convert it to clean Markdown for the model.",
    "Use web_fetch_md only with real `http://` or `https://` URLs; if a page is access-controlled, stop and ask the user for an allowed source or exported content.",
    "Use web_fetch_md with `output_mode: auto` unless you have a specific reason to force inline output or a temp file path.",
    "Use web_fetch_md with `output_mode: inline` only when you need the Markdown directly in context, and use web_fetch_md with `output_mode: file` when you explicitly want a saved temp file path.",
    "Use web_fetch_md with `abs_links: false` only when relative links or images are intentionally desired.",
  ];
  if (isGhAvailable()) {
    guidelines.push(
      "Use bash with the `gh` CLI instead of web_fetch_md for GitHub URLs when `gh` is available.",
    );
  }
  return guidelines;
}
