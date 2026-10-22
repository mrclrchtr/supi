# Prompt Improvement

Prompt improvement helps the user prepare a request with less writing effort. It preserves the user's intent and remains separate from task execution and automatic prompt suggestions.

## Language

**Draft**:
The text the user confirms in the command's local input form. Confirmation transfers it to the main editor before improvement. It remains the original text until the user accepts a proposal; external writes and session changes take priority.
_Avoid_: Submitted request, prompt template

**Proposal**:
Replacement text offered for the user's review. Acceptance makes it the editor draft, not a submitted request.
_Avoid_: Ghost text, executed prompt

**Clarification**:
A focused question about missing user intent that can materially change the proposal. It is not a request for facts already available in the supplied context.

**Improvement session**:
The command-invoked interaction that collects a draft and ends with acceptance or dismissal of a proposal, an unchanged result, cancellation, or failure.
_Avoid_: Agent Run

**Improvement context**:
Available project guidance and recent conversation from the active session branch, supplied as background for a proposal. The draft controls intent when this background conflicts with it.
