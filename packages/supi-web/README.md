<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-web">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-web/assets/social-preview.png" alt="SuPi Web" width="100%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-web — Web Fetch and Context7 for Pi

Adds web fetch and Context7 documentation tools to the [Pi coding agent](https://github.com/earendil-works/pi), without making you paste sources into chat.

## What your agent gets

After installation, keep asking Pi normal questions. The agent can:

- **Read public web pages as clean Markdown** — extract the main article instead of returning navigation, scripts, styles, and raw HTML.
- **Prefer source Markdown when available** — detect Markdown responses and common Markdown siblings before converting HTML.
- **Handle plain-text and source files** — wrap them in fenced code blocks with a language hint when the URL provides one.
- **Look up current library docs** — search Context7 for the right project and version, then retrieve documentation focused on the task at hand.
- **Protect the context window** — return small results inline, move long pages to temporary files, and preserve full output when model-visible text must be truncated.

Relative page links and images become absolute by default, so the agent can follow them without reconstructing URLs.

## Example requests

You do not need to learn the tool-call syntax. Try asking Pi:

- “Read this public design document and summarize the decisions: `https://example.com/spec`.”
- “Check the current React documentation for effect cleanup.”
- “Find the FastAPI docs for lifespan events and show the recommended pattern.”
- “Fetch this long reference page to a file, then read only the relevant section.”
- “Compare this library's current docs with the code in the repository.”

## Agent tools

The package adds three tools that Pi selects as needed:

| Tool | What it lets the agent do |
|---|---|
| `web_fetch_md` | Fetch a public HTTP(S) page and return readable Markdown, fenced plain text, or a temporary file |
| `web_docs_search` | Find matching Context7 library IDs, versions, trust scores, benchmark scores, and snippet counts |
| `web_docs_fetch` | Retrieve focused documentation for a chosen Context7 library ID |

Pi searches Context7 first when the library ID is unknown, then fetches docs with the selected ID. Narrow questions produce more useful documentation context than broad requests. Documentation returns as Markdown by default; the agent can request structured JSON snippets when needed.

## How page fetching works

`web_fetch_md` chooses the cleanest representation it can find:

1. Use Markdown returned directly by the server.
2. Detect Markdown or plain text from the response content.
3. Check common `.md`, `.markdown`, `index.md`, and `README.md` alternatives.
4. For HTML, extract the primary readable content and convert it to GitHub-flavored Markdown.

It follows redirects, removes scripts and styles, preserves useful structures such as headings, links, lists, code blocks, and tables, and makes relative links absolute by default.

### Large pages

The default `auto` mode returns content inline up to 15,000 characters and writes larger pages to a temporary Markdown file. You can ask Pi to force inline or file output.

All three tools cap model-visible inline output at Pi's 2,000-line / 50KB limit. If output is truncated, the complete result is saved to a temporary file for follow-up reads.

Tool rows stay collapsed in Pi's TUI by default. Press `Ctrl+O` to expand their inline output.

## Install

```bash
pi install npm:@mrclrchtr/supi-web
```

To try it for one run without installing:

```bash
pi -e npm:@mrclrchtr/supi-web
```

## Context7 API key

The documentation tools call the [Context7 API](https://context7.com/). Create a free key at <https://context7.com/dashboard>, export it before starting Pi, and keep it out of repository files:

```bash
export CONTEXT7_API_KEY="ctx7sk-..."
pi
```

`web_fetch_md` does not use Context7 and needs no API key.

## Boundaries

- `web_fetch_md` is for public `http://` and `https://` sources. It does not authenticate to login-protected, private, or paywalled pages.
- It fetches HTTP responses and does not run a browser, page JavaScript, or interactive flows; client-rendered pages may expose little useful content.
- When the `gh` CLI is available, Pi is guided to use it instead for GitHub URLs.
- Fetched pages are external, untrusted content. Treat them as source material, not as repository instructions.
