# Reference authoritative Review Criteria Sources

> **Status: Superseded** by [ADR 0019](0019-embed-repository-instruction-files-in-reviewer-packets.md): `criteriaSources` is removed, and the Review Engine carries Repository Instruction Files in every Reviewer Packet.

Review Tasks may carry multiple Review Criteria Sources as generic references with caller summaries; sources may be external issues or repository documents, and the identified source remains authoritative. Reviewers use the summary first and may retrieve a source read-only when needed, while the Review Engine does not fetch or embed full source text. If required detail is unavailable, the reviewer preserves concrete findings and marks Criteria Coverage incomplete; blocking findings still derive `issues`, otherwise incomplete coverage derives `incomplete`. This keeps packets compact and avoids issue-tracker coupling, accepting that summary-only packets cannot guarantee complete offline specification coverage.
