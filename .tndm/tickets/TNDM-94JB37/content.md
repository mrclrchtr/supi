## Brainstorming Outcome

**Problem**: The reference `model-effort-colors.ts` extension uses hardcoded hex colors. We want theme-native coloring.

**Recommended approach**: Add a `model-effort-colors.ts` module to `supi-extras` that replaces the footer with `ctx.ui.setFooter()`, coloring model/effort using PI Theme tokens.

**Why**: PI already has thinking-level theme tokens. Provider-brand colors don't exist in the theme, so we map providers to semantic tokens (OpenAI→success, Anthropic→accent, etc.). No animations, no hardcoded hex.

### Color mappings

| What | Theme Token |
|---|---|
| Anthropic/Claude | `accent` |
| OpenAI/GPT | `success` |
| Google/Gemini | `warning` |
| Mistral/Codestral | `muted` |
| xAI/Grok | `thinkingXhigh` |
| DeepSeek | `thinkingHigh` |
| Meta/Llama | `thinkingMedium` |
| local/Ollama | `dim` |
| Unknown | `dim` |
| thinking=off | `thinkingOff` |
| thinking=minimal | `thinkingMinimal` |
| thinking=low | `thinkingLow` |
| thinking=medium | `thinkingMedium` |
| thinking=high | `thinkingHigh` |
| thinking=xhigh/max | `thinkingXhigh` |

## Implementation Summary

**Files:**
- `packages/supi-extras/src/model-effort-colors.ts` — Extension module
- `packages/supi-extras/src/model-effort-colors-helpers.ts` — Pure helpers (color mapping, stats, formatters)
- `packages/supi-extras/src/index.ts` — Wired in
- `packages/supi-extras/__tests__/model-effort-colors.test.ts` — 11 unit tests

## Verification Results

- 36/36 tests pass (full supi-extras suite)
- 0 Biome errors
- 0 TypeScript errors
