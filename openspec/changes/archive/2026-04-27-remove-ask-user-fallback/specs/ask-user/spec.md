## REMOVED Requirements

### Requirement: Fallback SHALL provide reduced compatibility for the redesigned contract
When rich custom UI is unavailable, the extension SHALL provide a reduced fallback path for the redesigned questionnaire contract. The fallback path MAY flatten previews or simplify advanced interactions, but it SHALL either preserve the core answer semantics or return an explicit unsupported/degraded response instead of silently changing the meaning of the questionnaire.

#### Scenario: Fallback preserves core choice semantics
- **WHEN** a supported questionnaire is executed without rich custom UI
- **THEN** the fallback path still returns structured answers using the redesigned result model

#### Scenario: Unsupported fallback combination fails explicitly
- **WHEN** a questionnaire depends on an advanced rich-only affordance that fallback cannot represent safely
- **THEN** the extension reports explicit degraded or unsupported behavior instead of silently inventing a different flow

**Reason**: Pi's TUI has been stable and every supported environment provides `ctx.ui.custom()`. The fallback path (`ui-fallback.ts`) added ~300 lines of dead code and ~200 lines of tests for a compatibility surface with no known consumers.

**Migration**: None required. The extension now returns an explicit error when `custom()` is unavailable, instructing the agent not to use `ask_user` in non-interactive or degraded UI sessions. All existing rich overlay behavior is unchanged.
