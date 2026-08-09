# supi-prompt-suggestions

Generates candidate user prompts after assistant responses for the user to accept, edit, ignore, or replace. Presents suggestions as ghost text in the PI editor.

See also: root `CONTEXT.md` for project-wide terms.

## Language

**Prompt suggestion**:
A generated candidate user prompt offered after an assistant response for the user to accept, edit, ignore, or replace. It is advisory and must not be treated as submitted input until the user accepts or sends it.
_Avoid_: next prompt, auto prompt, generated prompt, prefilled prompt

**Ghost text**:
A presentation of a prompt suggestion as dim inline preview text in the editor that is not part of the editor contents until accepted. Ghost text may truncate the visual preview for display, but accepting it inserts the underlying prompt suggestion rather than the truncated preview.
_Avoid_: treating ghost text as editor text, autocomplete item, prefill, treating visual truncation as prompt content

**Suppressed prompt suggestion**:
A ready prompt suggestion retained while its ghost text is hidden because the user entered editor text. It remains recoverable and is not an explicit dismissal.
_Avoid_: dismissed suggestion, cached suggestion

**Suggestion source**:
The component responsible for producing prompt suggestions. A suggestion source may be model-backed, heuristic, disabled, or test-only, and is distinct from PI model providers and autocomplete providers.
_Avoid_: suggestion provider, ghost text provider, model provider

**Scoped model set**:
The PI-configured set of models a SuPi feature may offer when it requires explicit model selection. A feature using this set should not silently widen to every available model or fall back to the current session model when it is outside the set.
_Avoid_: all models, unscoped picker, current-model fallback
