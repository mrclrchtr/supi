# Design It Twice

When the user wants to explore alternative interfaces for a chosen deepening candidate, use parallel isolated SuPi reviews. This follows "Design It Twice" (Ousterhout): your first idea is unlikely to be the best.

Uses the vocabulary in [SKILL.md](SKILL.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before you run the isolated reviews, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the reviews run in parallel.

### 2. Run isolated design reviews

Call `supi_review_run` once with `direct`, a `currentState` target scoped to the candidate paths, and three or four tasks. Put the shared technical brief in `sharedContext`: file paths, coupling details, the dependency category from [DEEPENING.md](DEEPENING.md), and what sits behind the seam. Each task must inspect without changing files and produce a **radically different** interface.

Give each task a different constraint:

- Task 1: "Minimize the interface. Use no more than 1–3 entry points. Maximize leverage per entry point."
- Task 2: "Maximize flexibility. Support many use cases and extension."
- Task 3: "Optimize for the most common caller. Make the default case trivial."
- Task 4, when applicable: "Design around ports and adapters for cross-seam dependencies."

Include both [SKILL.md](SKILL.md) vocabulary and `CONTEXT.md` vocabulary in the brief so each task uses the project's architecture and domain language. If `supi_review_run` is unavailable, produce the designs sequentially in the current session and state that isolated review was unavailable.

Each task outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
