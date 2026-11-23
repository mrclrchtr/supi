# GIF: /supi-review from target selection to verdicts, with a Planner Draft.
Output "screenshots/supi-review.gif"
Set Width 1400
Set Height 680
Source "screenshots/tapes/_setup.tape"
Type "/supi-review"
Sleep 500ms
Enter
Wait+Screen /Review target/
Sleep 1s
Down@400ms 3
Enter
# Reviews the latest commit.
Wait+Screen /Commit/
Sleep 1.5s
Enter
Wait+Screen /Reviewer model/
Sleep 1s
Enter
Wait+Screen /Review Scope/
Sleep 1s
Enter
Wait+Screen /Review planning/
Sleep 1s
Down
Sleep 1s
Enter
Wait+Screen /Planner Draft/
Sleep 1s
Enter
Wait+Screen /Task 1 of/
Sleep 3s
Enter
Wait+Screen /Review Mode/
Sleep 1s
Enter
Wait+Screen /Task 2 of/
Sleep 3s
Enter
Wait+Screen /Review Mode/
Sleep 1s
Enter
Wait+Screen /Shared context/
Sleep 1s
Enter
Wait+Screen /Run review/
Sleep 2s
Enter
Wait+Screen /Reviewing/
Sleep 3s
# Skip the wait while reviewers run.
Hide
Wait+Screen@240s /(PASS|ISSUES|INCOMPLETE|FINDINGS)/
Sleep 1s
Ctrl+O
Sleep 1s
Show
Sleep 4s
Source "screenshots/tapes/_teardown.tape"
