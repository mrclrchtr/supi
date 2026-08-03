# Bound delegation output in two lanes

Each task contributes at most 16,000 characters of final text to the parent model, while tool details and the viewer retain at most 50 KB per task for expanded Markdown; both lanes disclose truncation. This bounds four-way orchestration context without adding a continuation tool or persistent history, while preserving more human-inspectable output than the model-facing lane can safely carry.
