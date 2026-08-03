# Account for all Agent Run usage

Each Agent Run Outcome aggregates every PI Usage record billed inside its owned session: assistant turns, nested-model tool results, compaction, and branch-summary calls, preserving optional reasoning/cache and cost fields. The containing awaited tool reports that usage exactly once, preventing generic delegation from under-reporting work that direct-assistant-only collection would miss.
