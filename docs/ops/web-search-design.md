# Web Search design investigation

Status: implemented and verified against the user-confirmed design.

## Agreed scope

- Extend `packages/supi-web` with `web_search` for the main session only.
- Return titles, source URLs, and Source Excerpts. Do not generate an answer.
- Use the installed `bx` executable.
- Do not add domain-filter fields.
- Leave search size parameters unset. Use the defaults selected by `bx` and Brave.
- Do not switch to another search operation after failure.
- Omit the tool when `bx` is missing. Warn the user when the setting enables the tool but `bx` is missing.
- Keep skill visibility under separate user control. Do not delete or automatically suppress the `bx` skill.
- Expose optional `freshness` with the documented Brave values through `bx --extra`.
- Return formatted results inline, with complete formatted output in a file when the package's standard output limit is exceeded.
- Enable Web Search by default. Apply settings and availability changes on `/reload`, not through live tool activation.
- Do not add SuPi retries. Use one bx invocation per tool call and retain bx request behavior.
- Fail on malformed required result data. Accept additional fields and missing optional metadata. Do not return an implicit partial result.
- Require deterministic tests. A live Brave smoke test is optional and is not a test-suite requirement.

Domain terms: [supi-web glossary](../../packages/supi-web/CONTEXT.md).

## Freshness support

