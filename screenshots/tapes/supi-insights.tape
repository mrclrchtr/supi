# Runs LLM facet extraction on real sessions. record.sh renders the HTML report
# into supi-insights-1.png and supi-insights-2.png afterwards.
Output "/tmp/supi-screenshots/supi-insights.gif"
Set Width 1400
Set Height 360
Source "screenshots/tapes/_setup.tape"
Type "/supi-insights"
Sleep 500ms
Enter
Wait+Screen@900s /report saved/
Sleep 2s
Screenshot "screenshots/supi-insights-cli.png"
Source "screenshots/tapes/_teardown.tape"
