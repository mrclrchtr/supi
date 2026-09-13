---
name: research
description: Research a question with high-trust primary sources and save cited findings in a repository Markdown file. Use when the user requests research, documentation facts, or API facts.
---

# Research

Do the research in the current foreground task. Use primary sources and save one cited Markdown report in the repository.

## Process

1. Define the exact question and the evidence needed to answer it.
2. Find the repository's existing location and format for research notes. If none exists, select a clear location and state it.
3. Collect evidence from the source that owns each fact:
   - Use repository source and local documentation for repository facts.
   - Use the installed Pi documentation and examples for Pi behavior or APIs.
   - When available, use Context7 for focused third-party library documentation.
   - Use `gh` for GitHub content.
   - When available, use `web_fetch_md` for another public page.
   - When available, use `antigravity_run` only for synthesis, design advice, or an independent second opinion. Do not treat its answer as a primary source.
4. Follow important claims to the original specification, official documentation, source code, or first-party API.
5. Write one Markdown file with the question, findings, source citations, and unresolved gaps. Cite each material claim with a URL or repository path.
6. Report the saved path and a short result summary.

When `agent_run` is available, use a read-only profile only for an independent repository investigation. Agent Runs are foreground work and do not replace primary web sources.