| Question | Verified finding | Source |
| --- | --- | --- |
| Does the context endpoint support freshness? | Yes. It accepts `pd`, `pw`, `pm`, `py`, or `YYYY-MM-DDtoYYYY-MM-DD`. | [Brave service documentation](https://api-dashboard.search.brave.com/documentation/services/llm-context#freshness), [endpoint reference](https://api-dashboard.search.brave.com/api-reference/ai/llm_context/get#parameter-freshness) |
| What does freshness mean? | Brave uses the most relevant date reported by the content, such as its publication or last modification date. This is not a strict publication-date guarantee. | Same references |
| Does `bx 1.5.0 context` have a named freshness flag? | No. `ContextArgs` does not define one. | [versioned source](https://github.com/brave/brave-search-cli/blob/v1.5.0/src/main.rs#L651-L741), local `bx context --help` |
| Can bx send the documented parameter? | Yes. Its documented `--extra KEY=VALUE` interface adds parameters to the POST body. `cmd_context` merges these values before it calls `/res/v1/llm/context`. | [CLI documentation](https://github.com/brave/brave-search-cli/blob/v1.5.0/README.md#extra-parameters-and-custom-endpoints), [context request code](https://github.com/brave/brave-search-cli/blob/v1.5.0/src/main.rs#L1729-L1790) |

Supported command shape for a freshness-filtered search:

```sh
bx context --extra freshness=pw -- 'Node.js release changes'
```

This uses a documented CLI interface and a documented service parameter. It does not require scraping dates, rewriting queries, or switching to `bx web`.

## Defaults and result compatibility

- `bx 1.5.0` leaves omitted source and token fields out of the context request. The service selects its defaults. [Source](https://github.com/brave/brave-search-cli/blob/v1.5.0/src/main.rs#L1729-L1790).
- Brave currently documents defaults of 20 considered search results, 20 returned URLs, about 8,192 total tokens, and 4,096 tokens per URL. These are observations, not proposed SuPi constants. [Source](https://api-dashboard.search.brave.com/documentation/services/llm-context#parameters).
- The main result data is `grounding.generic[]`, with `url`, `title`, and `snippets[]`. Snippets can contain text or JSON-serialized structured data. [Source](https://api-dashboard.search.brave.com/documentation/services/llm-context#response-format).
- Source date metadata can be empty. The current service documentation describes four positions in `sources[url].age`; the older local skill example shows three. A reader must not require one fixed array length. [Source](https://api-dashboard.search.brave.com/documentation/services/llm-context#response-fields).
- The existing package helper preserves full Markdown in a temporary file when inline output exceeds Pi's standard 2,000-line or 50 KB limit. This changes result delivery, not the search request. [Source](../../packages/supi-web/src/tool/result.ts).

## Settings and availability

- This change adds the Web Search enabled flag to `supi-web`, which had no settings contribution before this change. [Settings registration](../../packages/supi-web/src/settings-registration.ts), [manifest](../../packages/supi-web/package.json).
- A small enabled-flag example exists in [supi-context settings registration](../../packages/supi-context/src/settings-registration.ts).
- Settings actions can return a user-facing warning through `SettingsApplyResult.notice`. [Interface](../../packages/supi-core/src/settings/settings-registry.ts).
- Adding shared settings requires a runtime and bundled dependency on `supi-core`. This library-only package has no extension entry to forward.
- Installed Pi 0.86.1 docs, `docs/extensions.md` under `pi.registerTool`, permit registration at startup or later. They specify `pi.setActiveTools()` for activation changes. Changes must preserve unrelated active tools.
- Agent Runs and reviewers do not inherit all parent extension tools. Their fixed capability sets remain unchanged in this scope. [Agent decision](../../packages/supi-agent/docs/adr/0002-use-a-fixed-child-capability-set.md), [Review decision](../../packages/supi-review/docs/adr/0007-run-direct-reviewers-in-frozen-workspaces.md).

## Approved implementation contract

### Agent interface

```ts
web_search({
  query: string,
  freshness?: string,
})
```

- Reject empty queries. Do not rewrite queries to simulate source or date filters.
- Accept only documented freshness codes or a valid ordered date range. Do not expose raw CLI flags, `extra`, endpoint overrides, or credentials as tool arguments.
- Run explicit `bx context` with an argument array, not shell interpolation. Put the query after `--` so a leading hyphen cannot become an option.
- Add `--extra freshness=<value>` only when the caller supplied the Freshness Filter.
- Leave count, token, snippet, URL, and relevance settings unset.
- Use normal bx environment/configuration handling. Do not add a second credential store, auto-install the binary, or override its configured request timeout.
- Propagate cancellation to the process. Do not add retries or switch search operations.

### Results and errors

- Return compact Markdown with each source title, URL, and its Source Excerpts. Preserve snippet text and provider order; do not generate summaries or apply a second relevance filter.
- Use one introduction, short source dates below titles, and blank lines between quoted excerpts. Do not repeat excerpt labels.
- Treat source content as untrusted data, not instructions.
- Treat dates as optional provider-reported source metadata, not verified publication dates. Do not require a fixed date-array length.
- Validate the result envelope and required source fields. Ignore unknown fields. Malformed required data is a tool failure, not an empty result.
- A valid empty source list is a successful search with no matching source excerpts.
- Preserve full formatted content through the existing `limitModelVisibleOutput` helper if inline output exceeds Pi's standard limit. Report truncation and the full-output file path.
- Throw for execution failures, invalid output, authentication/plan errors, rate limits, and service failures. Report safe next steps without exposing keys or unrestricted process diagnostics.

### Settings and lifecycle

- Add a Web Search enabled flag to the package's settings contribution. Default: enabled.
- Preserve normal global/project scope behavior.
- Evaluate the effective setting and bx availability when extensions load or reload. Register `web_search` only when enabled and bx is available.
- When enabled but bx is missing, warn the user and keep the tool absent. Keep the configured preference enabled; absence must not overwrite it.
- Settings changes report that `/reload` is required. Enabling while bx is missing also produces the requested warning. Do not change active tools before reload.
- Keep warnings in human-facing channels. Do not add missing-setup instructions to the model's system prompt.
- Do not make a network request to test credentials at startup. A present binary does not prove valid credentials or plan access; these failures remain call-time errors.
- Keep the existing web tools independent. Do not change Agent or Review capability sets or the bx skill preference.

### Package structure and verification

- Follow the existing per-tool layout under `packages/supi-web/src/tool/web_search/`.
- Keep bx process handling and response parsing behind a small internal interface. Do not add a general provider framework.
- Reuse the package's result handling and rendering patterns.
- Add and bundle the shared settings dependency as required by the package conventions.
- Test query/freshness arguments, absence of size overrides, leading-hyphen queries, successful and empty results, malformed data, additional fields, optional dates, cancellation, exit failures, missing bx, scoped settings, reload behavior, warnings, and file overflow.
- Use a fake executable for deterministic integration tests. A local HTTP capture can verify the installed bx request without Brave credentials or quota use.
- Run `pnpm verify:ai` for implementation changes. Documentation-only interview updates do not require it.

## Final confirmation

The user confirmed this contract and requested implementation. The user later requested live checks after `/reload`. Personal bx skill preferences remain unchanged.

## Verification record

- `pnpm verify:ai` passed: lint, typecheck, skill checks, 3,740 tests passed, 2 tests skipped, and all 21 package tarballs verified.
- The focused `supi-web` suite passed all 148 tests.
- Independent review findings were checked and fixed: renderer coverage, root schema/prompt test registration, and the README tool count.
- Regression tests cover exact preservation of JSON-formatted snippets, UTF-8 text split across process-output chunks, and compact excerpt formatting.
- Live tool calls confirmed ordinary search, weekly freshness, custom date ranges, leading-hyphen queries, empty results, invalid-input rejection, and search-to-page-fetch use.
- A live call after the final reload confirmed one introduction, short source dates, and separate quoted excerpts without repeated labels.
- An unfiltered Node.js search returned an outdated release table. Fetching the same URL returned the current table. Search excerpts are not a guarantee of current page content.
- The bx skill preference and personal configuration were not changed.

## Evidence limits

- Live Brave requests used the existing bx setup; no credential or personal bx configuration was inspected.
- Live checks did not cover missing-binary warnings, settings transitions, cancellation, overflow files, or visual terminal rendering. Automated tests cover these paths where applicable.
- The API documentation at `api.search.brave.com/app/documentation/context` returned HTTP 403. The public `api-dashboard.search.brave.com` service documentation and endpoint reference were accessible.
