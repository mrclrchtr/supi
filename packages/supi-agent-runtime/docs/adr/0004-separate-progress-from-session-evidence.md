# Separate progress from session evidence

Agent Run Progress contains only immutable status, turn/tool counts, and usage; conversation text, tool arguments/results, and raw lifecycle events stay out of progress and normal diagnostics. Callers that deliberately need detailed evidence attach an Agent Run Observer through a read-only session view, letting review audit and the agents viewer own their distinct retention/privacy policies without exposing session lifecycle controls or making the runtime a transcript store.
