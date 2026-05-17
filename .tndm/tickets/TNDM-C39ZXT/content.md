## Brainstorming Outcome

**Problem**: SuPi's public-facing texts use "opinionated" as the primary framing, which mischaracterizes the project (it's a collection of independent tools, not a prescriptive framework) and sounds exclusionary.

**Recommended approach**: Shift from "opinionated" to "curated" with a personal, generous voice. SuPi is a personal extension stack shared freely — not a blessed path.

**Key changes**:

| File | Change |
|------|--------|
| Root `README.md` hero section | "The opinionated way to extend PI." → "My curated extension stack for PI — shared in case they help you too." |
| Root `package.json` description | "The opinionated way to extend PI" → "A curated extension stack for PI" |
| `packages/supi/README.md` opener | "an opinionated bundle of production-ready extensions" → "my curated extension stack..." |
| `packages/supi/package.json` description | "The opinionated way to extend PI" → "A curated extension stack for PI" |
| `CLAUDE.md` first line | "an opinionated extension repo" → "a curated extension repo" |

**Tone guidelines**:
- Personal: "my curated stack," not "the curated stack"
- Generous: "shared in case they help you too," "happy to share"
- Not prescriptive: no suggestion of a "right way"

**Why**: "Opinionated" signals constraint and orthodoxy. SuPi is a modular collection of tools — users pick what they want. "Curated" is honest about the value (selection + quality) without the baggage.

**Constraints / non-goals**: Only change marketing-facing text. No code, no API, no structural changes. Leave the two incidental "opinionated" uses in skill template docs as-is (they're internal reference material).

**Open questions**: None.