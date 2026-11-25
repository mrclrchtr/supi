# Changelog

## [16.0.0]

- `/supi-insights` model requests are now one-shot requests: the model provider keeps no conversation state for them. With `claude-code` models, no idle `claude` processes remain after a report ([#692](https://github.com/mrclrchtr/supi/issues/692)).

## [14.0.0]

- The `/supi-insights` result message now shows a `PI Insights` stats line instead of the raw `[supi-insights-report]` header. Expand it to see the At-a-Glance summary and the report link, which were previously never displayed.

## [11.3.0]

- Added package-specific release notes for historical session analysis and HTML reports.
