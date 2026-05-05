---
name: supi-flow-slop-detect
description: Detect and fix AI-generated prose markers in documentation. Load on demand during /supi-flow-archive when updating docs.
---

# Slop Detection

Scan documentation for AI-prose markers and fix them. Use during the archive phase after doc edits.

## Scan workflow

1. Read the edited documentation files
2. Classify each file: technical doc, narrative prose, or code comment (affects scoring)
3. Scan for vocabulary markers (Tiers 1-4) and structural patterns (below)
4. For each hit: substitute with specific, grounded language
5. Re-read the fixed text — does it still say the same thing with better words?
6. Re-scan to confirm score dropped below threshold

**Principles:**
- Preserve meaning — change how it's said, not what's said
- Match context — technical docs need different fixes than narrative prose
- Be specific — replace abstract adjectives with concrete claims (version numbers, file paths, measurements)
- Prefer active voice — "it validates input" not "input is validated"
- Short paragraphs over long ones
- Never change code — only edit prose/docstrings/comments

## Vocabulary markers

### Tier 1: High-confidence markers (score 3 each)

| AI Word | Context | Replace with |
|---------|---------|-------------|
| delve | "delve into" | explore, examine, look at |
| tapestry | "rich tapestry" | mix, combination, variety |
| realm | "in the realm of" | in, within, regarding |
| embark | "embark on a journey" | start, begin |
| beacon | "a beacon of" | example, model |
| spearheaded | formal attribution | led, started |
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

### Tier 2: Context-dependent markers (score 2 each)

| Category | Words |
|----------|-------|
| Transition overuse | moreover, furthermore, indeed, notably, subsequently |
| Intensity clustering | significantly, substantially, fundamentally, profoundly |
| Hedging stacks | potentially, typically, often, might, perhaps |
| Action inflation | revolutionize, transform, unlock, unleash, elevate |
| Empty emphasis | crucial, vital, essential, paramount |

### Tier 3: Phrase patterns (score 2-4)

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
| "Look no further" | 4 | Delete — state the answer |
| "Hustle and bustle" | 3 | Delete — filler |

### Tier 4: Sycophantic markers (score 2 each)

Especially relevant in conversational or instructional content.

| Phrase | Issue |
|--------|-------|
| "I'd be happy to" | Servile opener |
| "Great question!" | Empty validation |
| "Absolutely!" | Over-agreement |
| "That's a wonderful point" | Flattery |
| "I'm glad you asked" | Filler |
| "You're absolutely right" | Sycophancy |

These phrases add no information and signal generated content.

## Structural patterns

### Em dash density

Count em dashes (—) per 1000 words:

| Density | Signal |
|---------|--------|
| 0-2 | Normal |
| 3-5 | Elevated — review |
| 6+ | Strong AI signal — replace with commas, periods, colons |

```bash
# Count em dashes in a file
grep -o '—' file.md | wc -l
```

### Tricolon detection

AI loves groups of three adjectives with alliteration or similar sounds:
- "fast, efficient, and reliable" → pick the most accurate one
- "clear, concise, and compelling" → "clear and concise"
- "robust, reliable, and resilient" → "reliable"

Pattern: `adjective, adjective, and adjective` with similar sounds. Flag when >1 per 500 words.

### Sentence length clustering

AI clusters sentences in the 15-25 word range. Human writing varies from 3-word fragments to 40+ word complex sentences. AI avoids both extremes.

Check: if >70% of sentences fall in 15-25 word range → strong AI signal. Vary rhythm by adding short punchy sentences and occasional long ones.

### Paragraph symmetry

AI produces "blocky" text with uniform paragraph lengths. If most paragraphs cluster around the same word count (e.g., 40-60 words each) → flag. Break symmetry: vary paragraph length, use single-sentence paragraphs for emphasis.

### Bullet-to-prose ratio

| Ratio | Signal |
|-------|--------|
| 0-30% | Normal |
| 30-50% | Elevated |
| 50-70% | High — convert some to prose |
| 70%+ | Very high AI signal — major rewrite needed |

Emoji-led bullets (e.g., `✅`, `❌`, `🔴`) in technical documentation are a strong AI tell.

### Five-paragraph essay structure

