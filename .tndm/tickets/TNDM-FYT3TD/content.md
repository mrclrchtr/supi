## Approved Design: `supi-web` Extension

**Goal:** Replace the `.agents/skills/web-fetch-to-markdown/` skill with a proper SuPi extension that registers a `web_fetch_md` pi tool.

### Tool: `web_fetch_md`

**Parameters (TypeBox):**
| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | `string` | ✅ | — | http(s) URL to fetch |
| `output_mode` | `"auto" \| "inline" \| "file"` | ❌ | `"auto"` | `auto` = inline if ≤15,000 chars, else temp file; `inline` = always inline; `file` = always temp file |
| `abs_links` | `boolean` | ❌ | `true` | Absolutize relative links/images in the output |
| `timeout_ms` | `number` | ❌ | `30000` | Fetch timeout in milliseconds |

**Returns:**
- **Inline:** `{ content: [{ type: "text", text: markdown }] }`
- **File:** `{ content: [{ type: "text", text: "Content written to /tmp/pi-web-fetch-md-<hash>.md (X chars, Y lines). Use the read tool to access it." }] }`

### Architecture

New package: `packages/supi-web/`

```
src/
├── web.ts       # Extension factory — registers tool
├── fetch.ts     # HTTP logic (HEAD negotiation, GET, timeout, sniffing)
├── convert.ts   # HTML→Markdown (JSDOM + Readability + Turndown)
└── index.ts     # Public exports
```

**Content negotiation (ported from existing skill):**
1. HEAD request → check `content-type` for Markdown
2. Range GET (first 8KB) → sniff if already Markdown, plain text, or HTML
3. Try sibling `.md` URLs (e.g., `page.md` for `page.html`)
4. Full GET + HTML → Readability → Turndown → clean Markdown

**Dependencies:**
- Runtime: `jsdom`, `@mozilla/readability`, `turndown`, `@mrclrchtr/supi-core`
- Dev: `vitest`, `@types/jsdom`

**Meta-package integration:**
- Add to `packages/supi/package.json` `dependencies` + `bundledDependencies`
- Add wrapper `src/web.ts` in `packages/supi/`
- Add to `pi.extensions` array

**Cleanup:**
- Delete `.agents/skills/web-fetch-to-markdown/` entirely

**Tests:**
- Mock fetch + JSDOM for unit tests
- Validate param rejection (bad URLs), mode switching, content negotiation paths

### Prompt Guidelines
- "Use `web_fetch_md` to fetch web pages and convert them to clean Markdown for LLM ingestion."
- "Only accept real `http://` or `https://` URLs; stop and ask the user for an allowed source if the page is access-controlled."

### Constraints / non-goals
- No browser rendering (JS-rendered SPAs still need user-provided HTML)
- No proxy/auth support beyond standard Node `fetch`
- No caching (fresh fetch every time)
