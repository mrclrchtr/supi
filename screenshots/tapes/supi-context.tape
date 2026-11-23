# Tall capture; record.sh crops it to the report header.
Output "/tmp/supi-screenshots/supi-context.gif"
Set Width 1400
Set Height 2400
Source "screenshots/tapes/_setup.tape"
Type "Read package.json and tell me the package name in one short sentence."
Enter
Sleep 20s
Type "/supi-context"
Sleep 500ms
Enter
Sleep 4s
Screenshot "/tmp/supi-screenshots/supi-context-full.png"
Source "screenshots/tapes/_teardown.tape"