AI defaults to: intro paragraph + three body sections + conclusion that restates intro. Check for:
1. Opening paragraph that restates the question
2. Three distinct middle sections
3. Closing paragraph that summarizes without adding new information

If detected: cut the intro and conclusion. Start at the first paragraph with actual content.

### Participial phrase tail-loading

AI appends present participial (-ing) phrases to sentence ends at 2-5x the human rate.

Pattern: `[Main clause], [present participle] [detail].`

Examples (all AI signals):
- "The framework processes requests, **enabling** developers to scale."
- "The policy was implemented, **marking** a shift in approach."
- "She published findings, **contributing** to the body of research."

Fix: split into two sentences or restructure. 3+ in a paragraph → rewrite.

### "From X to Y" range construction

AI uses this template to express scope at much higher rates:
- "From beginners to experts"
- "From simple scripts to complex applications"

Flag when >1 per 500 words. Replace with direct statement: "works for all skill levels."

### Correlative conjunction overuse

AI over-relies on correlative pairs in close proximity:

| Pattern | Example |
|---------|---------|
| "not only...but also" | "not only improves X, but also Y" |
| "whether...or" | "whether you're a beginner or expert" |
| "not just...but" | "not just a tool, but a platform" |

2+ correlative pairs in the same paragraph → flag.

### Colon addiction and semicolon avoidance

AI uses colons to introduce explanations at 3-5x the human rate. Meanwhile, AI rarely uses semicolons. The ratio of em dashes to semicolons is skewed compared to human writing.

Check: if em dashes > 5 and semicolons = 0 → strong AI signal.

### ASCII arrow prose connectors

AI uses `->` and `→` as prose shorthand instead of writing "to", "into", or "produces". Arrows are fine in code, type signatures, and diagrams but mark AI-generated prose.

- "spec -> plan -> tasks" (slop) → "spec to plan to tasks" (human)
- "returns `int -> str`" (fine, code context)

```bash
# Detect arrows in prose (exclude code blocks)
awk '/^```/{c=!c}!c' file.md | grep -oP '\s->\s|→' | wc -l
```

### Plus-sign conjunction

AI uses `+` as a conjunction ("X + Y") in prose instead of "and" or "with". Fine in code, math, and labels.

- "hooks + skills" (slop) → "hooks and skills" (human)
- "1 + 1 = 2" (fine, math)

Flag when >1 prose plus-sign appears outside code blocks.

### Conclusion mirroring

AI introductions and conclusions are near-paraphrases of each other. If the first and last paragraphs express the same idea using different words → cut the conclusion. Human writing ends with specifics, callbacks, questions, or simply stops.

### Perfect grammar signals

| Pattern | Human Range | AI Signal |
|---------|-------------|-----------|
| Contractions (don't, can't, it's) | Common | Rare/absent |
| Oxford commas | Variable | Always present |
| Typos | Occasional | None |
| Sentence fragments | Present | Rare |
| Starting sentences with "And" or "But" | Common | Rare |
| Register shifts (formal ↔ casual) | Present | Uniform |

Too-perfect grammar with no contractions, no fragments, uniform register → suspicious.

## Density scoring

```
vocab_score = (tier1_count × 3 + tier2_count × 2 + tier4_count × 2 + phrase_count × avg_phrase_score) / word_count × 100

structural_score:
  +2 if em_dash_density > 5
  +2 if sentence_cluster_ratio > 0.7
  +2 if bullet_ratio > 0.5
  +2 if paragraph_uniformity detected
  +3 if emoji_bullets present
  +2 if participial_tail_count > 3 in 500 words
  +2 if 5-paragraph-essay structure detected
  +1 if correlative_pairs > 2
  +1 if arrow_connectors > 0
  +1 if plus_conjunctions > 1
  +1 if em_dashes > 5 AND semicolons = 0
  +1 if conclusion_mirroring detected

final_score = vocab_score + structural_score (cap at 10)
```

| Score | Rating | Action |
|-------|--------|--------|
| 0-1.0 | Clean | No action needed |
| 1.0-2.5 | Light | Spot remediation — fix individual markers |
| 2.5-5.0 | Moderate | Section rewrite recommended |
| 5.0+ | Heavy | Full document review — do not commit |

Target: score < 1.5 before committing documentation.
