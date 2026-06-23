# Task 5: Severity-branching follow-up instruction for review results

Replace `buildReviewFollowUpInstruction()` with severity-branching logic.

Count findings by priority and produce tailored text:

| Condition | Behavior |
|---|---|
| ≥1 critical (priority 3) | Urgent: "⚠️ {n} critical finding(s). Urge the user to fix before merging." Options: Fix all, Fix critical only, Done |
| ≥1 major (priority 2), 0 critical | Standard: existing options (Done, Fix all, Fix selected, Verify) |
| 0 critical, 0 major | Light: "Only minor/info suggestions. Ask whether to apply or skip." |
| "patch is correct" + findings exist | Note the contradiction, ask whether to apply suggestions |

Keep the header text ("A code review just completed...") shared across all branches.

**TDD:** Write unit tests covering each branch:
- Critical findings → urgent message
- Major + no critical → standard message
- Info-only → light message
- Patch-is-correct with findings → contradiction note
- No findings → no follow-up (already tested by `maybeQueueReviewFollowUp`)
