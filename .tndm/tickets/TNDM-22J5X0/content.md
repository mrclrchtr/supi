Follow-up from the code-intelligence split-tool rollout. We observed stale TypeScript/LSP-style module-resolution diagnostics that cleared after explicit LSP recovery. Goal: improve SuPi-LSP's self-healing during real pi sessions so stale errors are less likely to surface or persist.

Current state:
- SuPi-LSP already rescans workspace sentinels, prunes missing files, refreshes diagnostics, and force-reopens files with likely stale module-resolution diagnostics.
- Stale diagnostics can still survive long enough to be shown inline after write/edit or across turns.
- Stronger recovery exists via workspace recovery / targeted restart, but it is not automatically escalated in the common stale-state path.

Desired follow-up direction:
1. Add immediate second-pass stale recovery after successful write/edit before final inline diagnostics are shown.
2. Add a recovery ladder that escalates from soft recovery + reopen to restartIfStillStale when the stale diagnostic fingerprint persists after workspace changes.
3. Consider broadening change triggers beyond sentinel files to source-file create/delete churn where practical.
4. Improve user-facing stale-diagnostic messaging so suspected stale state is distinguishable from real errors.

Important caveat: this ticket should optimize SuPi-LSP behavior inside pi sessions; it does not need to solve stale diagnostics emitted by external editor/harness LSPs outside SuPi-LSP's control.