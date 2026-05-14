## Design — web_docs Context7 Tool for supi-web

**Approach:** Two pi tools (`web_docs_search` + `web_docs_fetch`) backed by `@upstash/context7-sdk`.

### Tool 1: `web_docs_search`
- `library_name` (required) — library name to search for
- `query` (required) — what the agent is trying to do (relevance ranking)
- Returns formatted Markdown table of matching libraries (id, name, description, scores, versions)

### Tool 2: `web_docs_fetch`
- `library_id` (required) — Context7 library ID (e.g. `/facebook/react`)
- `query` (required) — specific question
- `raw` (optional, default false) — when true, returns JSON snippets; otherwise pre-formatted Markdown text

### Architecture
- `src/context7-client.ts` — thin wrapper around `@upstash/context7-sdk` (lazy init, error mapping)
- `src/docs.ts` — registers both tools (mirrors existing `web.ts` pattern)
- API key: `CONTEXT7_API_KEY` env var only (SDK reads it automatically)
- No auth needed — works unauthenticated with lower rate limits

### Dependencies
- New: `@upstash/context7-sdk` in `dependencies`
- Existing: `@mrclrchtr/supi-core` (bundled), `@earendil-works/pi-coding-agent` + `typebox` (peer)

### Non-goals
- No config file support for API key
- No caching layer (agent-level caching is sufficient)
- No version pinning in initial implementation