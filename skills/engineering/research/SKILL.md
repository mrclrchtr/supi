---
name: research
description: Research a question with high-trust primary sources and save cited findings. Use when the user requests research, documentation facts, or API facts.
---

# Research

Do the research in the current foreground task. Use primary sources.

## Process

1. Define the exact question and the evidence needed to answer it.
2. Collect evidence from the source that owns each fact:
   - Use repository source and local documentation for repository facts.
   - Use the installed Pi documentation and examples for Pi behavior or APIs.
   - When available, use Context7 for focused third-party library documentation.
   - Use `gh` for GitHub content.
   - When available, use `web_fetch_md` for another public page.
   - When available, use `antigravity_run` only for synthesis, design advice, or an independent second opinion. Do not treat its answer as a primary source.
3. Follow important claims to the original specification, official documentation, source code, or first-party API.
4. Answer the question with cited findings and unresolved gaps. Cite each material factual claim with a URL or repository path.
5. Report the saved path and a short result summary.

When `agent_run` is available, use a read-only profile only for an independent repository investigation. Agent Runs are foreground work and do not replace primary web sources.
