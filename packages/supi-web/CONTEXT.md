# supi-web

Public web content and library documentation for PI.

See also: root `CONTEXT.md` (Extension Package, Agent-Facing).

## Language

**Web Search**:
A search for public web sources that returns titles, source URLs, and Source Excerpts. It does not produce an answer for the user.
_Avoid_: answer generation, research agent

**Source Excerpt**:
Partial text from a web source, returned with its source URL. It is not a full-page fetch or proof that the caller read the full page.
_Avoid_: full page, verified answer

**Freshness Filter**:
A restriction on Web Search sources by the page date selected by the search provider. This date can be a publication or modification date, so it does not guarantee original publication within the interval.
_Avoid_: publication-date guarantee, latest-only search
