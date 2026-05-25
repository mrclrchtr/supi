# @mrclrchtr/supi-insights

Adds a `/supi-insights` command to the [pi coding agent](https://github.com/earendil-works/pi) that analyzes your historical pi sessions and writes a shareable HTML report.

## Install

```bash
pi install npm:@mrclrchtr/supi-insights
```

This is a **beta** package. Install individually.

For local development:

```bash
pi install ./packages/supi-insights
```

After editing the source, run `/reload`.

![Insights CLI](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-insights-cli.png)

![Insights HTML report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-insights-1.png)

![Insights HTML report detail](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-insights-2.png)

## What you get

After install, pi gets one command:

- `/supi-insights` — scan session history, generate metrics and narrative insights, and save an HTML report

The command pipeline is:

1. list historical sessions with `SessionManager.listAll()`
2. parse session files and extract metadata such as message counts, tools, languages, git activity, lines changed, response times, and tool errors
3. run LLM-based facet extraction on a bounded set of sessions
4. aggregate the results across sessions
5. generate an HTML report and post a short in-chat summary with the saved file path

## What the report covers

The generated report can include:

- at-a-glance summary
- project areas
- interaction style
- what works well
- friction analysis
- suggestions
- future opportunities
- charts and aggregate stats for tools, languages, outcomes, satisfaction, response times, time of day, and multi-session overlap

## Output and caching

Reports are written under pi's agent directory (typically `~/.pi/agent/`):

- reports: `~/.pi/agent/supi/insights/report-*.html`
- metadata cache: `~/.pi/agent/supi/insights/meta/*.json`
- facet cache: `~/.pi/agent/supi/insights/facets/*.json`

The cache key includes:

- session id
- session file path hash
- modified timestamp hash

That keeps branched or resumed session files from colliding.

## Important limits

Built-in defaults:

- `maxSessions`: `200`
- `maxFacets`: `50`

Filtering in the current implementation:

- sessions with fewer than 2 user messages are skipped from the final analysis set
- sessions shorter than 1 minute are skipped from the final analysis set
- sessions whose only facet category is `warmup_minimal` are dropped after facet extraction

## Settings

This package registers an **Insights** section in `/supi-settings`.

Available settings:

- `enabled` — turn the command on or off
- `maxSessions` — maximum sessions to fully analyze
- `maxFacets` — maximum LLM facet extractions

Defaults:

```json
{
  "insights": {
    "enabled": true,
    "maxSessions": 200,
    "maxFacets": 50
  }
}
```

## Source

- `src/insights.ts` — command, settings, and end-to-end report generation
- `src/scanner.ts` — session discovery
- `src/parser.ts` — session parsing and metadata extraction
- `src/aggregator.ts` — aggregated statistics and multi-session overlap detection
- `src/generator.ts` — narrative insight generation
- `src/html.ts` — HTML report output
- `src/cache.ts` — metadata and facet caching
