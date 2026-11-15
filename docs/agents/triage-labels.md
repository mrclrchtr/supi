# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Repo-specific labels

| Label | Meaning |
| --- | --- |
| `to-be-refined` | Accepted direction; scope or design still needs refinement before an agent or human can implement it. |
| `waiting` | Blocked on an external event, such as an upstream release or a soak period. Use `needs-info` when the reporter must answer. |

Kind labels (`bug`, `enhancement`, `documentation`) combine with one state label. Renovate applies `dependencies`; Wayfinder owns the `wayfinder:*` labels.

Edit the right-hand column to match whatever vocabulary you actually use.
