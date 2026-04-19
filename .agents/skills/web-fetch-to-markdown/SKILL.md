---
name: web-fetch-to-markdown
description: Fetches and normalizes http(s) web pages into clean Markdown for LLM ingestion. Use when a task includes a URL, needs to fetch docs or asks to convert web docs/articles/pages into Markdown for summarizing, quoting, diffing, or saving.
---

# Web Fetch to Markdown

## Goal

Fetch a single `http(s)` URL and output clean Markdown.

## Workflow

Fetch a URL and print Markdown to stdout:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" "<url>"
```

OR write Markdown to a file:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" "<url>" page.md
```

## Useful flags

```bash
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" --help
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" --timeout-ms 60000 "<url>" > page.md
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" --debug "<url>" > page.md
bash "${CLAUDE_PLUGIN_ROOT:-skills/web-fetch-to-markdown}/scripts/fetchmd" --no-abs-links "<url>" > page.md
```

Note: links/images are absolute by default; use `--no-abs-links` to keep them as-is.

## Guardrails

- Only accept real `http://` or `https://` URLs; otherwise stop and request a valid URL.
- If the page is access-controlled (login, paywall, private content), stop and ask the user for an allowed source or exported content.

## Troubleshooting

- Slow or flaky fetch: retry with a larger `--timeout-ms` and use `--debug`.
- Output looks like placeholders (common for SPAs/JS-rendered pages): ask the user for rendered HTML/text (or a browser capture) and then convert.
- Output is mostly navigation/footer: try an alternate official Markdown source (docs `.md`, README) or a "printable" version if available.
