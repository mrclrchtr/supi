## REMOVED Requirements

### Requirement: supi-claude-md-refresh message renderer
**Reason**: `supi-claude-md-refresh` messages are no longer emitted because root/native context refresh is removed. Requiring an active renderer for a removed message type suggests the duplicate refresh behavior still exists.

**Migration**: Remove renderer registration and tests for `supi-claude-md-refresh`, or keep a non-normative compatibility renderer only if needed for historical sessions. The extension SHALL NOT create new messages of this type.

#### Scenario: New sessions do not require refresh renderer output
- **WHEN** the `supi-claude-md` extension starts in a new session
- **THEN** no `supi-claude-md-refresh` message SHALL be emitted
- **AND** no user-visible `📄 CLAUDE.md refreshed` renderer output SHALL be required

#### Scenario: Historical refresh messages are not model context
- **WHEN** a historical `supi-claude-md-refresh` message exists in session history
- **THEN** the context hook SHALL remove or ignore it before model context is built
- **AND** renderer compatibility, if retained, SHALL NOT restore `details.promptContent` into the prompt
