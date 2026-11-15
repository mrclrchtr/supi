# CLAUDE.md Quality Criteria

## Scoring Rubric

### 1. Non-Obvious Commands & Workflows (15 points)

**15 points**: Non-obvious commands and workflow patterns captured with context
- Gotcha commands or required flags documented (e.g. `--unsafe`, `--runInBand`)
- Hook/pre-push behaviors, ordering requirements, or cross-tool workflows captured
- Routine install/build/test/lint commands are NOT counted toward this score

**12 points**: Most non-obvious commands/workflows present, some missing context

**8 points**: Only routine commands listed, no non-obvious patterns

**4 points**: Few or irrelevant commands

**0 points**: No commands or workflows documented

### 2. Architecture Clarity (15 points)

Score human architectural meaning, not inventories available from the complete first-turn overview or routine `code_orientation`.

**15 points**: Ownership, boundaries, initialization/data flow, important entry paths, and exceptions are clear where relevant

**12 points**: Useful architectural reasoning with minor gaps

**8 points**: Mostly static structure or module relationships already available through SuPi

**4 points**: Vague or incomplete

**0 points**: No useful architectural guidance

### 3. Non-Obvious Patterns (15 points)

**15 points**: Gotchas and quirks captured
- Known issues documented
- Workarounds explained
- Edge cases noted
- "Why we do it this way" for unusual patterns

**10 points**: Some patterns documented

**5 points**: Minimal pattern documentation

**0 points**: No patterns or gotchas

### 4. Conciseness (15 points)

**Hard cap: no instruction file should exceed 200 lines.** Above 200 lines the score is capped at 5/15 regardless of content quality; above 300 lines the score is 0/15. Every line past 200 must fight for its place against removal.

**15 points**: Every token earns its place — file is ≤200 lines
- No filler, obvious info, or unnecessary content; every token saves more time than it costs to read
- Each line adds value that isn't trivially discoverable elsewhere
- No redundancy with code comments, package.json, or README
- Routine commands already removed or never present

**10 points**: Mostly concise, some padding — file is ≤200 lines

**5 points**: Over 200 lines, or verbose with significant padding

**0 points**: Over 300 lines, or mostly filler / restates obvious code

### 5. Currency (15 points)

**15 points**: Reflects current codebase
- Commands work as documented
- File references accurate
- Tech stack current

**10 points**: Mostly current, minor staleness

**5 points**: Several outdated references

**0 points**: Severely outdated

### 6. Actionability (15 points)

**15 points**: Instructions are executable
- Commands can be copy-pasted
- Steps are concrete
- Paths are real

**10 points**: Mostly actionable

**5 points**: Some vague instructions

**0 points**: Vague or theoretical

### 7. SuPi Context Overlap (10 points)

Score after comparing the file with the complete first-turn code-intelligence overview, native PI context, and workspace/directory/file Orientation. Assume `code_orientation` is used repeatedly with adequate `maxResults` or narrower focuses.

**10 points**: Almost no overlap; mentions of discoverable files/packages carry human-only reasoning.

**7 points**: Some static overlap remains, but the section primarily adds ownership, boundaries, flow, exceptions, or concise "start here" guidance.

**4 points**: Significant overlap—package/path tables, static project trees, manifest declarations, or dependency graphs should be compressed.

**0 points**: Large sections are generated inventories with no human-only meaning.

**Package-specific files:** Compare the file's contents with the non-instruction sections returned by focused Orientation. Do not penalize the file merely because Orientation surfaces it; that is the delivery mechanism. Score only whether its contents duplicate direct entries, package manifest facts, dependencies, or source observations.

**What is NOT overlap:** Gotchas; non-obvious commands/workflows; ownership and boundary rules; initialization/data flow; project-specific exceptions; and curated navigation with reasoning.

**What IS overlap:** Module/package tables; package paths; direct file/directory listings; manifest entrypoint/dependency tables; source-symbol inventories; static trees reproducible through repeated Orientation; and architecture prose that adds no meaning beyond those facts.

## Assessment Process

1. For a repo-wide check, run workspace Orientation first. For a targeted change, start with focused directory/file Orientation. Use workspace Orientation only when the edit checks repo-wide facts. Repeat or raise `maxResults` as needed.
2. Read the CLAUDE.md file completely.
3. Classify sections against the first-turn overview, native PI context, and Orientation as **fully redundant**, **partially redundant**, or **unique**.
4. Cross-reference with the codebase: test non-obvious commands, check paths, and verify human architectural claims.
5. Score each criterion, calculate the total, assign the grade, list issues, and propose concrete improvements.

## Red Flags

Watch for failing commands, deleted paths, outdated versions, generic advice, stale TODOs, duplicate instructions, and static inventories already supplied by the first-turn overview or routine Orientation. Split any human-only ownership/flow/exception guidance from the removable inventory around it.
