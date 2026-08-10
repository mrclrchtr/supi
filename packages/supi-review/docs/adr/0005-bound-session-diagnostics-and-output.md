# Bound session diagnostics and output

> **Status: Partially superseded.** Bounded diagnostics and review-output paging remain current. ADR 0015 removes the preparation surface, so there is no preparation output. ADR 0014 defines the current Review Target and Review Mode contract.

Child failures retain allowlisted lifecycle facts and optional provider-owned error summaries only. Summaries come from Pi's canonical provider error fields, pass through shared secret redaction, have terminal controls removed, and are capped at 500 characters. Assistant conversation, repository evidence, tool arguments, and tool results are excluded.

Complete parent-facing preparation and review text is retained separately in a bounded, expiring session artifact store. Initial tool results return one page and an opaque artifact id; `supi_review_output` provides repeatable continuation pages. This keeps model-facing calls bounded without silently dropping valid findings.
