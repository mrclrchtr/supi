import { spawnSync } from "node:child_process";

// Prompt guidance and tool description for the web_fetch_md tool.

const INLINE_MAX_CHARS = 15_000;

export const toolDescription = `Fetch a web page and convert it to Markdown.

Use web_fetch_md only for public \`http://\` or \`https://\` URLs. If a page is private or access-controlled, ask for another source.

Output modes:
- \`auto\` (default): inline up to ${INLINE_MAX_CHARS.toLocaleString()} chars, otherwise return a temp file path
- \`inline\`: always inline
- \`file\`: always return a temp file path

Links and images default to absolute; use \`abs_links: false\` to keep relative paths.`;

export const promptSnippet = "web_fetch_md — fetch a public URL as Markdown";

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
    "Use web_fetch_md only for public `http://` or `https://` pages; if a page is private or access-controlled, ask for an allowed source.",
    "Use web_fetch_md with `output_mode: auto` by default; use `inline` for in-context Markdown and `file` for a temp path.",
    "Use web_fetch_md with `abs_links: false` only when you want relative links or images.",
  ];
  if (isGhAvailable()) {
    guidelines.push(
      "Use bash with the `gh` CLI instead of web_fetch_md for GitHub URLs when `gh` is available.",
    );
  }
  return guidelines;
}
