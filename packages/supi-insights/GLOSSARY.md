# supi-insights

Analysis of past PI sessions: what the user worked on, how it went, and where tooling got in the way. It turns session history into a report for people and evidence for agents.

See also: root `GLOSSARY.md` (DevTool), `packages/supi-agent-runtime/GLOSSARY.md` (Agent Run Retrospective), `packages/supi-debug/GLOSSARY.md` (Tooling Retrospective).

## Language

**Session Facets**:
The structured assessment of one past session, derived from its transcript by a model: goal, outcome, user satisfaction, and friction.
_Avoid_: session summary, session metadata, insights

**Tooling Friction**:
An observation within Session Facets that a named tool, skill, prompt, or extension surface hindered the session, with a reference to where it happened.
_Avoid_: tool error, bug, workflow friction

**Retrospective Evidence**:
What is stored about past sessions for later improvement: Session Facets, Agent Run Retrospectives, and Tooling Retrospectives. Each source keeps its own form and producer ([ADR 0027](../../docs/adr/0027-retrospective-evidence-sources.md)).
_Avoid_: retro data, feedback pipeline, unified retrospective

**Insights Report**:
The shareable report for a person that aggregates session metrics and Retrospective Evidence across many sessions.
_Avoid_: dashboard, evidence snapshot, retrospective
