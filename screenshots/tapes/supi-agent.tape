# GIF: the model delegates a search with agent_run and uses the result.
Output "screenshots/supi-agent.gif"
Set Width 1400
Set Height 560
Source "screenshots/tapes/_setup.tape"
Type@25ms "Use agent_run in foreground mode with one explore task to find where the prompt stash is persisted, then answer in one sentence."
Sleep 500ms
Enter
Wait+Screen@180s /Agent Run finished/
Wait+Screen@60s /prompt-stash\.ts/
Sleep 5s
Source "screenshots/tapes/_teardown.tape"
