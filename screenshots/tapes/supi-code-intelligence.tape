# GIF: the agent maps a symbol with code_resolve and code_graph, then previews
# a rename with code_refactor_plan without changing files.
Output "screenshots/supi-code-intelligence.gif"
Set Width 1400
Set Height 760
Source "screenshots/tapes/_setup.tape"
Type@25ms "Use code_graph for references of signalAttention in packages/supi-ask-user, then preview (do not apply) a rename to notifyAttention with code_refactor_plan. Reply in one sentence."
Sleep 500ms
Enter
Wait+Screen@120s /code_refactor_plan/
Wait+Screen@60s /(rename|edits?|files?)/
Sleep 8s
Source "screenshots/tapes/_teardown.tape"
