# GIF: search and change a setting in /supi-settings.
Output "screenshots/supi-settings.gif"
Set Width 1400
Set Height 640
Source "screenshots/tapes/_setup.tape"
Type "/supi-settings"
Sleep 500ms
Enter
Sleep 2s
Down@400ms 4
Sleep 1s
Type@120ms "thinking"
Sleep 2s
Screenshot "/tmp/supi-screenshots/supi-settings.png"
Backspace 8
Sleep 1s
Tab
Sleep 2s
Escape
Sleep 1s
Source "screenshots/tapes/_teardown.tape"
