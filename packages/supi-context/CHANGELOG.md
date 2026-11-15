# Changelog

## [13.0.0]

- Oversized `context_report` attribution files are now written to one private per-user directory, `$TMPDIR/supi-<uid>/`, instead of a new `supi-*` directory per call. Identical content reuses one file. SuPi never deletes these files; the OS temp purge does ([#597](https://github.com/mrclrchtr/supi/issues/597)).

## [12.0.0]

- Codemode now lists the `context_report` tool under a `context` namespace heading, so scripts can find them with `describeNamespace("context")` or `searchTools(query, { namespace: "context" })`. It is annotated read-only ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.3.0]

- Added package-specific release notes for live context-pressure and token-use reports.
