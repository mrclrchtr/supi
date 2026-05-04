---
name: supi-flow-slop-detect
description: Detect and fix AI-generated prose markers in documentation. Load on demand during /supi-flow-archive when updating docs.
disable-model-invocation: true
---

# Slop Detection

Scan documentation for AI-prose markers and fix them. Use during the archive phase after doc edits.

## Scan workflow

1. Read the edited documentation files
2. Scan for Tier 1-3 vocabulary markers and structural patterns (below)
3. For each hit: substitute with specific, grounded language
4. Re-read the fixed text — does it still say the same thing with better words?

**Principles:**
- Preserve meaning — change how it's said, not what's said
- Match context — technical docs need different fixes than narrative prose
- Be specific — replace abstract adjectives with concrete claims (version numbers, file paths, measurements)
- Prefer active voice — "it validates input" not "input is validated"
- Short paragraphs over long ones

## Tier 1: High-confidence markers (score 3 each)

| AI Word | Context | Replace with |
|---------|---------|-------------|
| delve | "delve into" | explore, examine, look at |
| tapestry | "rich tapestry" | mix, combination, variety |
| realm | "in the realm of" | in, within, regarding |
| embark | "embark on" | start, begin |
| leverage | business jargon | use, apply |
| robust | quality signal | solid, strong, reliable |
| seamless | integration claim | smooth, easy, simple |
| pivotal | importance marker | key, important |
| multifaceted | complexity signal | complex, varied |
| comprehensive | scope claim | thorough, complete |
| nuanced | sophistication signal | subtle, detailed |
| meticulous | care signal | careful, detailed |
| intricate | complexity marker | detailed, complex |
| showcasing | display verb | showing, displaying |
| streamline | optimization verb | simplify, improve |
| facilitate | enablement verb | enable, help, allow |
| utilize | formal "use" | use |

## Tier 2: Context-dependent markers (score 2 each)

| Category | Words |
|----------|-------|
| Transition overuse | moreover, furthermore, indeed, notably, subsequently |
| Intensity clustering | significantly, substantially, fundamentally, profoundly |
| Hedging stacks | potentially, typically, often, might, perhaps |
| Action inflation | revolutionize, transform, unlock, unleash, elevate |
| Empty emphasis | crucial, vital, essential, paramount |

## Tier 3: Phrase patterns (score 2-4)

| Phrase | Score | Replacement |
|--------|-------|-------------|
| "In today's fast-paced world" | 4 | Delete — start with the point |
| "It's worth noting that" | 3 | Delete — just state the thing |
| "At its core" | 2 | "Fundamentally" or delete |
| "Cannot be overstated" | 3 | "is important because [reason]" |
| "Navigate the complexities" | 4 | "handle", "work through" |
| "Unlock the potential" | 4 | "enable", "make possible" |
| "A testament to" | 3 | "shows", "demonstrates" |
| "Treasure trove of" | 3 | "collection", "set" |
| "Game changer" | 3 | Delete — be specific |
| "Ever-evolving landscape" | 4 | Delete — be specific |

## Structural red flags

- **Em dashes (—)**: >2 per 1000 words → replace with commas, periods, or colons
- **Tricolons**: "fast, efficient, and reliable" / "clear, concise, and compelling" → groups of three adjectives with similar sounds
- **Bullet ratio**: >40% of content as bullets → convert to prose
- **Sentence uniformity**: Low variance in sentence length → vary rhythm
- **Formulaic openers/closers**: "In conclusion", "To summarize", "As we can see" → delete
