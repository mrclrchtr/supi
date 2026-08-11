# Use exact Review Targets and task Review Modes

Review requests use one Review Target with exact `from` and `to` commit endpoints plus optional uncommitted changes; advisory `paths` is separate batch-level Review Scope. Each Review Task must select `mode: "change" | "state"`: `change` receives before-and-after evidence and requires a non-empty change, while `state` receives only the frozen after state. This model removes target kinds and Finding Scope, keeps branch merge-base selection in the interactive picker, and supersedes the target and scope decisions in ADRs 0002, 0009, and 0012.
