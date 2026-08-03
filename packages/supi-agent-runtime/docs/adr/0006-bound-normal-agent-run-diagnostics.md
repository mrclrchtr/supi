# Bound normal Agent Run diagnostics

Normal non-success outcomes retain only bounded allowlisted lifecycle metadata, counts, safe stop/tool names, and redacted canonical provider-error summaries. Conversation, repository evidence, tool arguments, and tool results remain absent; adapters that deliberately need evidence use an Agent Run Observer and own their separate consent, retention, and presentation policy.
