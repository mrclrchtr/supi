# Compact codemode row: one script with nested code_health, code_resolve, and bash calls.
# The script lives in fixtures/codemode-health-check.txt.
Output "/tmp/supi-screenshots/supi-extras-codemode.gif"
Set Width 1400
Set Height 560
Source "screenshots/tapes/_setup.tape"
Type@20ms "Run the file screenshots/tapes/fixtures/codemode-health-check.txt verbatim with the codemode tool. Read it first, then pass its content unchanged as the code. Then reply with one short sentence."
Enter
Wait+Screen@120s /Done ·/
Sleep 8s
Screenshot "/tmp/supi-screenshots/supi-extras-codemode-full.png"
Source "screenshots/tapes/_teardown.tape"
