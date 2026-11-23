# Also records supi-debug.png from the same session.
Output "/tmp/supi-screenshots/supi-cache-history.gif"
Set Width 1400
Set Height 560
Source "screenshots/tapes/_setup.tape"
Source "screenshots/tapes/_session.tape"
Type "/supi-cache-history"
Sleep 500ms
Enter
Sleep 3s
Screenshot "screenshots/supi-cache-history.png"
Sleep 1s
Type "/supi-debug limit=1 source=lsp"
Sleep 500ms
Enter
Sleep 2s
Ctrl+O
Sleep 2s
Screenshot "screenshots/supi-debug.png"
Source "screenshots/tapes/_teardown.tape"
