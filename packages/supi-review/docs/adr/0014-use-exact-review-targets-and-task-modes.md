# Use exact Review Targets and task Review Modes

Review requests use one Review Target that selects at most one explicit source object: `workingTree` for the frozen current filesystem or `committed` for exact committed Git state. `workingTree` carries an optional `from` endpoint; `committed` carries optional `from` and `to` endpoints, with `to` defaulting to `HEAD`. Advisory `paths` is a separate batch-level Review Scope. Each Review Task must select `mode: "change" | "state"`: `change` receives before-and-after evidence and requires a non-empty change, while `state` receives only the frozen after state.

The source-object shape makes the after-state choice explicit and prevents invalid cross-field combinations in provider-compatible schemas without conditional defaults, unions, or literals. It removes the boolean target flag and target kinds, keeps branch merge-base selection in the interactive picker, and supersedes the target and scope decisions in ADRs 0002, 0009, and 0012.
