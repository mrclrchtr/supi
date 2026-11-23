# GIF: one ask_user form with single choice, multi choice, text, and review.
# The form definition lives in fixtures/ask-user-form.json.
Output "screenshots/supi-ask-user.gif"
Set Width 1400
Set Height 760
Source "screenshots/tapes/_setup.tape"
Type@25ms "Read screenshots/tapes/fixtures/ask-user-form.json and pass it unchanged to ask_user."
Sleep 500ms
Enter
Wait+Screen@90s /Question 1\/3/
Sleep 2.5s
Down@700ms 2
Sleep 1.5s
Up@700ms 2
Sleep 1s
Enter
Wait+Screen /Question 2\/3/
Sleep 2s
Down@600ms 2
Space
Sleep 1.5s
Enter
Wait+Screen /Question 3\/3/
Sleep 2.5s
Enter
Wait+Screen /Review your answers/
Sleep 4s
Enter
Sleep 4s
Source "screenshots/tapes/_teardown.tape"
