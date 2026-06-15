# Task 4: Correct API key guidance in README.md and CLAUDE.md

## Goal

Fix misleading documentation that says Context7 works without an API key. The Context7 API requires authentication — the key is optional only in the sense that the extension won't crash without it, but requests will get 401 errors.

## Files

- `packages/supi-web/README.md`
- `packages/supi-web/CLAUDE.md`

## Changes

### README.md (lines ~98-102)

Replace:
```
If CONTEXT7_API_KEY is set in your environment, the SDK uses it automatically for higher rate limits. Without a key, the tools still work with lower defaults.
```
With:
```
Set CONTEXT7_API_KEY in your environment to authenticate with the Context7 API. Without a key, the tools will return an authentication error when called. Get a free API key at https://context7.com/dashboard.
```

### CLAUDE.md (line ~52)

Replace:
```
API key read from CONTEXT7_API_KEY env var automatically by the SDK; works unauthenticated with lower rate limits
```
With:
```
API key read from CONTEXT7_API_KEY env var automatically; without a key, requests return an authentication error
```

## Verification

- Read both files and confirm the corrected text
- Test-exempt: docs-only change, no code impact
