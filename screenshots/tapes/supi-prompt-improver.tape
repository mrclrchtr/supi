# GIF: /supi-improve asks clarifying questions, then proposes a sharper prompt.
# The model chooses up to three questions. Tab steps through them with their
# recommended or default answers and stops on the review page; Enter submits.
# A vague draft makes clarification likely; re-record if the model proposes
# without asking.
Output "screenshots/supi-prompt-improver.gif"
Set Width 1400
Set Height 760
Source "screenshots/tapes/_setup.tape"
Type "/supi-improve make the tests faster"
Sleep 500ms
Enter
Wait+Screen /Improve a request draft/
Sleep 2s
Enter
Wait+Screen /Question 1\//
Sleep 3s
Tab
Sleep 2.5s
Tab
Sleep 2.5s
Tab
Sleep 1s
Tab
Wait+Screen /Review your answers/
Sleep 3s
Enter
Wait+Screen /Proposed draft/
Sleep 6s
Enter
Sleep 3s
Source "screenshots/tapes/_teardown.tape"
