Output "/tmp/supi-screenshots/supi-ci-status.gif"
Set Width 1600
Set Height 760
Source "screenshots/tapes/_setup.tape"
Sleep 10s
Type "/supi-ci-status"
Sleep 500ms
Enter
Sleep 5s
Screenshot "screenshots/supi-ci-status.png"
Source "screenshots/tapes/_teardown.tape"
