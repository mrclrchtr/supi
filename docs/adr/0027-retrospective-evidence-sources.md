---
status: accepted
---

# Keep three Retrospective Evidence sources with one-way package coupling

SuPi learns from past sessions through three sources: Session Facets extracted by `supi-insights`, Agent Run Retrospectives, and Tooling Retrospectives. We treat them as one body of Retrospective Evidence with two outputs, the Insights Report for people and evidence snapshots for agents, but each source keeps its own format and its producer keeps capture. Persisted Debug events in session files are the only cross-package contract: `supi-insights` reads them, and `supi-debug` knows nothing about Session Facets. No package moves or merges ([#593](https://github.com/mrclrchtr/supi/issues/593)).

## Considered Options

- **One normalized record schema for all sources:** rejected. Retrospectives are free-form self-reports; structuring them needs another model pass and a report schema that the [Agent Run retrospective convention](../conventions/agent-run-retrospectives.md) excludes.
- **Move all historical analysis into `supi-insights`:** rejected. Users with only `supi-debug` would lose `gather-retrospectives` and `session-analytics` for no new capability.
- **Dissolve `supi-insights` into `supi-debug`:** rejected. Debug inspects diagnostic events; it should not carry model extraction, a facet cache, and an HTML generator.
- **Let the `gather-retrospectives` collector read the facet cache:** rejected. Both packages would depend on each other's storage format, and the collector would only work fully with `supi-insights` installed.
- **Shared readers in `supi-core`:** rejected. Skill scripts are standalone `.mjs` files without package imports.
- **Extract Session Facets at `session_shutdown`:** rejected. A model request would delay quitting, abort on SIGTERM, and also run on reload, fork, and session replacement.

## Consequences

- An agent that wants all evidence runs two skills: `gather-retrospectives` for self-reports and the `supi-insights` facet export.
- The Insights Report is the only place that combines all three sources. It degrades to Session Facets alone when no Debug events were persisted.
- Session Facets record Tooling Friction with the affected surface and a session reference, so agents can trace a finding back to the transcript.
- Automatic facet extraction is an opt-in setting, off by default. It catches up on idle recent sessions after `session_start`, bounded per start, and never backfills old history; `/supi-insights` remains the way to process older sessions.
- `/supi-tooling-retro` becomes an extension command so its report can be stored as a Debug event. It still runs when Debug persistence is inactive and then states that nothing was stored. Prompt-template overrides of that name stop working, which is a breaking change.
- Interactive Tooling Retrospectives written before this change are not collected.
